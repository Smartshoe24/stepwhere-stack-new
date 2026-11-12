import { createRoute, z } from "@hono/zod-openapi";
import type { AuthSessionDto } from "@stepwhere/types";

import type { AppBindings } from "../../app-types";
import { auth } from "../../infrastructure/better-auth";
import { createOpenApiApp } from "../../openapi/create-app";
import { AuthSessionSchema, GenericObjectSchema, UserProfileSchema, VerifyGoogleEmailInputSchema } from "../../openapi/schemas";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { ok } from "../../shared/http";
import { isAppError, unauthorized } from "../../shared/errors";
import {
  finalizeSigninRecoveryChallenge,
  getPhoneAuthChallengeHeaderName,
  getValidatedSigninRecoveryChallenge,
  prepareOtp,
  startSigninRecovery,
} from "./auth-challenges.service";
import {
  buildRequestHeadersFromSetCookie,
  getCookieNamesFromCookieHeader,
  getCookieNamesFromSetCookieHeader,
} from "./auth-cookie-headers";
import { verifyGoogleEmailForUser } from "./google-email.service";
import { getUserProfile } from "../users/users.service";
import {
  assertAccountAccessAllowed,
  restoreAccountDeletionOnSignin,
} from "../account-deletion/account-deletion.service";

const requestOtpSchema = z.object({
  phoneNumber: z.string().trim().min(1),
});

const prepareOtpSchema = z.object({
  phoneNumber: z.string().trim().min(1),
});

const verifyOtpSchema = z.object({
  phoneNumber: z.string().trim().min(1),
  code: z.string().trim().length(6),
  challengeToken: z.string().trim().min(1),
});

const startSigninRecoverySchema = z.object({
  phoneNumber: z.string().trim().min(1),
});

const verifySigninRecoverySchema = z.object({
  challengeToken: z.string().trim().min(1),
  code: z.string().trim().length(6),
  phoneNumber: z.string().trim().min(1),
});

function applyAuthHeaders(target: Headers, source?: Headers) {
  if (!source) {
    return;
  }

  source.forEach((value, key) => {
    if (key.toLowerCase() === "content-type") {
      return;
    }

    target.append(key, value);
  });
}

function isAuthDebugEnabled() {
  return process.env.NODE_ENV !== "production";
}

function logAuthDebug(message: string, data: Record<string, unknown>) {
  if (!isAuthDebugEnabled()) {
    return;
  }

  console.info(`[auth] ${message}`, data);
}

async function buildSessionDto(headers: Headers): Promise<AuthSessionDto> {
  const session = await auth.api.getSession({ headers });

  if (!session?.session || !session.user) {
    return {
      token: null,
      expiresAt: null,
      user: null,
    };
  }
  try {
    await assertAccountAccessAllowed(session.user.id);
  } catch (error) {
    if (
      isAppError(error)
      && (error.code === "ACCOUNT_DELETION_PENDING" || error.code === "ACCOUNT_DELETION_FINALIZING")
    ) {
      return {
        token: null,
        expiresAt: null,
        user: null,
      };
    }
    throw error;
  }

  const user = await getUserProfile(session.user.id, {
    headers,
    activeOrganizationId: session.session.activeOrganizationId ?? null,
  });

  return {
    token: session.session.token,
    expiresAt: session.session.expiresAt.toISOString(),
    user,
  };
}

const requestOtpRoute = createRoute({
  method: "post",
  path: "/auth/request-otp",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: requestOtpSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(GenericObjectSchema, "OTP requested."),
    ...errorResponses([400, 403]),
  },
});

const verifyOtpRoute = createRoute({
  method: "post",
  path: "/auth/verify-otp",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: verifyOtpSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AuthSessionSchema, "OTP verified."),
    ...errorResponses([400, 401, 403]),
  },
});

const prepareOtpRoute = createRoute({
  method: "post",
  path: "/auth/prepare-otp",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: prepareOtpSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(z.object({
      challengeToken: z.string(),
      expiresAt: z.string().datetime(),
      intent: z.enum(["signin", "signup"]),
      phoneNumber: z.string(),
      resendAvailableAt: z.string().datetime(),
    }), "OTP challenge prepared."),
    ...errorResponses([400, 403, 409]),
  },
});

const startSigninRecoveryRoute = createRoute({
  method: "post",
  path: "/auth/signin-recovery/start",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: startSigninRecoverySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(z.object({
      challengeToken: z.string(),
      expiresAt: z.string().datetime(),
      maskedEmail: z.string(),
      resendAvailableAt: z.string().datetime(),
    }), "Sign-in recovery challenge prepared."),
    ...errorResponses([400, 403, 409]),
  },
});

const verifySigninRecoveryRoute = createRoute({
  method: "post",
  path: "/auth/signin-recovery/verify",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: verifySigninRecoverySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(AuthSessionSchema, "Sign-in recovery verified."),
    ...errorResponses([400, 401, 403]),
  },
});

const signOutRoute = createRoute({
  method: "post",
  path: "/auth/sign-out",
  tags: ["Auth"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: jsonDataResponse(GenericObjectSchema, "Signed out."),
    ...errorResponses([401]),
  },
});

const sessionRoute = createRoute({
  method: "get",
  path: "/auth/session",
  tags: ["Auth"],
  responses: {
    200: jsonDataResponse(AuthSessionSchema, "Current session."),
  },
});

const verifyGoogleEmailRoute = createRoute({
  method: "post",
  path: "/auth/google-email/verify",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: VerifyGoogleEmailInputSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(UserProfileSchema, "Google email verified."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const authRoutes = createOpenApiApp();

authRoutes.openapi(requestOtpRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await prepareOtp({
    phoneNumber: body.phoneNumber,
  }, c.req.raw.headers);

  return ok(c, result);
});

authRoutes.openapi(prepareOtpRoute, async (c) => {
  const body = c.req.valid("json");
  return ok(c, await prepareOtp(body, c.req.raw.headers));
});

authRoutes.openapi(startSigninRecoveryRoute, async (c) => {
  const body = c.req.valid("json");
  return ok(c, await startSigninRecovery(body, c.req.raw.headers));
});

authRoutes.openapi(verifyOtpRoute, async (c) => {
  const body = c.req.valid("json");
  const headers = new Headers(c.req.raw.headers);
  headers.set(getPhoneAuthChallengeHeaderName(), body.challengeToken);

  logAuthDebug("verify-otp request", {
    origin: c.req.raw.headers.get("origin"),
    phoneNumber: body.phoneNumber,
    hasCookieHeader: Boolean(c.req.raw.headers.get("cookie")),
    requestCookieNames: getCookieNamesFromCookieHeader(c.req.raw.headers),
  });

  const result = await auth.api.verifyPhoneNumber({
    body: {
      phoneNumber: body.phoneNumber,
      code: body.code,
    },
    headers,
    returnHeaders: true,
  });

  logAuthDebug("verify-otp better-auth result", {
    hasSetCookie: getCookieNamesFromSetCookieHeader(result.headers).length > 0,
    setCookieNames: getCookieNamesFromSetCookieHeader(result.headers),
    hasToken: Boolean(result.response.token),
    userId: result.response.user?.id ?? null,
    phoneNumber: result.response.user?.phoneNumber ?? null,
  });

  applyAuthHeaders(c.res.headers, result.headers);
  const sessionHeaders = buildRequestHeadersFromSetCookie(
    c.req.raw.headers,
    result.headers,
  );
  const session = await buildSessionDto(sessionHeaders);

  logAuthDebug("verify-otp built session", {
    hasCookieHeader: Boolean(sessionHeaders.get("cookie")),
    requestCookieNames: getCookieNamesFromCookieHeader(sessionHeaders),
    hasToken: Boolean(session.token),
    userId: session.user?.id ?? null,
    phoneNumber: session.user?.phoneNumber ?? null,
    role: session.user?.role ?? null,
  });

  return ok(c, session);
});

authRoutes.openapi(verifySigninRecoveryRoute, async (c) => {
  const body = c.req.valid("json");
  const challenge = await getValidatedSigninRecoveryChallenge(body);
  await restoreAccountDeletionOnSignin(challenge.userId);

  logAuthDebug("signin-recovery verify request", {
    origin: c.req.raw.headers.get("origin"),
    phoneNumber: body.phoneNumber,
    hasCookieHeader: Boolean(c.req.raw.headers.get("cookie")),
    requestCookieNames: getCookieNamesFromCookieHeader(c.req.raw.headers),
  });

  const result = await auth.api.signInEmailOTP({
    body: {
      email: challenge.email,
      otp: body.code,
    },
    headers: c.req.raw.headers,
    returnHeaders: true,
  });

  await finalizeSigninRecoveryChallenge(challenge.id);

  logAuthDebug("signin-recovery better-auth result", {
    hasSetCookie: getCookieNamesFromSetCookieHeader(result.headers).length > 0,
    setCookieNames: getCookieNamesFromSetCookieHeader(result.headers),
    hasToken: Boolean(result.response.token),
    userId: result.response.user?.id ?? null,
    phoneNumber: body.phoneNumber,
  });

  applyAuthHeaders(c.res.headers, result.headers);
  const sessionHeaders = buildRequestHeadersFromSetCookie(
    c.req.raw.headers,
    result.headers,
  );
  const session = await buildSessionDto(sessionHeaders);

  logAuthDebug("signin-recovery built session", {
    hasCookieHeader: Boolean(sessionHeaders.get("cookie")),
    requestCookieNames: getCookieNamesFromCookieHeader(sessionHeaders),
    hasToken: Boolean(session.token),
    userId: session.user?.id ?? null,
    phoneNumber: session.user?.phoneNumber ?? null,
    role: session.user?.role ?? null,
  });

  return ok(c, session);
});

authRoutes.openapi(signOutRoute, async (c) => {
  const result = await auth.api.signOut({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });

  applyAuthHeaders(c.res.headers, result.headers);

  return ok(c, result.response);
});

authRoutes.openapi(sessionRoute, async (c) => {
  const session = await buildSessionDto(c.req.raw.headers);

  logAuthDebug("session response", {
    origin: c.req.raw.headers.get("origin"),
    hasCookieHeader: Boolean(c.req.raw.headers.get("cookie")),
    requestCookieNames: getCookieNamesFromCookieHeader(c.req.raw.headers),
    hasToken: Boolean(session.token),
    userId: session.user?.id ?? null,
    phoneNumber: session.user?.phoneNumber ?? null,
    role: session.user?.role ?? null,
  });

  return ok(c, session);
});

authRoutes.openapi(verifyGoogleEmailRoute, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const body = c.req.valid("json");

  if (!session?.session || !session.user) {
    throw unauthorized();
  }

  await assertAccountAccessAllowed(session.user.id);

  return ok(c, await verifyGoogleEmailForUser(session.user.id, {
    headers: c.req.raw.headers,
    idToken: body.idToken,
    activeOrganizationId: session.session.activeOrganizationId ?? null,
  }));
});

export { authRoutes };
