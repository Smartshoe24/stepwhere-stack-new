import type { ActivitySteppedEventDto } from "./activity";
import type { OverviewResponseDto } from "./children";
import type { HistoryUpdatedEventDto } from "./history";
import type { QaBenchJobDto, QaSerialLine } from "./qa-bench";
import type { QaTestRunDto } from "./qa-tests";
import type { ChildLiveResponseDto } from "./telemetry";

export type RealtimeHeartbeatEvent = {
  type: "realtime.heartbeat";
  data: {
    sentAt: string;
  };
};

export type MobileRealtimeEvent =
  | RealtimeHeartbeatEvent
  | { type: "overview.snapshot"; data: OverviewResponseDto }
  | { type: "child.updated"; data: ChildLiveResponseDto }
  | { type: "activity.stepped"; data: ActivitySteppedEventDto }
  | { type: "history.updated"; data: HistoryUpdatedEventDto }
  | { type: "notifications.changed"; data: { reason: "created" | "read" } };

export type AdminRealtimeEvent =
  | RealtimeHeartbeatEvent
  | {
    type: "admin:child.updated";
    data: {
      childId: string;
      deviceId?: string;
      reason: string;
    };
  }
  | {
    type: "admin:device.telemetry.changed";
    data: {
      deviceId: string;
      childId?: string;
      locationEventId?: string;
      occurredAt?: string;
      reason: string;
    };
  }
  | {
    type: "admin:geofence.changed";
    data: {
      geofenceId?: string;
      childId?: string;
      deviceId?: string;
      reason: string;
    };
  }
  | {
    type: "admin:geofence.breach.created";
    data: {
      geofenceId?: string;
      geofenceEventId?: string;
      childId?: string;
      deviceId?: string;
      reason: string;
    };
  }
  | {
    type: "admin:geofence.breach.acknowledged";
    data: {
      geofenceId?: string;
      geofenceEventId?: string;
      childId?: string;
      deviceId?: string;
      reason: string;
    };
  }
  | {
    type: "admin:family.changed";
    data: {
      familyId?: string;
      reason: string;
    };
  }
  /** A bench station connected, disconnected, re-scanned hardware or opened/closed a port. */
  | { type: "admin:qa.station.changed"; data: { stationId: string; reason: string } }
  /** Carries the job itself so the Bench screen can show progress without refetching. */
  | { type: "admin:qa.job.changed"; data: { stationId: string; job: QaBenchJobDto } }
  | { type: "admin:qa.job.log"; data: { stationId: string; jobId: string; lines: string[] } }
  | { type: "admin:qa.serial.data"; data: { stationId: string; path: string; lines: QaSerialLine[] } }
  | { type: "admin:qa.serial.error"; data: { stationId: string; path: string; message: string } }
  /** A QA unit was created, flashed, linked to an IMEI or moved between stages. */
  | { type: "admin:qa.unit.changed"; data: { unitId: string; stationId: string | null } }
  /** Carries the run so the Bench checklist updates without refetching. */
  | { type: "admin:qa.test-run.changed"; data: { stationId: string | null; run: QaTestRunDto } };
