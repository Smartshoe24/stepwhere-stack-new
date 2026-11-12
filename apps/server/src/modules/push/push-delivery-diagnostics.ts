import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { pushInstallations } from "../../db/schema";

const TERMINAL_PUSH_ERRORS = new Set([
  "DeviceNotRegistered",
  "InvalidCredentials",
  "MessageTooBig",
]);

export function classifyPushError(errorCode: string | null | undefined) {
  return {
    disableInstallation: errorCode === "DeviceNotRegistered",
    retryable: !errorCode || !TERMINAL_PUSH_ERRORS.has(errorCode),
  };
}

export function maskExpoPushToken(token: string) {
  if (token.length <= 14) {
    return "***";
  }

  return `${token.slice(0, 9)}…${token.slice(-5)}`;
}

export async function recordPushInstallationFailure(input: {
  errorCode: string;
  installationId: string;
}) {
  const classification = classifyPushError(input.errorCode);
  const now = new Date();

  await db
    .update(pushInstallations)
    .set({
      ...(classification.disableInstallation ? { status: "disabled" as const } : {}),
      lastFailureAt: now,
      failureReason: input.errorCode,
      updatedAt: now,
    })
    .where(eq(pushInstallations.id, input.installationId));
}

export async function recordPushInstallationSuccess(installationId: string) {
  const now = new Date();

  await db
    .update(pushInstallations)
    .set({
      lastSuccessAt: now,
      lastFailureAt: null,
      failureReason: null,
      updatedAt: now,
    })
    .where(eq(pushInstallations.id, installationId));
}
