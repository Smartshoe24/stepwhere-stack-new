import { relations, sql } from "drizzle-orm";
import {
  date,
  boolean,
  check,
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

import { accounts, sessions, users } from "./auth";
import { organizations } from "./family";

export const childLifecycleStatusEnum = pgEnum("child_lifecycle_status", ["active", "archived"]);
export const devicePlatformEnum = pgEnum("device_platform", ["android", "ios", "embedded", "unknown"]);
export const deviceStatusEnum = pgEnum("device_status", ["fresh", "active", "inactive", "blocked"]);
export const deviceTelemetryStateEnum = pgEnum("device_telemetry_state", ["active", "sleep", "offline"]);
export const childTrackingStatusEnum = pgEnum("child_tracking_status", ["safe", "transit", "alert", "offline"]);
export const childGeofenceStatusEnum = pgEnum("child_geofence_status", ["enabled", "disabled"]);
export const shareStatusEnum = pgEnum("share_status", ["active", "expired", "revoked"]);
export const planStatusEnum = pgEnum("plan_status", ["active", "inactive"]);
export const subscriptionSourceEnum = pgEnum("subscription_source", ["admin", "purchase", "promo"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled"]);
export const contentStatusEnum = pgEnum("content_status", ["draft", "active", "archived"]);
export const geofenceContainmentStateEnum = pgEnum("geofence_containment_state", ["unknown", "inside", "outside"]);
export const geofenceEventTypeEnum = pgEnum("geofence_event_type", ["breached", "reentered", "reset"]);
export const historyEventKindEnum = pgEnum("history_event_kind", ["stay", "trip", "gap"]);
export const historyEventStatusEnum = pgEnum("history_event_status", ["ongoing", "finalized"]);
export const historyTripModeEnum = pgEnum("history_trip_mode", ["walking", "vehicle", "unknown"]);
export const historyModeConfidenceEnum = pgEnum("history_mode_confidence", ["high", "medium", "low"]);
export const historyGapReasonEnum = pgEnum("history_gap_reason", ["telemetry_gap", "offline", "moved_while_sleeping"]);
export const historyPlaceMatchTypeEnum = pgEnum("history_place_match_type", ["saved", "exact", "near", "address", "pending", "unavailable"]);
export const historyPlaceEnrichmentStatusEnum = pgEnum("history_place_enrichment_status", ["pending", "completed", "failed", "unavailable"]);
export const historyEnrichmentJobTypeEnum = pgEnum("history_enrichment_job_type", ["place", "roads"]);
export const historyEnrichmentJobStatusEnum = pgEnum("history_enrichment_job_status", ["pending", "processing", "completed", "failed", "rejected"]);
export const pushInstallationPlatformEnum = pgEnum("push_installation_platform", ["ios", "android"]);
export const pushInstallationStatusEnum = pgEnum("push_installation_status", ["active", "disabled"]);
export const pushDeliveryStatusEnum = pgEnum("push_delivery_status", ["pending", "ticketed", "delivered", "failed", "cancelled"]);
export const notificationPriorityEnum = pgEnum("notification_priority", ["general", "child_safety"]);
export const notificationTypeEnum = pgEnum("notification_type", ["geofence_breached", "geofence_reentered"]);
export const placeKindEnum = pgEnum("place_kind", ["school"]);
export const locationSourceEnum = pgEnum("location_source", ["gps", "cell", "network", "none"]);
export const cellLookupModeEnum = pgEnum("cell_lookup_mode", ["normal", "fast"]);

export const places = pgTable("places", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: placeKindEnum("kind").notNull().default("school"),
  provider: text("provider").notNull().default("google"),
  providerPlaceId: text("provider_place_id").notNull(),
  label: text("label").notNull(),
  formattedAddress: text("formatted_address"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  raw: jsonb("raw").$type<Record<string, unknown> | null>(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueProviderPlace: uniqueIndex("places_provider_place_unique").on(table.provider, table.providerPlaceId),
  kindLabelIdx: index("places_kind_label_idx").on(table.kind, table.label),
}));

export const children = pgTable("children", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentUserId: uuid("parent_user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  schoolName: text("school_name"),
  schoolPlaceId: uuid("school_place_id").references(() => places.id, { onDelete: "set null" }),
  gender: text("gender"),
  dateOfBirth: date("date_of_birth"),
  creationIdempotencyKey: uuid("creation_idempotency_key"),
  status: childLifecycleStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  parentUserIdIdx: index("children_parent_user_id_idx").on(table.parentUserId),
  organizationIdIdx: index("children_organization_id_idx").on(table.organizationId),
  creationIdempotencyKeyUnique: uniqueIndex("children_creation_idempotency_key_unique").on(table.creationIdempotencyKey),
}));

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  hardwareIdentifier: text("hardware_identifier").notNull(),
  displayName: text("display_name"),
  platform: devicePlatformEnum("platform").notNull().default("unknown"),
  status: deviceStatusEnum("status").notNull().default("fresh"),
  authTokenHash: text("auth_token_hash"),
  reservedByUserId: uuid("reserved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  reservedByOrganizationId: uuid("reserved_by_organization_id").references(() => organizations.id, { onDelete: "set null" }),
  reservationTokenHash: text("reservation_token_hash"),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  hardwareIdentifierUnique: uniqueIndex("devices_hardware_identifier_unique").on(table.hardwareIdentifier),
}));

export const childDeviceBindings = pgTable("child_device_bindings", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
  unboundAt: timestamp("unbound_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdIdx: index("child_device_bindings_child_id_idx").on(table.childId),
  deviceIdIdx: index("child_device_bindings_device_id_idx").on(table.deviceId),
  activeChildUnique: uniqueIndex("child_device_bindings_active_child_unique")
    .on(table.childId)
    .where(sql`${table.unboundAt} IS NULL`),
  activeDeviceUnique: uniqueIndex("child_device_bindings_active_device_unique")
    .on(table.deviceId)
    .where(sql`${table.unboundAt} IS NULL`),
}));

export const locationEvents = pgTable("location_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  gpsConnected: boolean("gps_connected").notNull().default(true),
  locationSource: locationSourceEnum("location_source").notNull().default("gps"),
  locationLabel: text("location_label"),
  accuracyMeters: numeric("accuracy_meters", { precision: 8, scale: 2 }),
  batteryPercent: integer("battery_percent"),
  batteryVoltageMv: integer("battery_voltage_mv"),
  signalStrength: smallint("signal_strength"),
  satelliteCount: smallint("satellite_count"),
  stepCounter: integer("step_counter").notNull().default(0),
  deviceState: deviceTelemetryStateEnum("device_state").notNull().default("active"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdIdx: index("location_events_child_id_idx").on(table.childId),
  childOccurredAtIdIdx: index("location_events_child_occurred_at_id_idx").on(table.childId, table.occurredAt, table.id),
  deviceIdIdx: index("location_events_device_id_idx").on(table.deviceId),
  deviceIngestedAtIdx: index("location_events_device_ingested_at_idx").on(table.deviceId, table.ingestedAt),
  occurredAtIdx: index("location_events_occurred_at_idx").on(table.occurredAt),
}));

export const cellLocationEstimates = pgTable("cell_location_estimates", {
  id: uuid("id").defaultRandom().primaryKey(),
  locationEventId: uuid("location_event_id").notNull().references(() => locationEvents.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  lookupMode: cellLookupModeEnum("lookup_mode").notNull(),
  towerObservation: jsonb("tower_observation").$type<Record<string, unknown>>().notNull(),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  accuracyMeters: numeric("accuracy_meters", { precision: 10, scale: 2 }).notNull(),
  distanceFromPreviousMeters: numeric("distance_from_previous_meters", { precision: 10, scale: 2 }),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  locationEventUnique: uniqueIndex("cell_location_estimates_location_event_unique").on(table.locationEventId),
  childObservedAtIdx: index("cell_location_estimates_child_observed_at_idx").on(table.childId, table.observedAt),
  deviceObservedAtIdx: index("cell_location_estimates_device_observed_at_idx").on(table.deviceId, table.observedAt),
}));

export const historyEvents = pgTable("history_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  kind: historyEventKindEnum("kind").notNull(),
  status: historyEventStatusEnum("status").notNull().default("finalized"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  firstLocationEventId: uuid("first_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  lastLocationEventId: uuid("last_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  sampleCount: integer("sample_count").notNull().default(0),
  algorithmVersion: integer("algorithm_version").notNull(),
  representativeLatitude: numeric("representative_latitude", { precision: 9, scale: 6 }),
  representativeLongitude: numeric("representative_longitude", { precision: 9, scale: 6 }),
  stayRadiusMeters: integer("stay_radius_meters"),
  tripMode: historyTripModeEnum("trip_mode"),
  modeConfidence: historyModeConfidenceEnum("mode_confidence"),
  distanceMeters: integer("distance_meters"),
  filteredPath: jsonb("filtered_path").$type<Array<{ latitude: number; longitude: number; occurredAt?: string }> | null>(),
  gapReason: historyGapReasonEnum("gap_reason"),
  gapBeforeLatitude: numeric("gap_before_latitude", { precision: 9, scale: 6 }),
  gapBeforeLongitude: numeric("gap_before_longitude", { precision: 9, scale: 6 }),
  gapAfterLatitude: numeric("gap_after_latitude", { precision: 9, scale: 6 }),
  gapAfterLongitude: numeric("gap_after_longitude", { precision: 9, scale: 6 }),
  placeProvider: text("place_provider"),
  providerPlaceId: text("provider_place_id"),
  placeMatchType: historyPlaceMatchTypeEnum("place_match_type"),
  placeDistanceMeters: integer("place_distance_meters"),
  placeLabel: text("place_label"),
  formattedAddress: text("formatted_address"),
  placeContentFetchedAt: timestamp("place_content_fetched_at", { withTimezone: true }),
  placeContentExpiresAt: timestamp("place_content_expires_at", { withTimezone: true }),
  placeEnrichmentStatus: historyPlaceEnrichmentStatusEnum("place_enrichment_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childStartedAtIdx: index("history_events_child_started_at_idx").on(table.childId, table.startedAt),
  childEndedAtIdx: index("history_events_child_ended_at_idx").on(table.childId, table.endedAt),
  childStatusIdx: index("history_events_child_status_idx").on(table.childId, table.status),
  orgChildStartedAtIdx: index("history_events_org_child_started_at_idx").on(table.organizationId, table.childId, table.startedAt),
  stableSourceUnique: uniqueIndex("history_events_stable_source_unique")
    .on(table.childId, table.kind, table.firstLocationEventId)
    .where(sql`${table.firstLocationEventId} IS NOT NULL`),
  kindFieldsCheck: check("history_events_kind_fields_check", sql`
    (
      kind = 'stay'
      and representative_latitude is not null
      and representative_longitude is not null
      and stay_radius_meters is not null
      and trip_mode is null
      and mode_confidence is null
      and distance_meters is null
      and filtered_path is null
      and gap_reason is null
      and gap_before_latitude is null
      and gap_before_longitude is null
      and gap_after_latitude is null
      and gap_after_longitude is null
    )
    or (
      kind = 'trip'
      and trip_mode is not null
      and distance_meters is not null
      and filtered_path is not null
      and representative_latitude is null
      and representative_longitude is null
      and stay_radius_meters is null
      and gap_reason is null
      and gap_before_latitude is null
      and gap_before_longitude is null
      and gap_after_latitude is null
      and gap_after_longitude is null
      and place_provider is null
      and provider_place_id is null
      and place_match_type is null
      and place_label is null
    )
    or (
      kind = 'gap'
      and gap_reason is not null
      and representative_latitude is null
      and representative_longitude is null
      and trip_mode is null
      and mode_confidence is null
      and distance_meters is null
      and filtered_path is null
      and stay_radius_meters is null
      and place_provider is null
      and provider_place_id is null
      and place_match_type is null
      and place_label is null
    )
  `),
}));

export const historyProcessingStates = pgTable("history_processing_states", {
  childId: uuid("child_id").primaryKey().references(() => children.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }).notNull(),
  processedLocationEventId: uuid("processed_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  processedThroughAt: timestamp("processed_through_at", { withTimezone: true }),
  dirtyThroughLocationEventId: uuid("dirty_through_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  dirtyThroughAt: timestamp("dirty_through_at", { withTimezone: true }),
  openStayId: uuid("open_stay_id"),
  openTripId: uuid("open_trip_id"),
  candidateState: jsonb("candidate_state").$type<Record<string, unknown> | null>(),
  currentSessionState: jsonb("current_session_state").$type<Record<string, unknown> | null>(),
  currentSleepOfflineState: jsonb("current_sleep_offline_state").$type<Record<string, unknown> | null>(),
  algorithmVersion: integer("algorithm_version").notNull(),
  isProcessing: boolean("is_processing").notNull().default(false),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const historyEnrichmentJobs = pgTable("history_enrichment_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  historyEventId: uuid("history_event_id").notNull().references(() => historyEvents.id, { onDelete: "cascade" }),
  type: historyEnrichmentJobTypeEnum("type").notNull(),
  status: historyEnrichmentJobStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueEventType: uniqueIndex("history_enrichment_jobs_event_type_unique").on(table.historyEventId, table.type),
  statusNextAttemptIdx: index("history_enrichment_jobs_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
}));

export const historyRouteGeometryCache = pgTable("history_route_geometry_cache", {
  historyEventId: uuid("history_event_id").primaryKey().references(() => historyEvents.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("google_roads"),
  geometry: jsonb("geometry").$type<Array<{ latitude: number; longitude: number }> | null>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  expiresAtIdx: index("history_route_geometry_cache_expires_at_idx").on(table.expiresAt),
}));

export const childTrailGeometryCache = pgTable("child_trail_geometry_cache", {
  childId: uuid("child_id").primaryKey().references(() => children.id, { onDelete: "cascade" }),
  latestLocationEventId: uuid("latest_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  distanceMeters: integer("distance_meters").notNull(),
  geometrySource: text("geometry_source").notNull(),
  segments: jsonb("segments").$type<Record<string, unknown>[]>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  refreshAfter: timestamp("refresh_after", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  refreshLeaseUntil: timestamp("refresh_lease_until", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  latestLocationEventIdIdx: index("child_trail_geometry_cache_latest_location_event_id_idx").on(table.latestLocationEventId),
  expiresAtIdx: index("child_trail_geometry_cache_expires_at_idx").on(table.expiresAt),
  refreshAfterIdx: index("child_trail_geometry_cache_refresh_after_idx").on(table.refreshAfter),
}));

export const childStatusSnapshots = pgTable("child_status_snapshots", {
  childId: uuid("child_id").primaryKey().references(() => children.id, { onDelete: "cascade" }),
  lastLocationEventId: uuid("last_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  lastLatitude: numeric("last_latitude", { precision: 9, scale: 6 }),
  lastLongitude: numeric("last_longitude", { precision: 9, scale: 6 }),
  lastLocationLabel: text("last_location_label"),
  lastLocationSource: locationSourceEnum("last_location_source"),
  lastLocationAccuracyMeters: numeric("last_location_accuracy_meters", { precision: 10, scale: 2 }),
  lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
  lastGpsConnected: boolean("last_gps_connected"),
  lastGpsFixAt: timestamp("last_gps_fix_at", { withTimezone: true }),
  gpsOutageStartedAt: timestamp("gps_outage_started_at", { withTimezone: true }),
  cellLookupMode: cellLookupModeEnum("cell_lookup_mode").notNull().default("normal"),
  nextCellLookupAt: timestamp("next_cell_lookup_at", { withTimezone: true }),
  cellLookupLeaseUntil: timestamp("cell_lookup_lease_until", { withTimezone: true }),
  cellOutageGeneration: integer("cell_outage_generation").notNull().default(0),
  cellStableSampleCount: smallint("cell_stable_sample_count").notNull().default(0),
  lastCellLatitude: numeric("last_cell_latitude", { precision: 9, scale: 6 }),
  lastCellLongitude: numeric("last_cell_longitude", { precision: 9, scale: 6 }),
  lastCellAccuracyMeters: numeric("last_cell_accuracy_meters", { precision: 10, scale: 2 }),
  lastCellEstimateAt: timestamp("last_cell_estimate_at", { withTimezone: true }),
  lastBatteryPercent: integer("last_battery_percent"),
  lastBatteryVoltageMv: integer("last_battery_voltage_mv"),
  lastSignalStrength: smallint("last_signal_strength"),
  lastSatelliteCount: smallint("last_satellite_count"),
  lastRawStepCounter: integer("last_raw_step_counter"),
  lastStepDelta: integer("last_step_delta").notNull().default(0),
  stepsThisHour: integer("steps_this_hour").notNull().default(0),
  currentHourBucketStart: timestamp("current_hour_bucket_start", { withTimezone: true }),
  // Running daily total for live Activity metrics. Kept alongside the local date
  // and timezone it was accumulated in so rollover happens at the child's local
  // midnight rather than the server's, and so a stale total is never misread as
  // today's.
  stepsToday: integer("steps_today").notNull().default(0),
  stepsTodayDate: date("steps_today_date"),
  stepsTodayTimezone: text("steps_today_timezone"),
  // IANA zone derived from the device's last known coordinate.
  deviceTimezone: text("device_timezone"),
  lastDeviceState: deviceTelemetryStateEnum("last_device_state").notNull().default("active"),
  status: childTrackingStatusEnum("status").notNull().default("offline"),
  statusLabel: text("status_label"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const childStepCountsHourly = pgTable("child_step_counts_hourly", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
  stepCount: integer("step_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdIdx: index("child_step_counts_hourly_child_id_idx").on(table.childId),
  deviceIdIdx: index("child_step_counts_hourly_device_id_idx").on(table.deviceId),
  bucketStartIdx: index("child_step_counts_hourly_bucket_start_idx").on(table.bucketStart),
  uniqueChildDeviceHour: uniqueIndex("child_step_counts_hourly_child_device_hour_unique").on(
    table.childId,
    table.deviceId,
    table.bucketStart,
  ),
}));

export const childActivityMinuteBuckets = pgTable("child_activity_minute_buckets", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  minuteStart: timestamp("minute_start", { withTimezone: true }).notNull(),
  eventDate: date("event_date").notNull(),
  totalSteps: integer("total_steps").notNull().default(0),
  activeSteps: integer("active_steps").notNull().default(0),
  activeSeconds: integer("active_seconds").notNull().default(0),
  sampleCount: integer("sample_count").notNull().default(0),
  representativeLatitude: numeric("representative_latitude", { precision: 9, scale: 6 }),
  representativeLongitude: numeric("representative_longitude", { precision: 9, scale: 6 }),
  sourceLocationEventId: uuid("source_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childDateIdx: index("child_activity_minute_child_date_idx").on(table.childId, table.eventDate),
  childMinuteIdx: index("child_activity_minute_child_minute_idx").on(table.childId, table.minuteStart),
  uniqueChildDeviceMinute: uniqueIndex("child_activity_minute_unique").on(
    table.childId,
    table.deviceId,
    table.minuteStart,
  ),
}));

export const activityLocationLabelCache = pgTable("activity_location_label_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  roundedLatitude: numeric("rounded_latitude", { precision: 9, scale: 4 }).notNull(),
  roundedLongitude: numeric("rounded_longitude", { precision: 9, scale: 4 }).notNull(),
  provider: text("provider").notNull().default("google"),
  displayLabel: text("display_label").notNull(),
  formattedAddress: text("formatted_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiresAtIdx: index("activity_location_label_cache_expires_idx").on(table.expiresAt),
  uniqueProviderCoordinate: uniqueIndex("activity_location_label_cache_unique").on(
    table.provider,
    table.roundedLatitude,
    table.roundedLongitude,
  ),
}));

export const childGeofences = pgTable("child_geofences", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: childGeofenceStatusEnum("status").notNull().default("enabled"),
  containmentState: geofenceContainmentStateEnum("containment_state").notNull().default("unknown"),
  candidateState: geofenceContainmentStateEnum("candidate_state").notNull().default("unknown"),
  candidateSampleCount: integer("candidate_sample_count").notNull().default(0),
  generation: integer("generation").notNull().default(1),
  lastDistanceMeters: numeric("last_distance_meters", { precision: 10, scale: 2 }),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  breachedAt: timestamp("breached_at", { withTimezone: true }),
  lastReenteredAt: timestamp("last_reentered_at", { withTimezone: true }),
  centerLatitude: numeric("center_latitude", { precision: 9, scale: 6 }),
  centerLongitude: numeric("center_longitude", { precision: 9, scale: 6 }),
  radiusMeters: integer("radius_meters"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdUnique: uniqueIndex("child_geofences_child_id_unique").on(table.childId),
  organizationIdIdx: index("child_geofences_organization_id_idx").on(table.organizationId),
}));

export const geofenceEvents = pgTable("geofence_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  geofenceId: uuid("geofence_id").notNull().references(() => childGeofences.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  locationEventId: uuid("location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  eventType: geofenceEventTypeEnum("event_type").notNull(),
  generation: integer("generation").notNull().default(1),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  distanceMeters: numeric("distance_meters", { precision: 10, scale: 2 }),
  radiusMeters: integer("radius_meters"),
  dedupKey: text("dedup_key").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dedupKeyUnique: uniqueIndex("geofence_events_dedup_key_unique").on(table.dedupKey),
  childIdIdx: index("geofence_events_child_id_idx").on(table.childId),
  childOccurredAtIdx: index("geofence_events_child_occurred_at_idx").on(table.childId, table.occurredAt),
  organizationIdIdx: index("geofence_events_organization_id_idx").on(table.organizationId),
  occurredAtIdx: index("geofence_events_occurred_at_idx").on(table.occurredAt),
}));

export const adminGeofenceEventAcknowledgments = pgTable("admin_geofence_event_acknowledgments", {
  id: uuid("id").defaultRandom().primaryKey(),
  geofenceEventId: uuid("geofence_event_id").notNull().references(() => geofenceEvents.id, { onDelete: "cascade" }),
  acknowledgedByUserId: uuid("acknowledged_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  geofenceEventUnique: uniqueIndex("admin_geofence_ack_geofence_event_unique").on(table.geofenceEventId),
  acknowledgedByUserIdIdx: index("admin_geofence_ack_acknowledged_by_user_id_idx").on(table.acknowledgedByUserId),
  acknowledgedAtIdx: index("admin_geofence_ack_acknowledged_at_idx").on(table.acknowledgedAt),
}));

export const pushInstallations = pgTable("push_installations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  installationId: text("installation_id").notNull(),
  expoPushToken: text("expo_push_token").notNull(),
  platform: pushInstallationPlatformEnum("platform").notNull(),
  appVersion: text("app_version"),
  status: pushInstallationStatusEnum("status").notNull().default("active"),
  lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true }).notNull().defaultNow(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expoPushTokenUnique: uniqueIndex("push_installations_expo_push_token_unique").on(table.expoPushToken),
  userInstallationUnique: uniqueIndex("push_installations_user_installation_unique").on(table.userId, table.installationId),
  userIdIdx: index("push_installations_user_id_idx").on(table.userId),
  statusIdx: index("push_installations_status_idx").on(table.status),
}));

export const userNotifications = pgTable("user_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  childId: uuid("child_id").references(() => children.id, { onDelete: "set null" }),
  geofenceEventId: uuid("geofence_event_id").references(() => geofenceEvents.id, { onDelete: "set null" }),
  type: notificationTypeEnum("type").notNull(),
  priority: notificationPriorityEnum("priority").notNull().default("general"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_notifications_user_id_idx").on(table.userId),
  organizationIdIdx: index("user_notifications_organization_id_idx").on(table.organizationId),
  occurredAtIdx: index("user_notifications_occurred_at_idx").on(table.occurredAt),
  readAtIdx: index("user_notifications_read_at_idx").on(table.readAt),
  userGeofenceEventUnique: uniqueIndex("user_notifications_user_geofence_event_unique")
    .on(table.userId, table.geofenceEventId)
    .where(sql`${table.geofenceEventId} IS NOT NULL`),
}));

export const pushDeliveryJobs = pgTable("push_delivery_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userNotificationId: uuid("user_notification_id").notNull().references(() => userNotifications.id, { onDelete: "cascade" }),
  pushInstallationId: uuid("push_installation_id").notNull().references(() => pushInstallations.id, { onDelete: "cascade" }),
  status: pushDeliveryStatusEnum("status").notNull().default("pending"),
  expoTicketId: text("expo_ticket_id"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  receiptCheckedAt: timestamp("receipt_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusNextAttemptIdx: index("push_delivery_jobs_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
  notificationIdIdx: index("push_delivery_jobs_notification_id_idx").on(table.userNotificationId),
  installationIdIdx: index("push_delivery_jobs_installation_id_idx").on(table.pushInstallationId),
}));

export const childShareLinks = pgTable("child_share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: shareStatusEnum("status").notNull().default("active"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("child_share_links_token_hash_unique").on(table.tokenHash),
  childIdIdx: index("child_share_links_child_id_idx").on(table.childId),
  expiresAtIdx: index("child_share_links_expires_at_idx").on(table.expiresAt),
  activeChildUnique: uniqueIndex("child_share_links_active_child_unique")
    .on(table.childId)
    .where(sql`${table.status} = 'active'`),
}));

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  durationMonths: integer("duration_months").notNull(),
  amountMinor: integer("amount_minor"),
  currencyCode: text("currency_code"),
  status: planStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const childPlanSubscriptions = pgTable("child_plan_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  source: subscriptionSourceEnum("source").notNull().default("admin"),
  externalOrderId: text("external_order_id"),
  externalPurchaseId: text("external_purchase_id"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdIdx: index("child_plan_subscriptions_child_id_idx").on(table.childId),
  planIdIdx: index("child_plan_subscriptions_plan_id_idx").on(table.planId),
  activeSubscriptionUnique: uniqueIndex("child_plan_subscriptions_active_child_unique")
    .on(table.childId)
    .where(sql`${table.status} = 'active'`),
}));

export const stepCountsDaily = pgTable("step_counts_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  eventDate: date("event_date").notNull(),
  stepCount: integer("step_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childIdIdx: index("step_counts_daily_child_id_idx").on(table.childId),
  deviceIdIdx: index("step_counts_daily_device_id_idx").on(table.deviceId),
  eventDateIdx: index("step_counts_daily_event_date_idx").on(table.eventDate),
  uniqueChildDeviceDate: uniqueIndex("step_counts_daily_child_device_date_unique").on(
    table.childId,
    table.deviceId,
    table.eventDate,
  ),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  targetRole: text("target_role"),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
  status: contentStatusEnum("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  targetUserIdIdx: index("notifications_target_user_id_idx").on(table.targetUserId),
  statusIdx: index("notifications_status_idx").on(table.status),
}));

export const cmsPages = pgTable("cms_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: contentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugUnique: uniqueIndex("cms_pages_slug_unique").on(table.slug),
  statusIdx: index("cms_pages_status_idx").on(table.status),
}));

export const feedbackSubmissions = pgTable("feedback_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email"),
  phoneNumber: text("phone_number"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  children: many(children),
  createdShareLinks: many(childShareLinks),
}));

export const childrenRelations = relations(children, ({ one, many }) => ({
  legacyParent: one(users, {
    fields: [children.parentUserId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [children.organizationId],
    references: [organizations.id],
  }),
  deviceBindings: many(childDeviceBindings),
  locationEvents: many(locationEvents),
  snapshot: one(childStatusSnapshots, {
    fields: [children.id],
    references: [childStatusSnapshots.childId],
  }),
  shareLinks: many(childShareLinks),
  subscriptions: many(childPlanSubscriptions),
}));

export const devicesRelations = relations(devices, ({ many }) => ({
  childBindings: many(childDeviceBindings),
  locationEvents: many(locationEvents),
  stepCountsHourly: many(childStepCountsHourly),
  stepCountsDaily: many(stepCountsDaily),
}));

export const childDeviceBindingsRelations = relations(childDeviceBindings, ({ one }) => ({
  child: one(children, {
    fields: [childDeviceBindings.childId],
    references: [children.id],
  }),
  device: one(devices, {
    fields: [childDeviceBindings.deviceId],
    references: [devices.id],
  }),
}));

export const locationEventsRelations = relations(locationEvents, ({ one }) => ({
  child: one(children, {
    fields: [locationEvents.childId],
    references: [children.id],
  }),
  device: one(devices, {
    fields: [locationEvents.deviceId],
    references: [devices.id],
  }),
}));

export const stepCountsDailyRelations = relations(stepCountsDaily, ({ one }) => ({
  child: one(children, {
    fields: [stepCountsDaily.childId],
    references: [children.id],
  }),
  device: one(devices, {
    fields: [stepCountsDaily.deviceId],
    references: [devices.id],
  }),
}));

export const childStepCountsHourlyRelations = relations(childStepCountsHourly, ({ one }) => ({
  child: one(children, {
    fields: [childStepCountsHourly.childId],
    references: [children.id],
  }),
  device: one(devices, {
    fields: [childStepCountsHourly.deviceId],
    references: [devices.id],
  }),
}));

export const childStatusSnapshotsRelations = relations(childStatusSnapshots, ({ one }) => ({
  child: one(children, {
    fields: [childStatusSnapshots.childId],
    references: [children.id],
  }),
  lastLocationEvent: one(locationEvents, {
    fields: [childStatusSnapshots.lastLocationEventId],
    references: [locationEvents.id],
  }),
}));

export const childTrailGeometryCacheRelations = relations(childTrailGeometryCache, ({ one }) => ({
  child: one(children, {
    fields: [childTrailGeometryCache.childId],
    references: [children.id],
  }),
  latestLocationEvent: one(locationEvents, {
    fields: [childTrailGeometryCache.latestLocationEventId],
    references: [locationEvents.id],
  }),
}));

export const childShareLinksRelations = relations(childShareLinks, ({ one }) => ({
  child: one(children, {
    fields: [childShareLinks.childId],
    references: [children.id],
  }),
  createdByUser: one(users, {
    fields: [childShareLinks.createdByUserId],
    references: [users.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(childPlanSubscriptions),
}));

export const childPlanSubscriptionsRelations = relations(childPlanSubscriptions, ({ one }) => ({
  child: one(children, {
    fields: [childPlanSubscriptions.childId],
    references: [children.id],
  }),
  plan: one(plans, {
    fields: [childPlanSubscriptions.planId],
    references: [plans.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  targetUser: one(users, {
    fields: [notifications.targetUserId],
    references: [users.id],
  }),
}));

export const geofenceEventsRelations = relations(geofenceEvents, ({ one }) => ({
  geofence: one(childGeofences, {
    fields: [geofenceEvents.geofenceId],
    references: [childGeofences.id],
  }),
  child: one(children, {
    fields: [geofenceEvents.childId],
    references: [children.id],
  }),
}));

export const pushInstallationsRelations = relations(pushInstallations, ({ one, many }) => ({
  user: one(users, {
    fields: [pushInstallations.userId],
    references: [users.id],
  }),
  deliveryJobs: many(pushDeliveryJobs),
}));

export const userNotificationsRelations = relations(userNotifications, ({ one, many }) => ({
  user: one(users, {
    fields: [userNotifications.userId],
    references: [users.id],
  }),
  child: one(children, {
    fields: [userNotifications.childId],
    references: [children.id],
  }),
  geofenceEvent: one(geofenceEvents, {
    fields: [userNotifications.geofenceEventId],
    references: [geofenceEvents.id],
  }),
  deliveryJobs: many(pushDeliveryJobs),
}));

export const pushDeliveryJobsRelations = relations(pushDeliveryJobs, ({ one }) => ({
  userNotification: one(userNotifications, {
    fields: [pushDeliveryJobs.userNotificationId],
    references: [userNotifications.id],
  }),
  pushInstallation: one(pushInstallations, {
    fields: [pushDeliveryJobs.pushInstallationId],
    references: [pushInstallations.id],
  }),
}));
