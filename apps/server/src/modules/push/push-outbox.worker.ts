import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "../../db/client";
import {
  pushDeliveryJobs,
  pushInstallations,
  userNotifications,
} from "../../db/schema";
import { detachBackgroundTask } from "../../shared/background-task";
import {
  classifyPushError,
  maskExpoPushToken,
  recordPushInstallationFailure,
} from "./push-delivery-diagnostics";
import { expoPushClient } from "./expo-push.client";
import { childHasCoverage } from "../billing/billing-coverage.service";

const GEOFENCE_NOTIFICATION_CHANNEL_ID = "stepwhere-geofence-alerts-v2";
const GEOFENCE_NOTIFICATION_SOUND = "alertnotification.wav";

function nextRetryDate(attemptCount: number) {
  const backoffMs = Math.min(
    15 * 60_000,
    Math.max(30_000, 30_000 * 2 ** Math.max(attemptCount - 1, 0)),
  );
  return new Date(Date.now() + backoffMs);
}

class PushOutboxWorker {
  private running = false;
  private scheduled = false;

  async processPendingJobs(limit = 100) {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const candidateJobs = await db
        .select({
          job: pushDeliveryJobs,
          installation: pushInstallations,
          notification: userNotifications,
        })
        .from(pushDeliveryJobs)
        .innerJoin(
          pushInstallations,
          eq(pushInstallations.id, pushDeliveryJobs.pushInstallationId),
        )
        .innerJoin(
          userNotifications,
          eq(userNotifications.id, pushDeliveryJobs.userNotificationId),
        )
        .where(
          and(
            inArray(pushDeliveryJobs.status, ["pending", "failed"]),
            lte(pushDeliveryJobs.nextAttemptAt, new Date()),
            eq(pushInstallations.status, "active"),
          ),
        )
        .orderBy(
          asc(pushDeliveryJobs.nextAttemptAt),
          asc(pushDeliveryJobs.createdAt),
        )
        .limit(limit);

      const jobs: typeof candidateJobs = [];
      for (const row of candidateJobs) {
        if (row.notification.childId && !await childHasCoverage(row.notification.organizationId, row.notification.childId)) {
          await db.update(pushDeliveryJobs).set({ status: "cancelled", lastError: "subscription_required", updatedAt: new Date() }).where(eq(pushDeliveryJobs.id, row.job.id));
        } else jobs.push(row);
      }

      if (jobs.length === 0) {
        return;
      }

      const unreadCounts = await Promise.all(
        Array.from(new Set(jobs.map((job) => job.notification.userId))).map(
          async (userId) => {
            const rows = await db.$count(
              userNotifications,
              and(
                eq(userNotifications.userId, userId),
                eq(userNotifications.readAt, null as never),
              ),
            );
            return [userId, rows] as const;
          },
        ),
      );
      const unreadCountByUserId = new Map(unreadCounts);

      const messages = jobs.map((row) => ({
        to: row.installation.expoPushToken,
        title: row.notification.title,
        body: row.notification.body,
        sound: GEOFENCE_NOTIFICATION_SOUND,
        priority: "high" as const,
        channelId: GEOFENCE_NOTIFICATION_CHANNEL_ID,
        badge: unreadCountByUserId.get(row.notification.userId) ?? 0,
        data: row.notification.data ?? {},
      }));

      const chunks = expoPushClient.chunkPushNotifications(messages);
      let cursor = 0;

      for (const chunk of chunks) {
        const chunkJobs = jobs.slice(cursor, cursor + chunk.length);
        cursor += chunk.length;
        let tickets;

        try {
          tickets = await expoPushClient.sendPushNotificationsAsync(chunk);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);

          for (const job of chunkJobs) {
            const attemptCount = job.job.attemptCount + 1;
            await db
              .update(pushDeliveryJobs)
              .set({
                status: attemptCount >= 5 ? "cancelled" : "failed",
                lastError: message,
                attemptCount,
                nextAttemptAt: nextRetryDate(attemptCount),
                updatedAt: new Date(),
              })
              .where(eq(pushDeliveryJobs.id, job.job.id));
            await recordPushInstallationFailure({
              errorCode: "ExpoTransportError",
              installationId: job.installation.id,
            });

            console.warn("[push] Expo ticket request failed", {
              errorCode: "ExpoTransportError",
              installationId: job.installation.id,
              message,
              platform: job.installation.platform,
              token: maskExpoPushToken(job.installation.expoPushToken),
            });
          }

          continue;
        }

        for (let index = 0; index < chunkJobs.length; index += 1) {
          const ticket = tickets[index];
          const job = chunkJobs[index];

          if (!job) {
            continue;
          }

          if (ticket?.status === "ok") {
            await db
              .update(pushDeliveryJobs)
              .set({
                status: "ticketed",
                expoTicketId: ticket.id,
                sentAt: new Date(),
                receiptCheckedAt: null,
                lastError: null,
                attemptCount: job.job.attemptCount + 1,
                updatedAt: new Date(),
              })
              .where(eq(pushDeliveryJobs.id, job.job.id));

            continue;
          }

          const errorCode = ticket?.details?.error ?? "MissingExpoTicket";
          const message = ticket?.message ?? "Expo did not return a push ticket.";
          const attemptCount = job.job.attemptCount + 1;
          const classification = classifyPushError(errorCode);

          await db
            .update(pushDeliveryJobs)
            .set({
              status: !classification.retryable || attemptCount >= 5 ? "cancelled" : "failed",
              lastError: message,
              attemptCount,
              nextAttemptAt: nextRetryDate(attemptCount),
              updatedAt: new Date(),
            })
            .where(eq(pushDeliveryJobs.id, job.job.id));
          await recordPushInstallationFailure({
            errorCode,
            installationId: job.installation.id,
          });

          console.warn("[push] Expo ticket rejected", {
            errorCode,
            installationId: job.installation.id,
            message,
            platform: job.installation.platform,
            retryable: classification.retryable,
            token: maskExpoPushToken(job.installation.expoPushToken),
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  kick() {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;
    const timer = setTimeout(() => {
      this.scheduled = false;
      detachBackgroundTask("push-outbox", () => this.processPendingJobs());
    }, 0);
    timer.unref();
  }
}

export const pushOutboxWorker = new PushOutboxWorker();
