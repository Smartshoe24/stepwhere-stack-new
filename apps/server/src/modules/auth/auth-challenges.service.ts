import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import type {
  AuthOtpIntent,
  PrepareOtpInput,
  PrepareOtpResponseDto,
  StartSigninRecoveryInput,
  StartSigninRecoveryResponseDto,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { phoneAuthChallenges, signinRecoveryChallenges, users } from "../../db/schema";
import { auth } from "../../infrastructure/better-auth";
import { generateOpaqueToken, sha256 } from "../../shared/crypto";
import { badRequest, conflict } from "../../shared/errors";
import { assertPhonePreviewAccess } from "../preview-access/preview-access.service";
import { normalizePhoneNumber } from "./phone-number";
import { assertSigninCanStart } from "../account-deletion/account-deletion.service";

const CHALLENGE_TTL_MS = 1000 * 60 * 5;
const SIGNIN_RECOVERY_TTL_MS = 1000 * 60 * 5;
const RESEND_COOLDOWN_MS = 1000 * 30;
const PHONE_WINDOW_MS = 1000 * 60 * 15;
const PHONE_WINDOW_MAX = 5;
const IP_WINDOW_MAX = 20;
const SIGNIN_RECOVERY_MAX_ATTEMPTS = 5;
const CHALLENGE_HEADER = "x-stepwhere-challenge";
const TEMP_PHONE_EMAIL_DOMAIN = "@phone.stepwhere.local";

type ChallengeRecord = typeof phoneAuthChallenges.$inferSelect;
type SigninRecoveryChallengeRecord = typeof signinRecoveryChallenges.$inferSelect;

function isDevelopmentLoggingEnabled() {
  return process.env.NODE_ENV !== "production";
}

function logPrepareOtpEvent(message: string, data: Record<string, unknown>) {
  if (!isDevelopmentLoggingEnabled()) {
    return;
  }

  console.info(`[auth] ${message}`, data);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getRequestIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}

async function getUserByPhoneNumber(phoneNumber: string) {
  const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1);
  return user ?? null;
}

function isTempPhoneEmail(email: string | null | undefined) {
  return !email || normalizeEmail(email).endsWith(TEMP_PHONE_EMAIL_DOMAIN);
}

function maskEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const [localPart, domain] = normalizedEmail.split("@");

  if (!localPart || !domain) {
    return "*";
  }

  if (localPart.length <= 1) {
    return `*@${domain}`;
  }

  const visibleTailLength = Math.min(4, Math.max(1, localPart.length - 1));
  const visibleTail = localPart.slice(-visibleTailLength);
  return `${"*".repeat(Math.max(1, localPart.length - visibleTailLength))}${visibleTail}@${domain}`;
}

async function getLatestActiveChallenge(input: {
  phoneNumber: string;
  intent: AuthOtpIntent;
}) {
  const rows = await db
    .select()
    .from(phoneAuthChallenges)
    .where(and(
      eq(phoneAuthChallenges.phoneNumber, input.phoneNumber),
      eq(phoneAuthChallenges.intent, input.intent),
      isNull(phoneAuthChallenges.normalizedEmail),
      isNull(phoneAuthChallenges.consumedAt),
      gt(phoneAuthChallenges.expiresAt, new Date()),
    ))
    .orderBy(desc(phoneAuthChallenges.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

async function enforceChallengeRateLimits(phoneNumber: string, requestIpHash: string) {
  const windowStart = new Date(Date.now() - PHONE_WINDOW_MS);

  const [phoneCount] = await db
    .select({ total: count() })
    .from(phoneAuthChallenges)
    .where(and(
      eq(phoneAuthChallenges.phoneNumber, phoneNumber),
      gt(phoneAuthChallenges.createdAt, windowStart),
    ));

  if ((phoneCount?.total ?? 0) >= PHONE_WINDOW_MAX) {
    logPrepareOtpEvent("prepare-otp blocked", {
      phoneNumber,
      reason: "phone-rate-limit",
    });
    throw conflict("Too many OTP requests for this phone number. Try again later.");
  }

  const [ipCount] = await db
    .select({ total: count() })
    .from(phoneAuthChallenges)
    .where(and(
      eq(phoneAuthChallenges.requestIpHash, requestIpHash),
      gt(phoneAuthChallenges.createdAt, windowStart),
    ));

  if ((ipCount?.total ?? 0) >= IP_WINDOW_MAX) {
    logPrepareOtpEvent("prepare-otp blocked", {
      phoneNumber,
      reason: "device-rate-limit",
    });
    throw conflict("Too many OTP requests from this device. Try again later.");
  }
}

async function enforceSigninRecoveryRateLimits(phoneNumber: string, requestIpHash: string) {
  const windowStart = new Date(Date.now() - PHONE_WINDOW_MS);

  const [phoneCount] = await db
    .select({ total: count() })
    .from(signinRecoveryChallenges)
    .where(and(
      eq(signinRecoveryChallenges.phoneNumber, phoneNumber),
      gt(signinRecoveryChallenges.createdAt, windowStart),
    ));

  if ((phoneCount?.total ?? 0) >= PHONE_WINDOW_MAX) {
    throw conflict("Too many recovery requests for this phone number. Try again later.");
  }

  const [ipCount] = await db
    .select({ total: count() })
    .from(signinRecoveryChallenges)
    .where(and(
      eq(signinRecoveryChallenges.requestIpHash, requestIpHash),
      gt(signinRecoveryChallenges.createdAt, windowStart),
    ));

  if ((ipCount?.total ?? 0) >= IP_WINDOW_MAX) {
    throw conflict("Too many recovery requests from this device. Try again later.");
  }
}

function toChallengeResponse(record: ChallengeRecord, challengeToken: string): PrepareOtpResponseDto {
  return {
    challengeToken,
    expiresAt: record.expiresAt.toISOString(),
    intent: record.intent,
    phoneNumber: record.phoneNumber,
    resendAvailableAt: record.resendAvailableAt.toISOString(),
  };
}

function toSigninRecoveryResponse(
  record: SigninRecoveryChallengeRecord,
  challengeToken: string,
): StartSigninRecoveryResponseDto {
  return {
    challengeToken,
    expiresAt: record.expiresAt.toISOString(),
    maskedEmail: maskEmail(record.email),
    resendAvailableAt: record.resendAvailableAt.toISOString(),
  };
}

export function getPhoneAuthChallengeHeaderName() {
  return CHALLENGE_HEADER;
}

export async function prepareOtp(input: PrepareOtpInput, headers: Headers): Promise<PrepareOtpResponseDto> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  await assertPhonePreviewAccess(phoneNumber);
  const requestIpHash = sha256(getRequestIp(headers));
  const existingUser = await getUserByPhoneNumber(phoneNumber);
  if (existingUser) {
    await assertSigninCanStart(existingUser.id);
  }
  const intent: AuthOtpIntent = existingUser ? "signin" : "signup";

  logPrepareOtpEvent("prepare-otp requested", {
    phoneNumber,
    intent,
  });

  const activeChallenge = await getLatestActiveChallenge({
    phoneNumber,
    intent,
  });

  if (activeChallenge && activeChallenge.resendAvailableAt > new Date()) {
    logPrepareOtpEvent("prepare-otp blocked", {
      phoneNumber,
      intent,
      reason: "resend-cooldown",
    });
    throw conflict("Wait before requesting another verification code.", {
      resendAvailableAt: activeChallenge.resendAvailableAt.toISOString(),
      expiresAt: activeChallenge.expiresAt.toISOString(),
    });
  }

  await enforceChallengeRateLimits(phoneNumber, requestIpHash);

  const challengeToken = generateOpaqueToken(24);
  const now = new Date();
  const challenge = {
    phoneNumber,
    intent,
    normalizedEmail: null,
    tokenHash: sha256(challengeToken),
    requestIpHash,
    sendCount: 1,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    updatedAt: now,
  };

  const [record] = await db.insert(phoneAuthChallenges).values(challenge).returning();

  const authHeaders = new Headers(headers);
  authHeaders.set(CHALLENGE_HEADER, challengeToken);

  logPrepareOtpEvent("dispatching phone otp", {
    phoneNumber,
    challengeId: record.id,
  });

  await auth.api.sendPhoneNumberOTP({
    headers: authHeaders,
    body: { phoneNumber },
  });

  logPrepareOtpEvent("phone otp dispatched", {
    phoneNumber,
    challengeId: record.id,
  });

  return toChallengeResponse(record, challengeToken);
}

export async function startSigninRecovery(
  input: StartSigninRecoveryInput,
  headers: Headers,
): Promise<StartSigninRecoveryResponseDto> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  await assertPhonePreviewAccess(phoneNumber);
  const requestIpHash = sha256(getRequestIp(headers));
  const existingUser = await getUserByPhoneNumber(phoneNumber);

  if (!existingUser) {
    throw conflict("No account exists for this phone number.");
  }

  await assertSigninCanStart(existingUser.id);

  if (isTempPhoneEmail(existingUser.email)) {
    throw conflict("This account does not have a recovery email yet.");
  }

  const normalizedEmail = normalizeEmail(existingUser.email);
  const [activeChallenge] = await db
    .select()
    .from(signinRecoveryChallenges)
    .where(and(
      eq(signinRecoveryChallenges.userId, existingUser.id),
      eq(signinRecoveryChallenges.phoneNumber, phoneNumber),
      eq(signinRecoveryChallenges.email, normalizedEmail),
      isNull(signinRecoveryChallenges.consumedAt),
      gt(signinRecoveryChallenges.expiresAt, new Date()),
    ))
    .orderBy(desc(signinRecoveryChallenges.createdAt))
    .limit(1);

  if (activeChallenge && activeChallenge.resendAvailableAt > new Date()) {
    throw conflict("Wait before requesting another recovery code.", {
      resendAvailableAt: activeChallenge.resendAvailableAt.toISOString(),
      expiresAt: activeChallenge.expiresAt.toISOString(),
    });
  }

  await enforceSigninRecoveryRateLimits(phoneNumber, requestIpHash);

  const challengeToken = generateOpaqueToken(24);
  const now = new Date();
  const code = await auth.api.createVerificationOTP({
    body: {
      email: normalizedEmail,
      type: "sign-in",
    },
    headers,
  });
  const [record] = await db
    .insert(signinRecoveryChallenges)
    .values({
      userId: existingUser.id,
      phoneNumber,
      email: normalizedEmail,
      codeHash: sha256(code),
      tokenHash: sha256(challengeToken),
      requestIpHash,
      expiresAt: new Date(now.getTime() + SIGNIN_RECOVERY_TTL_MS),
      resendAvailableAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      updatedAt: now,
    })
    .returning();

  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth-recovery] Email OTP for ${maskEmail(normalizedEmail)}/${existingUser.id}: ${code}`);
  }

  return toSigninRecoveryResponse(record, challengeToken);
}

export async function getValidatedSigninRecoveryChallenge(input: {
  challengeToken: string;
  code: string;
  phoneNumber: string;
}) {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  await assertPhonePreviewAccess(phoneNumber);

  const [challenge] = await db
    .select()
    .from(signinRecoveryChallenges)
    .where(eq(signinRecoveryChallenges.tokenHash, sha256(input.challengeToken)))
    .limit(1);

  if (!challenge) {
    throw badRequest("Recovery challenge is invalid.");
  }

  if (challenge.consumedAt) {
    throw badRequest("Recovery challenge has already been used.");
  }

  if (challenge.expiresAt <= new Date()) {
    throw badRequest("Recovery challenge has expired.");
  }

  if (challenge.phoneNumber !== phoneNumber) {
    throw badRequest("Recovery challenge does not match this phone number.");
  }

  if (challenge.attemptCount >= SIGNIN_RECOVERY_MAX_ATTEMPTS) {
    throw badRequest("Too many incorrect recovery attempts. Request a fresh code.");
  }

  if (challenge.codeHash !== sha256(input.code.trim())) {
    await db
      .update(signinRecoveryChallenges)
      .set({
        attemptCount: challenge.attemptCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(signinRecoveryChallenges.id, challenge.id));

    throw badRequest("Recovery code is invalid.");
  }

  return challenge;
}

export async function finalizeSigninRecoveryChallenge(challengeId: string) {
  await db
    .update(signinRecoveryChallenges)
    .set({
      consumedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(signinRecoveryChallenges.id, challengeId));
}

export async function getValidatedPhoneAuthChallenge(input: {
  challengeToken: string;
  phoneNumber: string;
}) {
  const [challenge] = await db
    .select()
    .from(phoneAuthChallenges)
    .where(eq(phoneAuthChallenges.tokenHash, sha256(input.challengeToken)))
    .limit(1);

  if (!challenge) {
    throw badRequest("Verification challenge is invalid.");
  }

  if (challenge.consumedAt) {
    throw badRequest("Verification challenge has already been used.");
  }

  if (challenge.expiresAt <= new Date()) {
    throw badRequest("Verification challenge has expired.");
  }

  if (challenge.phoneNumber !== normalizePhoneNumber(input.phoneNumber)) {
    throw badRequest("Verification challenge does not match this phone number.");
  }

  return challenge;
}

export async function getValidatedPhoneAuthChallengeFromHeaders(headers: Headers, phoneNumber: string) {
  const challengeToken = headers.get(CHALLENGE_HEADER)?.trim();

  if (!challengeToken) {
    throw badRequest("Verification challenge is required.");
  }

  return getValidatedPhoneAuthChallenge({ challengeToken, phoneNumber });
}

export async function finalizeVerifiedPhoneAuthChallenge(headers: Headers, userId: string) {
  const challengeToken = headers.get(CHALLENGE_HEADER)?.trim();

  if (!challengeToken) {
    throw badRequest("Verification challenge is required.");
  }

  const [challenge] = await db
    .select()
    .from(phoneAuthChallenges)
    .where(eq(phoneAuthChallenges.tokenHash, sha256(challengeToken)))
    .limit(1);

  if (!challenge) {
    throw badRequest("Verification challenge is invalid.");
  }

  if (challenge.consumedAt) {
    throw badRequest("Verification challenge has already been used.");
  }

  if (challenge.expiresAt <= new Date()) {
    throw badRequest("Verification challenge has expired.");
  }

  if (challenge.intent === "signup" && challenge.normalizedEmail) {
    const [otherUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, challenge.normalizedEmail), eq(users.id, userId)))
      .limit(1);

    if (!otherUser) {
      const [existingEmailUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, challenge.normalizedEmail))
        .limit(1);

      if (existingEmailUser && existingEmailUser.id !== userId) {
        throw conflict("An account already exists for this email address.");
      }

      await db
        .update(users)
        .set({
          email: challenge.normalizedEmail,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
  }

  await db
    .update(phoneAuthChallenges)
    .set({
      consumedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(phoneAuthChallenges.id, challenge.id));

  return challenge;
}
