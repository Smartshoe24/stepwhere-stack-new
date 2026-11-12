import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { createAuthMiddleware } from "better-auth/api";
import { APIError, betterAuth } from "better-auth";
import {
  admin as adminPlugin,
  bearer,
  emailOTP,
  organization,
  phoneNumber,
} from "better-auth/plugins";
import { and, count, eq, isNotNull, ne } from "drizzle-orm";

import { env } from "../config/env";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { sendSmsOtp } from "./twilio";
import {
  finalizeVerifiedPhoneAuthChallenge,
  getValidatedPhoneAuthChallengeFromHeaders,
} from "../modules/auth/auth-challenges.service";
import { assertPhonePreviewAccess } from "../modules/preview-access/preview-access.service";
import { isAppError } from "../shared/errors";
import { applyPlayReviewPhoneOtp } from "../modules/play-review/play-review-access.service";
import { restoreAccountDeletionOnSignin } from "../modules/account-deletion/account-deletion.service";

function toTrustedOrigins() {
  const origins = new Set<string>([
    env.BETTER_AUTH_URL,
    ...env.BETTER_AUTH_TRUSTED_ORIGINS,
    "app://",
    "app://*",
    "stepwhere://",
    "stepwhere://*",
    "stepwhere-dev://",
    "stepwhere-dev://*",
  ]);

  if (env.NODE_ENV === "development") {
    origins.add("exp://");
    origins.add("exp://**");
  }

  return [...origins];
}

function toAllowedAdminAuthOrigins() {
  const origins = new Set(env.ADMIN_AUTH_ALLOWED_ORIGINS);

  if (env.NODE_ENV !== "production") {
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4800",
      "http://127.0.0.1:4800",
    ]) {
      origins.add(origin);
    }
  }

  return origins;
}

function isAllowedAdminAuthOrigin(headers: Headers | undefined) {
  const origin = headers?.get("origin");

  if (!origin) {
    return false;
  }

  return toAllowedAdminAuthOrigins().has(origin);
}

function assertAdminAuthOrigin(headers: Headers | undefined) {
  if (isAllowedAdminAuthOrigin(headers)) {
    return;
  }

  throw new APIError("FORBIDDEN", {
    code: "ADMIN_AUTH_ORIGIN_FORBIDDEN",
    message: "Admin email authentication is not allowed from this origin.",
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function toBodyRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? body as Record<string, unknown>
    : {};
}

async function assertBetterAuthPreviewAccess(phoneNumber: string) {
  try {
    await assertPhonePreviewAccess(phoneNumber);
  } catch (error) {
    if (isAppError(error) && error.code === "PREVIEW_ACCESS_REQUIRED") {
      throw new APIError("FORBIDDEN", {
        code: error.code,
        message: error.message,
      });
    }

    throw error;
  }
}

function emailAdminCredentialJoinCondition() {
  return and(
    eq(schema.accounts.userId, schema.users.id),
    eq(schema.accounts.providerId, "credential"),
    isNotNull(schema.accounts.password),
  );
}

async function isEmailAdminUser(userId: string) {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.accounts, emailAdminCredentialJoinCondition())
    .where(and(eq(schema.users.id, userId), eq(schema.users.role, "admin")))
    .limit(1);

  return Boolean(row);
}

async function isAdminUser(userId: string) {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.role, "admin")))
    .limit(1);

  return Boolean(row);
}

function rejectEmailSignUp(): never {
  // The first admin is created by the first-run setup (POST /v1/admin/setup,
  // which needs ADMIN_SETUP_CODE); there is no open email sign-up.
  throw new APIError("FORBIDDEN", {
    code: "ADMIN_SIGNUP_DISABLED",
    message: "Email sign-up is disabled. Use the admin setup screen.",
  });
}

function includesAdminRole(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => includesAdminRole(entry));
  }

  if (typeof value !== "string") {
    return false;
  }

  return value
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .includes("admin");
}

function rejectAdditionalEmailAdmin() {
  throw new APIError("FORBIDDEN", {
    code: "SINGLE_EMAIL_ADMIN_REQUIRED",
    message: "Stepwhere supports a single email admin account.",
  });
}

async function assertBetterAuthAdminMutationKeepsSingleEmailAdmin(ctx: {
  body?: Record<string, unknown>;
  path: string;
}) {
  if (ctx.path === "/admin/create-user" && includesAdminRole(ctx.body?.role)) {
    rejectAdditionalEmailAdmin();
  }

  if (ctx.path === "/admin/set-role" && includesAdminRole(ctx.body?.role)) {
    rejectAdditionalEmailAdmin();
  }

  if (
    ctx.path === "/admin/update-user" &&
    includesAdminRole(
      (ctx.body?.data as Record<string, unknown> | undefined)?.role,
    )
  ) {
    rejectAdditionalEmailAdmin();
  }

  if (
    ctx.path === "/admin/set-user-password" &&
    typeof ctx.body?.userId === "string"
  ) {
    const userId = ctx.body.userId;
    if ((await isAdminUser(userId)) && !(await isEmailAdminUser(userId))) {
      rejectAdditionalEmailAdmin();
    }
  }
}

async function assertEmailSignInUserIsAdmin(email: string) {
  const [row] = await db
    .select({
      role: schema.users.role,
      status: schema.users.status,
      banned: schema.users.banned,
      credentialAccountId: schema.accounts.id,
    })
    .from(schema.users)
    .leftJoin(schema.accounts, emailAdminCredentialJoinCondition())
    .where(eq(schema.users.email, normalizeEmail(email)))
    .limit(1);

  if (!row) {
    return;
  }

  if (row.role !== "admin" || !row.credentialAccountId) {
    throw new APIError("UNAUTHORIZED", {
      message: "Invalid email or password.",
    });
  }

  if (row.status !== "active" || row.banned) {
    throw new APIError("FORBIDDEN", {
      message: "Admin account is not active.",
    });
  }
}

export const auth = betterAuth({
  appName: "Stepwhere",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: toTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.organizationInvitations,
    },
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    // The initial admin comes from the first-run setup (modules/admin-setup).
    disableSignUp: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = toBodyRecord(ctx.body);

      await assertBetterAuthAdminMutationKeepsSingleEmailAdmin({
        body,
        path: ctx.path,
      });

      if (ctx.path === "/sign-up/email") {
        rejectEmailSignUp();
      }

      if (ctx.path === "/sign-in/email") {
        assertAdminAuthOrigin(ctx.headers);
        const email = typeof body.email === "string" ? body.email : "";

        if (email) {
          await assertEmailSignInUserIsAdmin(email);
        }

        return;
      }

      if (ctx.path === "/sign-in/social") {
        throw new APIError("FORBIDDEN", {
          code: "SOCIAL_SIGN_IN_DISABLED",
          message: "Use phone number authentication to sign in.",
        });
      }

      if (
        ctx.path !== "/phone-number/send-otp" &&
        ctx.path !== "/phone-number/verify"
      ) {
        return;
      }

      const phoneNumber =
        typeof body.phoneNumber === "string" ? body.phoneNumber : "";

      if (!phoneNumber) {
        throw new APIError("BAD_REQUEST", {
          message: "Phone number is required.",
        });
      }

      await assertBetterAuthPreviewAccess(phoneNumber);

      try {
        await getValidatedPhoneAuthChallengeFromHeaders(
          ctx.headers ?? new Headers(),
          phoneNumber,
        );
      } catch (error) {
        if (error instanceof Error) {
          throw new APIError("BAD_REQUEST", {
            message: error.message,
          });
        }

        throw error;
      }
    }),
  },
  user: {
    modelName: "users",
    additionalFields: {
      role: {
        type: ["user", "admin"],
        required: false,
        defaultValue: "user",
        input: false,
      },
      status: {
        type: ["active", "suspended"],
        required: false,
        defaultValue: "active",
        input: false,
      },
      onboardingCompleted: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      lastSeenAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    modelName: "sessions",
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  account: {
    modelName: "accounts",
  },
  plugins: [
    adminPlugin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    bearer(),
    expo(),
    emailOTP({
      disableSignUp: true,
      expiresIn: 60 * 5,
      otpLength: 6,
      rateLimit: {
        max: 5,
        window: 60,
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (env.NODE_ENV === "production") {
          throw new Error("Email OTP delivery provider is not configured yet.");
        }

        console.info(`[better-auth] Email OTP (${type}) for ${email}: ${otp}`);
      },
      storeOTP: "hashed",
    }),
    organization({
      allowUserToCreateOrganization: false,
      organizationLimit: 1,
      membershipLimit: 4,
      creatorRole: "admin",
      disableOrganizationDeletion: true,
      organizationHooks: {
        beforeAddMember: async ({ member, organization }) => {
          const normalizedRoles = String(member.role)
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);

          const invalidRoles = normalizedRoles.filter(
            (role) => role !== "admin" && role !== "member",
          );

          if (invalidRoles.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: `Unsupported family role: ${invalidRoles.join(", ")}`,
            });
          }

          if (normalizedRoles.includes("admin")) {
            const [existingAdmin] = await db
              .select({ total: count() })
              .from(schema.members)
              .where(
                and(
                  eq(schema.members.organizationId, organization.id),
                  eq(schema.members.role, "admin"),
                ),
              );

            if ((existingAdmin?.total ?? 0) > 0) {
              throw new APIError("BAD_REQUEST", {
                message: "Family already has an admin.",
              });
            }
          }

          if (normalizedRoles.includes("member")) {
            const [existingMembers] = await db
              .select({ total: count() })
              .from(schema.members)
              .where(
                and(
                  eq(schema.members.organizationId, organization.id),
                  eq(schema.members.role, "member"),
                ),
              );

            if ((existingMembers?.total ?? 0) >= 3) {
              throw new APIError("BAD_REQUEST", {
                message: "Family member limit reached.",
              });
            }
          }
        },
        beforeUpdateMemberRole: async ({ member, newRole, organization }) => {
          if (newRole !== "admin" && newRole !== "member") {
            throw new APIError("BAD_REQUEST", {
              message: "Unsupported family role.",
            });
          }

          if (newRole === "admin") {
            const [otherAdmin] = await db
              .select({ total: count() })
              .from(schema.members)
              .where(
                and(
                  eq(schema.members.organizationId, organization.id),
                  eq(schema.members.role, "admin"),
                  ne(schema.members.id, member.id),
                ),
              );

            if ((otherAdmin?.total ?? 0) > 0) {
              throw new APIError("BAD_REQUEST", {
                message: "Family already has an admin.",
              });
            }
          }

          if (newRole === "member" && member.role === "admin") {
            const [otherAdmins] = await db
              .select({ total: count() })
              .from(schema.members)
              .where(
                and(
                  eq(schema.members.organizationId, organization.id),
                  eq(schema.members.role, "admin"),
                  ne(schema.members.id, member.id),
                ),
              );

            if ((otherAdmins?.total ?? 0) === 0) {
              throw new APIError("BAD_REQUEST", {
                message: "Family must keep one admin.",
              });
            }
          }

          return {
            data: {
              role: newRole,
            },
          };
        },
      },
    }),
    phoneNumber({
      allowedAttempts: 5,
      otpLength: 6,
      expiresIn: 60 * 5,
      requireVerification: true,
      phoneNumberValidator: (phoneNumber) =>
        /^\+[1-9]\d{7,14}$/.test(phoneNumber),
      sendOTP: async ({ phoneNumber, code }) => {
        if (await applyPlayReviewPhoneOtp(phoneNumber)) {
          return;
        }

        await sendSmsOtp({ phoneNumber, code });
      },
      callbackOnVerification: async ({ user }, ctx) => {
        try {
          await finalizeVerifiedPhoneAuthChallenge(
            ctx?.headers ?? new Headers(),
            user.id,
          );
          await restoreAccountDeletionOnSignin(user.id);
        } catch (error) {
          if (isAppError(error)) {
            throw new APIError(error.status === 403 || error.status === 410 ? "FORBIDDEN" : "BAD_REQUEST", {
              code: error.code,
              message: error.message,
            });
          }

          if (error instanceof Error) {
            throw new APIError("BAD_REQUEST", {
              message: error.message,
            });
          }

          throw error;
        }
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber) =>
          `${phoneNumber.replace(/\D/g, "")}@phone.stepwhere.local`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
  ],
});
