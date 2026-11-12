import { and, desc, eq, gt } from "drizzle-orm";
import { Expo } from "expo-server-sdk";

import { db, sql } from "../db/client";
import {
  children,
  pushInstallations,
  sessions,
  users,
} from "../db/schema";
import { getPlayReviewConfiguration } from "../modules/play-review/play-review-access.service";
import {
  classifyPushError,
  recordPushInstallationFailure,
  recordPushInstallationSuccess,
} from "../modules/push/push-delivery-diagnostics";
import { expoPushClient } from "../modules/push/expo-push.client";

const RECEIPT_POLL_INTERVAL_MS = 5_000;
const RECEIPT_TIMEOUT_MS = 60_000;

function getPlatformArgument() {
  const platformIndex = process.argv.indexOf("--platform");
  const platform = platformIndex >= 0 ? process.argv[platformIndex + 1] : "ios";

  if (platform !== "ios" && platform !== "android") {
    throw new Error("Use --platform ios or --platform android.");
  }

  return platform;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function diagnosticHint(errorCode: string) {
  if (errorCode === "InvalidCredentials") {
    return "Verify the APNs key in EAS credentials, the Apple team, and the app's aps-environment entitlement.";
  }
  if (errorCode === "DeviceNotRegistered") {
    return "Open the latest production app on the device, sign in again, and retry so it registers a fresh token.";
  }
  if (errorCode === "MessageRateExceeded") {
    return "Wait briefly and retry; Expo or the platform has rate-limited this destination.";
  }
  if (errorCode === "MessageTooBig") {
    return "Reduce the push title, body, or data payload.";
  }

  return "Check the Expo push response and server connectivity, then retry.";
}

async function main() {
  if (process.env.ALLOW_PLAY_REVIEW_PUSH_TEST !== "true") {
    throw new Error("Set ALLOW_PLAY_REVIEW_PUSH_TEST=true for this explicit diagnostic command.");
  }

  const configuration = getPlayReviewConfiguration();
  if (!configuration) {
    throw new Error("Enable and fully configure PLAY_REVIEW_* before testing reviewer push delivery.");
  }

  const platform = getPlatformArgument();
  const [destination] = await db
    .select({
      installation: pushInstallations,
      userId: users.id,
    })
    .from(pushInstallations)
    .innerJoin(users, eq(users.id, pushInstallations.userId))
    .innerJoin(sessions, eq(sessions.id, pushInstallations.sessionId))
    .where(and(
      eq(users.phoneNumber, configuration.phoneNumber),
      eq(users.isPlayReviewAccount, true),
      eq(users.status, "active"),
      eq(pushInstallations.platform, platform),
      eq(pushInstallations.status, "active"),
      gt(sessions.expiresAt, new Date()),
    ))
    .orderBy(desc(pushInstallations.lastRegisteredAt))
    .limit(1);

  if (!destination) {
    throw new Error(
      `No active ${platform} reviewer installation with a valid session was found. Sign in on the physical device, allow notifications, and retry.`,
    );
  }
  if (!Expo.isExpoPushToken(destination.installation.expoPushToken)) {
    throw new Error("The selected reviewer installation has an invalid Expo push token.");
  }

  const [reviewChild] = await db
    .select({ id: children.id })
    .from(children)
    .where(and(
      eq(children.parentUserId, destination.userId),
      eq(children.status, "active"),
    ))
    .limit(1);

  const [ticket] = await expoPushClient.sendPushNotificationsAsync([{
    to: destination.installation.expoPushToken,
    title: "Stepwhere notification test",
    body: "Notifications are working on this device.",
    sound: "alertnotification.wav",
    priority: "high",
    channelId: "stepwhere-geofence-alerts-v2",
    data: {
      route: "/home",
      ...(reviewChild ? { childId: reviewChild.id } : {}),
    },
  }]);

  if (!ticket) {
    throw new Error("Expo did not return a push ticket.");
  }
  if (ticket.status === "error") {
    const errorCode = ticket.details?.error ?? "ExpoTicketError";
    await recordPushInstallationFailure({
      errorCode,
      installationId: destination.installation.id,
    });
    throw new Error(`${errorCode}: ${ticket.message}. ${diagnosticHint(errorCode)}`);
  }

  console.info("[store-review] Expo accepted the notification; waiting for its delivery receipt", {
    installationId: destination.installation.id,
    platform,
    ticketId: ticket.id,
  });

  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await wait(RECEIPT_POLL_INTERVAL_MS);
    const receipts = await expoPushClient.getPushNotificationReceiptsAsync([ticket.id]);
    const receipt = receipts[ticket.id];

    if (!receipt) {
      continue;
    }
    if (receipt.status === "ok") {
      await recordPushInstallationSuccess(destination.installation.id);
      console.info("[store-review] notification delivery receipt succeeded", {
        installationId: destination.installation.id,
        platform,
        ticketId: ticket.id,
      });
      return;
    }

    const errorCode = receipt.details?.error ?? "ExpoReceiptError";
    const classification = classifyPushError(errorCode);
    await recordPushInstallationFailure({
      errorCode,
      installationId: destination.installation.id,
    });
    throw new Error(
      `${errorCode}: ${receipt.message}. ${diagnosticHint(errorCode)} Retryable: ${classification.retryable}.`,
    );
  }

  throw new Error(
    `Expo accepted ticket ${ticket.id}, but no receipt was available within 60 seconds. The device may still receive it; rerun the command and inspect server logs or Expo push receipts.`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("[store-review] push diagnostic failed", error instanceof Error ? error.message : String(error));
    await sql.end();
    process.exitCode = 1;
  });
