// Production QA unit tracker: one unit per physical board, identified by its
// STM32 chip UID and, once the modem has reported it, its IMEI. The IMEI is the
// unit's public ID and links it to the `devices` row a customer later binds.

import type { PaginatedResponse } from "./common";
import type { AdminListQuery } from "./admin";
import type { QaBenchJobDto, QaFirmwareUploadDto } from "./qa-bench";
import type { QaTestRunDto } from "./qa-tests";

/** Production steps in order. A unit sits at one stage with a status for that stage. */
export const QA_UNIT_STAGES = [
  "registered",
  "qa_firmware",
  "board_tests",
  "production_firmware",
  "functional_tests",
  "assembled",
  "final_test",
  "ready_to_ship",
  "shipped",
  "delivered",
] as const;

export type QaUnitStage = (typeof QA_UNIT_STAGES)[number];

/**
 * pending: waiting for this stage to be done.
 * passed: stage done; the unit is ready for the next one.
 * failed: stage failed; the unit needs rework.
 * scrapped: taken out of production for good.
 */
export const QA_UNIT_STAGE_STATUSES = ["pending", "passed", "failed", "scrapped"] as const;

export type QaUnitStageStatus = (typeof QA_UNIT_STAGE_STATUSES)[number];

export const QA_FIRMWARE_CHANNELS = ["qa", "production"] as const;

export type QaFirmwareChannel = (typeof QA_FIRMWARE_CHANNELS)[number];

export type QaUnitEventKind =
  | "registered"
  | "identified"
  | "flashed"
  | "flash_failed"
  | "imei_linked"
  | "imei_conflict"
  | "stage_changed"
  | "test_run"
  | "note";

/** A delivered unit counts as offline after this long without telemetry. */
export const QA_FIELD_OFFLINE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Where a delivered unit stands in the field, from its linked device. */
export type QaUnitFieldState = "active" | "offline" | "never_seen";

export type QaUnitDeviceDto = {
  id: string;
  hardwareIdentifier: string;
  status: "fresh" | "active" | "inactive" | "blocked";
  lastSeenAt: string | null;
  bound: boolean;
};

export type QaUnitListItemDto = {
  id: string;
  /** 24 hex characters. */
  chipUid: string;
  imei: string | null;
  stage: QaUnitStage;
  stageStatus: QaUnitStageStatus;
  stageChangedAt: string;
  firmwareVersion: string | null;
  firmwareChannel: QaFirmwareChannel | null;
  firmwareFileName: string | null;
  lastStationId: string | null;
  lastStationName: string | null;
  device: QaUnitDeviceDto | null;
  /** Only for delivered units. */
  fieldState: QaUnitFieldState | null;
  createdAt: string;
  updatedAt: string;
};

export type QaUnitEventDto = {
  id: string;
  kind: QaUnitEventKind;
  stage: QaUnitStage | null;
  stageStatus: QaUnitStageStatus | null;
  message: string;
  data: Record<string, unknown> | null;
  jobId: string | null;
  stationId: string | null;
  stationName: string | null;
  actorName: string | null;
  createdAt: string;
};

export type QaUnitDetailDto = QaUnitListItemDto & {
  notes: string | null;
  firmware: QaFirmwareUploadDto | null;
  events: QaUnitEventDto[];
  jobs: QaBenchJobDto[];
  testRuns: QaTestRunDto[];
};

export type QaUnitListResponseDto = PaginatedResponse<QaUnitListItemDto>;

export type QaUnitsListQuery = AdminListQuery & {
  stage?: QaUnitStage;
  status?: QaUnitStageStatus;
  sort?: "updatedAt" | "createdAt" | "stage" | "imei";
};

export type UpdateQaUnitInput = {
  /** 15 digits, or null to unlink. */
  imei?: string | null;
  notes?: string | null;
};

export type SetQaUnitStageInput = {
  stage: QaUnitStage;
  status: QaUnitStageStatus;
  note?: string | null;
};

export type QaOverviewDto = {
  total: number;
  byStage: Array<{ stage: QaUnitStage; pending: number; passed: number; failed: number }>;
  scrapped: number;
  failed: number;
  field: { active: number; offline: number; neverSeen: number };
  /** Rolling 24 hours. */
  last24h: { registered: number; flashed: number; failed: number };
  recentFailures: QaUnitListItemDto[];
  stations: { online: number; total: number };
};

/** The unit last identified or flashed on a station, shown on the Bench. */
export type QaStationUnitDto = {
  stationId: string;
  unit: QaUnitListItemDto | null;
  /** When that job finished. */
  seenAt: string | null;
  /** Recent enough that the board is assumed to still be on the station; its TTL output is attributed to it. */
  current: boolean;
};
