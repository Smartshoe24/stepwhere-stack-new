import {
  detachBackgroundTask,
  logBackgroundTaskFailure,
  runBackgroundTaskPhase,
} from "../../shared/background-task";
import { realtimeRegistry } from "../realtime/realtime.service";
import {
  processPendingHistoryEnrichmentJobs,
  recoverExpiredHistoryEnrichmentLeases,
} from "./history-enrichment.worker";
import {
  finalizeStaleOngoingHistoryEvents,
  getDirtyHistoryChildIds,
  materializeChildHistory,
  type HistoryMaterializationResult,
} from "./history-materializer";

function broadcastHistoryUpdated(
  result: HistoryMaterializationResult,
  phase: string,
) {
  try {
    realtimeRegistry.broadcast(result.organizationId, {
      type: "history.updated",
      data: {
        childId: result.childId,
        processedThrough: result.processedThrough.toISOString(),
      },
    });
  } catch (error) {
    logBackgroundTaskFailure({
      name: "history-processing",
      phase,
      error,
    });
  }
}

class HistoryWorker {
  private running = false;
  private scheduled = false;

  async processPendingChildren() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const childIds = await runBackgroundTaskPhase(
        "dirty-child-discovery",
        () => getDirtyHistoryChildIds(),
      );

      for (const childId of childIds) {
        try {
          const result = await runBackgroundTaskPhase(
            "child-materialization",
            () => materializeChildHistory(childId),
          );

          if (result) {
            broadcastHistoryUpdated(result, "history-update-broadcast");
          }
        } catch (error) {
          logBackgroundTaskFailure({
            name: "history-processing",
            phase: "child-materialization",
            error,
          });
        }
      }

      try {
        const finalizedResults = await runBackgroundTaskPhase(
          "stale-event-finalization",
          () => finalizeStaleOngoingHistoryEvents(),
        );

        for (const result of finalizedResults) {
          broadcastHistoryUpdated(result, "stale-event-update-broadcast");
        }
      } catch (error) {
        logBackgroundTaskFailure({
          name: "history-processing",
          error,
        });
      }

      await runBackgroundTaskPhase(
        "enrichment-lease-recovery",
        () => recoverExpiredHistoryEnrichmentLeases(),
      );
      await runBackgroundTaskPhase(
        "enrichment-processing",
        () => processPendingHistoryEnrichmentJobs(),
      );
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
      detachBackgroundTask(
        "history-processing",
        () => this.processPendingChildren(),
      );
    }, 0);
    timer.unref();
  }
}

export const historyWorker = new HistoryWorker();
