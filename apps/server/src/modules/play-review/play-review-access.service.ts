import { and, eq } from "drizzle-orm";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { users, verifications } from "../../db/schema";

export function getPlayReviewConfiguration() {
  if (
    !env.PLAY_REVIEW_ENABLED
    || !env.PLAY_REVIEW_PHONE_NUMBER
    || !env.PLAY_REVIEW_OTP
    || !env.PLAY_REVIEW_EMAIL
    || !env.PLAY_REVIEW_HARDWARE_IDENTIFIER
  ) {
    return null;
  }

  return {
    email: env.PLAY_REVIEW_EMAIL.trim().toLowerCase(),
    hardwareIdentifier: env.PLAY_REVIEW_HARDWARE_IDENTIFIER.trim().toUpperCase(),
    otp: env.PLAY_REVIEW_OTP,
    phoneNumber: env.PLAY_REVIEW_PHONE_NUMBER,
  };
}

export async function isProvisionedPlayReviewer(input: {
  phoneNumber: string;
  userId?: string;
}) {
  const configuration = getPlayReviewConfiguration();

  if (!configuration || configuration.phoneNumber !== input.phoneNumber) {
    return false;
  }

  const conditions = [
    eq(users.phoneNumber, input.phoneNumber),
    eq(users.isPlayReviewAccount, true),
  ];

  if (input.userId) {
    conditions.push(eq(users.id, input.userId));
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(...conditions))
    .limit(1);

  return Boolean(user);
}

/**
 * Better Auth generates and stores its OTP before invoking `sendOTP`. For the
 * single provisioned store reviewer, replace that transient value with the
 * server-side fixed code and skip SMS delivery. Normal users remain untouched.
 */
export async function applyPlayReviewPhoneOtp(phoneNumber: string) {
  const configuration = getPlayReviewConfiguration();

  if (!configuration || !(await isProvisionedPlayReviewer({ phoneNumber }))) {
    return false;
  }

  await db
    .update(verifications)
    .set({
      value: `${configuration.otp}:0`,
      updatedAt: new Date(),
    })
    .where(eq(verifications.identifier, phoneNumber));

  console.info("[store-review] issued fixed reviewer OTP", {
    reviewerAccount: true,
  });
  return true;
}

export async function getPlayReviewOtpForUser(input: {
  phoneNumber: string;
  userId: string;
}) {
  const configuration = getPlayReviewConfiguration();

  if (
    !configuration
    || !(await isProvisionedPlayReviewer(input))
  ) {
    return null;
  }

  return configuration.otp;
}
