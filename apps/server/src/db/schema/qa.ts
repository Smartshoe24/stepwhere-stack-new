import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { QA_FIRMWARE_CHANNELS, QA_UNIT_STAGE_STATUSES, QA_UNIT_STAGES } from "@stepwhere/types";
import type { QaAgentHello, QaFunctionalChecks, QaJobResult, QaTestResultDto, QaUnitEventKind } from "@stepwhere/types";

import { users } from "./auth";
import { devices } from "./core";

const instant = (name: string) => timestamp(name, { withTimezone: true });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
  },
});

export const qaFirmwareFormatEnum = pgEnum("qa_firmware_format", ["bin", "hex"]);
export const qaBenchJobKindEnum = pgEnum("qa_bench_job_kind", ["identify", "flash"]);
export const qaBenchJobStatusEnum = pgEnum("qa_bench_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const qaConnectModeEnum = pgEnum("qa_connect_mode", ["normal", "underReset", "hotPlug"]);
export const qaFirmwareChannelEnum = pgEnum("qa_firmware_channel", QA_FIRMWARE_CHANNELS);
export const qaUnitStageEnum = pgEnum("qa_unit_stage", QA_UNIT_STAGES);
export const qaUnitStageStatusEnum = pgEnum("qa_unit_stage_status", QA_UNIT_STAGE_STATUSES);
export const qaUnitEventKindEnum = pgEnum("qa_unit_event_kind", [
  "registered",
  "identified",
  "flashed",
  "flash_failed",
  "imei_linked",
  "imei_conflict",
  "stage_changed",
  "note",
  "test_run",
] as const satisfies readonly QaUnitEventKind[]);
export const qaTestRunStatusEnum = pgEnum("qa_test_run_status", ["running", "passed", "failed", "aborted"]);

export const qaStations = pgTable("qa_stations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").unique(),
  pairingCodeHash: text("pairing_code_hash").unique(),
  pairingExpiresAt: instant("pairing_expires_at"),
  pairedAt: instant("paired_at"),
  lastSeenAt: instant("last_seen_at"),
  agentInfo: jsonb("agent_info").$type<QaAgentHello | null>(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  revokedAt: instant("revoked_at"),
  /** Bench automation: flash, run, retry and hand over boards without clicks. Off until an admin turns it on. */
  automationEnabled: boolean("automation_enabled").notNull().default(false),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
});

/**
 * A place on a bench where one board sits: its USB-TTL adapter and the ST-LINK
 * that flashes it. Results never depend on the slot (TTL lines carry the chip
 * UID); slots tell the operator where a board physically is.
 */
export const qaStationSlots = pgTable("qa_station_slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  stationId: uuid("station_id").notNull().references(() => qaStations.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  label: text("label"),
  /** The TTL adapter: "usb:<vid>:<pid>:<serial>", or "path:<path>" for adapters without a USB serial. */
  portKey: text("port_key").notNull(),
  probeSerial: text("probe_serial"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("qa_station_slots_position_unique").on(t.stationId, t.position),
  uniqueIndex("qa_station_slots_port_unique").on(t.stationId, t.portKey),
]);

export const qaFirmwareUploads = pgTable("qa_firmware_uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("file_name").notNull(),
  format: qaFirmwareFormatEnum("format").notNull(),
  // Uploads before channels existed were production builds.
  channel: qaFirmwareChannelEnum("channel").notNull().default("production"),
  version: text("version"),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  content: bytea("content").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [index("qa_firmware_uploads_created_idx").on(t.createdAt)]);

export const qaBenchJobs = pgTable("qa_bench_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  stationId: uuid("station_id").notNull().references(() => qaStations.id, { onDelete: "cascade" }),
  kind: qaBenchJobKindEnum("kind").notNull(),
  status: qaBenchJobStatusEnum("status").notNull().default("queued"),
  probeSerial: text("probe_serial"),
  connectMode: qaConnectModeEnum("connect_mode").notNull().default("normal"),
  firmwareUploadId: uuid("firmware_upload_id").references(() => qaFirmwareUploads.id, { onDelete: "set null" }),
  address: text("address"),
  phase: text("phase"),
  percent: smallint("percent"),
  result: jsonb("result").$type<QaJobResult | null>(),
  unitId: uuid("unit_id").references((): AnyPgColumn => qaUnits.id, { onDelete: "set null" }),
  slotId: uuid("slot_id").references(() => qaStationSlots.id, { onDelete: "set null" }),
  log: text("log").notNull().default(""),
  logTruncated: boolean("log_truncated").notNull().default(false),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull().defaultNow(),
  startedAt: instant("started_at"),
  finishedAt: instant("finished_at"),
}, (t) => [
  index("qa_bench_jobs_station_created_idx").on(t.stationId, t.createdAt),
  index("qa_bench_jobs_unit_created_idx").on(t.unitId, t.createdAt),
  // One queued or running job per ST-LINK. A job without a chosen ST-LINK runs alone (checked in the service).
  uniqueIndex("qa_bench_jobs_probe_active_unique")
    .on(t.stationId, sql`coalesce(${t.probeSerial}, '')`)
    .where(sql`${t.status} in ('queued', 'running')`),
]);

/** One physical board. Created the first time the Bench reads its chip UID. */
export const qaUnits = pgTable("qa_units", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** STM32 96-bit unique ID, 24 upper-case hex characters. */
  chipUid: text("chip_uid").notNull().unique(),
  /** The unit's public ID once the modem reports it. Matches devices.hardware_identifier. */
  imei: text("imei").unique(),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  stage: qaUnitStageEnum("stage").notNull().default("registered"),
  stageStatus: qaUnitStageStatusEnum("stage_status").notNull().default("pending"),
  stageChangedAt: instant("stage_changed_at").notNull().defaultNow(),
  firmwareUploadId: uuid("firmware_upload_id").references(() => qaFirmwareUploads.id, { onDelete: "set null" }),
  lastStationId: uuid("last_station_id").references(() => qaStations.id, { onDelete: "set null" }),
  notes: text("notes"),
  /** What the board proved over the air after production firmware (functional tests). */
  functionalChecks: jsonb("functional_checks").$type<QaFunctionalChecks | null>(),
  /** Wi-Fi/cell (Google) lookups made for this board's QA firmware uploads, at most QA_NETWORK_LOOKUP_MAX. */
  networkLookups: smallint("network_lookups").notNull().default(0),
  lastNetworkLookupAt: instant("last_network_lookup_at"),
  /** First time a lookup returned a position: the "Wi-Fi/GSM location" check passed. */
  networkLocatedAt: instant("network_located_at"),
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
}, (t) => [
  index("qa_units_stage_idx").on(t.stage, t.stageStatus),
  index("qa_units_updated_idx").on(t.updatedAt),
]);

/**
 * Test log: every location upload from a board that is not bound to a child
 * while it is in QA (before Ready to ship). Kept for good.
 */
export const qaUnitReports = pgTable("qa_unit_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitId: uuid("unit_id").notNull().references(() => qaUnits.id, { onDelete: "cascade" }),
  receivedAt: instant("received_at").notNull().defaultNow(),
  /** "qa-0.7.0" from QA firmware, "2.2.0" from production firmware. */
  firmware: text("firmware"),
  stage: qaUnitStageEnum("stage").notNull(),
  gpsFix: boolean("gps_fix").notNull().default(false),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  satelliteCount: integer("satellite_count"),
  /** Serving cell "mcc-mnc-tac-cellId". */
  cell: text("cell"),
  towerCount: integer("tower_count").notNull().default(0),
  wifiCount: integer("wifi_count").notNull().default(0),
  batteryVoltageMv: integer("battery_voltage_mv"),
  stepCounter: integer("step_counter"),
  /** Result of the Wi-Fi/cell lookup made for this upload, if one was made. */
  networkLookup: boolean("network_lookup").notNull().default(false),
  networkLatitude: numeric("network_latitude", { precision: 9, scale: 6 }),
  networkLongitude: numeric("network_longitude", { precision: 9, scale: 6 }),
  networkAccuracyMeters: numeric("network_accuracy_meters", { precision: 10, scale: 2 }),
  networkError: text("network_error"),
  /** The upload as received. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
}, (t) => [
  index("qa_unit_reports_unit_idx").on(t.unitId, t.receivedAt),
]);

/** Append-only timeline of everything that happened to a unit. */
export const qaUnitEvents = pgTable("qa_unit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitId: uuid("unit_id").notNull().references(() => qaUnits.id, { onDelete: "cascade" }),
  kind: qaUnitEventKindEnum("kind").notNull(),
  stage: qaUnitStageEnum("stage"),
  stageStatus: qaUnitStageStatusEnum("stage_status"),
  message: text("message").notNull(),
  data: jsonb("data").$type<Record<string, unknown> | null>(),
  jobId: uuid("job_id").references(() => qaBenchJobs.id, { onDelete: "set null" }),
  stationId: uuid("station_id").references(() => qaStations.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: instant("created_at").notNull().defaultNow(),
}, (t) => [
  index("qa_unit_events_unit_created_idx").on(t.unitId, t.createdAt),
  index("qa_unit_events_created_idx").on(t.createdAt),
]);

/** One pass of the QA firmware's board tests, as reported over TTL. */
export const qaTestRuns = pgTable("qa_test_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitId: uuid("unit_id").references(() => qaUnits.id, { onDelete: "set null" }),
  stationId: uuid("station_id").references(() => qaStations.id, { onDelete: "set null" }),
  /** The TTL port the run was read from, and its slot when the bench has slots. */
  serialPath: text("serial_path"),
  slotId: uuid("slot_id").references(() => qaStationSlots.id, { onDelete: "set null" }),
  chipUid: text("chip_uid").notNull(),
  firmwareVersion: text("firmware_version").notNull(),
  /** The firmware's run counter since boot. */
  runNumber: integer("run_number").notNull(),
  status: qaTestRunStatusEnum("status").notNull().default("running"),
  results: jsonb("results").$type<QaTestResultDto[]>().notNull(),
  passed: smallint("passed").notNull().default(0),
  failed: smallint("failed").notNull().default(0),
  skipped: smallint("skipped").notNull().default(0),
  startedAt: instant("started_at").notNull().defaultNow(),
  finishedAt: instant("finished_at"),
}, (t) => [
  index("qa_test_runs_unit_started_idx").on(t.unitId, t.startedAt),
  index("qa_test_runs_station_started_idx").on(t.stationId, t.startedAt),
  index("qa_test_runs_station_port_started_idx").on(t.stationId, t.serialPath, t.startedAt),
]);
