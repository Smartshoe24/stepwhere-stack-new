import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";

import { env } from "./config/env";
import { app } from "./app";
import { getEffectiveHistoryDataSource } from "./modules/history/history-fixtures";
import { cleanupExpiredHistoryRoadGeometry } from "./modules/history/history-roads.service";
import { historyWorker } from "./modules/history/history-worker";
import { cleanupExpiredNotifications } from "./modules/notifications/notifications.service";
import { pushOutboxWorker } from "./modules/push/push-outbox.worker";
import { pushReceiptsWorker } from "./modules/push/push-receipts.worker";
import { cleanupExpiredTrailGeometryCache } from "./modules/telemetry/telemetry.service";
import { processDueAccountDeletions } from "./modules/account-deletion/account-deletion.worker";
import { emitPlayReviewTelemetry } from "./modules/play-review/play-review-telemetry.worker";
import { maintainBillingCoverage, processBillingEvents, reconcileDueSubscriptions } from "./modules/billing/billing.worker";
import {
  runBackgroundTaskPhase,
  scheduleBackgroundTask,
} from "./shared/background-task";

const port = env.PORT;
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

warnOnLocalUrlPortMismatch();
logDevelopmentHistoryDataSource();
console.log(`API server running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
  websocket: {
    server: websocketServer,
  },
});

scheduleBackgroundTask({
  name: "store-review-telemetry",
  initialDelayMs: 2_000,
  intervalMs: 30_000,
  task: async () => {
    await emitPlayReviewTelemetry();
  },
});

scheduleBackgroundTask({
  name: "history-processing",
  initialDelayMs: 5_000,
  intervalMs: 30_000,
  task: () => historyWorker.processPendingChildren(),
});

scheduleBackgroundTask({ name: "billing-events", initialDelayMs: 3_000, intervalMs: 30_000, task: () => processBillingEvents() });
scheduleBackgroundTask({ name: "billing-coverage", initialDelayMs: 4_000, intervalMs: 30_000, task: () => maintainBillingCoverage() });
scheduleBackgroundTask({ name: "billing-reconciliation", initialDelayMs: 15_000, intervalMs: 60_000, task: () => reconcileDueSubscriptions() });

scheduleBackgroundTask({
  name: "push-outbox",
  initialDelayMs: 10_000,
  intervalMs: 30_000,
  task: () => pushOutboxWorker.processPendingJobs(),
});

scheduleBackgroundTask({
  name: "push-receipts",
  initialDelayMs: 20_000,
  intervalMs: 60_000,
  task: () => pushReceiptsWorker.processReceipts(),
});

scheduleBackgroundTask({
  name: "expired-data-maintenance",
  initialDelayMs: 60_000,
  intervalMs: 60 * 60 * 1000,
  task: async () => {
    await runBackgroundTaskPhase(
      "account-deletion-purge",
      () => processDueAccountDeletions(),
    );
    await runBackgroundTaskPhase(
      "notification-cleanup",
      () => cleanupExpiredNotifications(),
    );
    await runBackgroundTaskPhase(
      "trail-cache-cleanup",
      () => cleanupExpiredTrailGeometryCache(),
    );
    await runBackgroundTaskPhase(
      "history-road-cache-cleanup",
      () => cleanupExpiredHistoryRoadGeometry(),
    );
  },
});

function warnOnLocalUrlPortMismatch() {
  if (env.NODE_ENV !== "development") {
    return;
  }

  const authUrl = new URL(env.BETTER_AUTH_URL);

  if (!["localhost", "127.0.0.1"].includes(authUrl.hostname)) {
    return;
  }

  const authUrlPort = authUrl.port || (authUrl.protocol === "https:" ? "443" : "80");

  if (authUrlPort === `${port}`) {
    return;
  }

  console.warn(
    `BETTER_AUTH_URL port ${authUrlPort} does not match PORT ${port}. Browser auth/CORS may fail.`,
  );
}

function logDevelopmentHistoryDataSource() {
  if (env.NODE_ENV !== "development") {
    return;
  }

  if (getEffectiveHistoryDataSource() === "live") {
    console.log("[history] data source: live");
    return;
  }

  console.warn(
    "[history] Development fixtures enabled; History read endpoints are not returning database history.",
  );
}
