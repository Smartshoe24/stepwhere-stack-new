import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { db } from "../../db/client";
import { pushDeliveryJobs, pushInstallations } from "../../db/schema";
import {
  classifyPushError,
  maskExpoPushToken,
  recordPushInstallationFailure,
  recordPushInstallationSuccess,
} from "./push-delivery-diagnostics";
import { expoPushClient } from "./expo-push.client";

function nextRetryDate(attemptCount: number) {
  const backoffMs = Math.min(
    15 * 60_000,
    Math.max(30_000, 30_000 * 2 ** Math.max(attemptCount - 1, 0)),
  );
  return new Date(Date.now() + backoffMs);
}

class PushReceiptsWorker {
  private running = false;

  async processReceipts(limit = 100) {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.processReceiptBatch(limit);
    } finally {
      this.running = false;
    }
  }

  private async processReceiptBatch(limit: number) {
    const jobs = await db
      .select({
        job: pushDeliveryJobs,
        installation: pushInstallations,
      })
      .from(pushDeliveryJobs)
      .innerJoin(
        pushInstallations,
        eq(pushInstallations.id, pushDeliveryJobs.pushInstallationId),
      )
      .where(and(
        eq(pushDeliveryJobs.status, "ticketed"),
        isNull(pushDeliveryJobs.receiptCheckedAt),
        lt(pushDeliveryJobs.sentAt, new Date(Date.now() - 60_000)),
      ))
      .limit(limit);

    const ticketIds = jobs
      .map((row) => row.job.expoTicketId)
      .filter((ticketId): ticketId is string => Boolean(ticketId));

    if (ticketIds.length === 0) {
      return;
    }

    const receiptIds = expoPushClient.chunkPushNotificationReceiptIds(ticketIds);

    for (const chunk of receiptIds) {
      const receipts = await expoPushClient.getPushNotificationReceiptsAsync(chunk);

      for (const row of jobs) {
        const job = row.job;
        if (!job.expoTicketId) {
          continue;
        }

        const receipt = receipts[job.expoTicketId];

        if (!receipt) {
          continue;
        }

        if (receipt.status === "ok") {
          await db
            .update(pushDeliveryJobs)
            .set({
              status: "delivered",
              receiptCheckedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(pushDeliveryJobs.id, job.id));
          await recordPushInstallationSuccess(row.installation.id);
          continue;
        }

        const errorCode = receipt.details?.error ?? "ExpoReceiptError";
        const message = receipt.message ?? "Expo receipt failed.";
        const classification = classifyPushError(errorCode);

        await db
          .update(pushDeliveryJobs)
          .set({
            status: !classification.retryable || job.attemptCount >= 5 ? "cancelled" : "failed",
            lastError: message,
            nextAttemptAt: nextRetryDate(job.attemptCount),
            receiptCheckedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pushDeliveryJobs.id, job.id));
        await recordPushInstallationFailure({
          errorCode,
          installationId: row.installation.id,
        });

        console.warn("[push] Expo receipt reported a delivery failure", {
          errorCode,
          installationId: row.installation.id,
          message,
          platform: row.installation.platform,
          retryable: classification.retryable,
          token: maskExpoPushToken(row.installation.expoPushToken),
        });
      }
    }
  }
}

export const pushReceiptsWorker = new PushReceiptsWorker();
