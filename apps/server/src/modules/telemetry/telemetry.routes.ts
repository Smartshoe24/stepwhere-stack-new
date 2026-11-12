import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  ChildHistoryDayResponseSchema,
  ChildLiveResponseSchema,
  ChildSummarySchema,
  ChildTrailResponseSchema,
  LocationHistoryResponseSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity, deviceIngestSecurity, deviceSecurity } from "../../openapi/security";
import { badRequest } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { deviceAuthMiddleware } from "../devices/device-auth.middleware";
import { requireChildCoverage } from "../billing/billing-coverage.service";
import { getChildHistoryDayForOrganization } from "../history/history.service";
import { deviceIngestAuthMiddleware } from "./device-ingest.middleware";
import { telemetryIngestDebugMiddleware } from "./telemetry-ingest-debug.middleware";
import { getChildTrailForOrganization, getLocationHistoryForOrganization, getLiveChildForOrganization, ingestLocation, ingestSteps } from "./telemetry.service";

const cellularTowerSchema = z.object({
  role: z.enum(["serving", "neighbor"]),
  mobileCountryCode: z.number().int().min(0).max(999),
  mobileNetworkCode: z.number().int().min(0).max(999),
  trackingAreaCode: z.number().int().min(0).max(65_535),
  cellId: z.number().int().min(0).max(268_435_455),
  physicalCellId: z.number().int().min(0).max(503).nullable().optional(),
  band: z.string().trim().max(40).nullable().optional(),
  earfcn: z.number().int().nonnegative().nullable().optional(),
  rxDbm: z.number().min(-200).max(100).nullable().optional(),
  txDbm: z.number().min(-200).max(100).nullable().optional(),
  rsrpDbm: z.number().min(-200).max(100).nullable().optional(),
  rsrqDb: z.number().min(-100).max(100).nullable().optional(),
  sinrDb: z.number().min(-100).max(100).nullable().optional(),
});

const cellularSchema = z.object({
  radioType: z.literal("lte"),
  duplexMode: z.enum(["fdd", "tdd"]).nullable().optional(),
  towers: z.array(cellularTowerSchema).min(1).max(16),
}).refine(
  (value) => value.towers.filter((tower) => tower.role === "serving").length === 1,
  { message: "Exactly one serving cell tower is required.", path: ["towers"] },
);

const telemetrySimulationSchema = z.object({
  cellLookupNormalIntervalSeconds: z.number().int().min(1).max(420),
  cellLookupFastIntervalSeconds: z.number().int().min(1).max(60),
}).refine(
  (value) => value.cellLookupFastIntervalSeconds <= value.cellLookupNormalIntervalSeconds,
  {
    message: "Fast cell lookup interval must not exceed the normal interval.",
    path: ["cellLookupFastIntervalSeconds"],
  },
);

const wifiSchema = z.object({
  accessPoints: z.array(z.object({
    macAddress: z.string().regex(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/),
    signalStrengthDbm: z.number().int().min(-128).max(0),
    channel: z.number().int().min(1).max(14),
    ageMs: z.number().int().min(0).max(4_294_967_295),
  })).min(1).max(16),
});

const wifiModemStateDebugSchema = z.object({
  capturedAtUptimeMs: z.number().int().nonnegative(),
  cfun: z.number().int().min(0).max(127).nullable(),
  registrationStatus: z.number().int().min(0).max(10).nullable(),
  dataConnected: z.boolean().nullable(),
  gprsIp: z.string().max(39).nullable(),
});

const wifiExperimentStageDebugSchema = z.object({
  status: z.enum(["not_started", "running", "success", "no_results", "command_failed", "parse_failed", "timeout", "skipped", "aborted"]),
  skipReason: z.string().max(95).nullable(),
  startedAtUptimeMs: z.number().int().nonnegative().nullable(),
  scanStartedAtUptimeMs: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  observedAccessPointCount: z.number().int().nonnegative(),
  retainedAccessPointCount: z.number().int().min(0).max(16),
  commandGapMs: z.number().int().nonnegative().nullable(),
  modemState: wifiModemStateDebugSchema.nullable(),
  batteryBeforeMv: z.number().int().positive().nullable(),
  batteryAfterMv: z.number().int().positive().nullable(),
  rawResponse: z.string().max(256).nullable(),
  rawResponseTruncated: z.boolean(),
  error: z.string().max(95).nullable(),
});

const wifiExperimentDebugSchema = z.object({
  experimentVersion: z.literal(1),
  modemRevision: z.string().max(95).nullable(),
  mcuResetFlags: z.number().int().min(0).max(4_294_967_295),
  state: z.enum(["not_started", "running", "completed", "completed_with_skips", "aborted"]),
  gpsDisabled: z.boolean(),
  sleepSuppressed: z.boolean(),
  awakeUntilUptimeMs: z.number().int().min(0).max(4_294_967_295).nullable(),
  stages: z.object({
    disconnected: wifiExperimentStageDebugSchema,
    connected_before_cell: wifiExperimentStageDebugSchema,
    connected_after_cell: wifiExperimentStageDebugSchema,
    connected_after_cell_quiet: wifiExperimentStageDebugSchema,
  }),
});

const wifiExperimentSummaryStageDebugSchema = z.object({
  status: wifiExperimentStageDebugSchema.shape.status,
  skipReason: z.string().max(95).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  observedAccessPointCount: z.number().int().nonnegative(),
  retainedAccessPointCount: z.number().int().min(0).max(16),
  commandGapMs: z.number().int().nonnegative().nullable(),
  error: z.string().max(95).nullable(),
});

// Compact boot comparison sent once per boot; the full record is TTL-only.
const wifiExperimentSummaryDebugSchema = z.object({
  modemRevision: z.string().max(95).nullable(),
  mcuResetFlags: z.number().int().min(0).max(4_294_967_295),
  state: wifiExperimentDebugSchema.shape.state,
  stages: z.object({
    disconnected: wifiExperimentSummaryStageDebugSchema,
    connected_before_cell: wifiExperimentSummaryStageDebugSchema,
    connected_after_cell: wifiExperimentSummaryStageDebugSchema,
    connected_after_cell_quiet: wifiExperimentSummaryStageDebugSchema,
  }),
});

const telemetryDebugSchema = z.object({
  firmwareVersion: z.string().max(32),
  uptimeMs: z.number().int().nonnegative(),
  system: z.object({
    ready: z.boolean(),
    modemPowered: z.boolean(),
    imeiValid: z.boolean(),
    gprsConnected: z.boolean(),
    gpsReady: z.boolean(),
    accelerometerReady: z.boolean(),
  }),
  modem: z.object({ gprsIp: z.string().max(39).nullable() }),
  gps: z.object({
    locationValid: z.boolean(),
    fixAgeMs: z.number().int().nonnegative().nullable().optional(),
    satellitesValid: z.boolean(),
    satellites: z.number().int().nonnegative().nullable(),
    speedKmph: z.number().nullable(),
    altitudeMeters: z.number().nullable(),
    utc: z.string().max(24).nullable(),
    charactersProcessed: z.number().int().nonnegative(),
    sentencesWithFix: z.number().int().nonnegative(),
    failedChecksum: z.number().int().nonnegative(),
  }),
  power: z.object({
    batteryAdcRaw: z.number().int().min(0).max(4095),
    vrefAdcRaw: z.number().int().min(0).max(4095),
    vddaMv: z.number().int().nonnegative().nullable(),
    batteryVoltageMv: z.number().int().positive(),
    batteryPercent: z.number().int().min(0).max(100),
    chargeStatus: z.enum(["unknown", "charging", "complete", "error", "idle"]),
    lowBattery: z.boolean(),
  }),
  activity: z.object({
    stepsThisMinute: z.number().int().nonnegative(),
    pendingSteps: z.number().int().nonnegative(),
    totalSteps: z.number().int().nonnegative(),
    minuteCounter: z.number().int().nonnegative(),
    active: z.boolean(),
    sleepMode: z.boolean(),
    sleepMinuteCount: z.number().int().nonnegative(),
    lastActiveAgoMs: z.number().int().nonnegative(),
  }),
  cellQuery: z.object({
    status: z.enum(["success", "skipped_gps_fix", "command_failed", "parse_failed"]),
    rawResponse: z.string().max(255).nullable(),
    error: z.string().max(95).nullable(),
  }),
  wifiScan: z.object({
    status: z.enum(["success", "no_results", "skipped_gps_fix", "skipped_cooldown", "skipped_backoff", "command_failed", "parse_failed", "timeout"]),
    durationMs: z.number().int().nonnegative().nullable(),
    accessPointCount: z.number().int().nonnegative(),
    rawResponse: z.string().max(1024).nullable(),
    rawResponseTruncated: z.boolean(),
    error: z.string().max(95).nullable(),
    modemState: wifiModemStateDebugSchema.nullable().optional(),
    attempts: z.number().int().min(0).max(2).optional(),
    quietMs: z.number().int().min(0).max(4_294_967_295).nullable().optional(),
  }).optional(),
  wifiExperiment: wifiExperimentDebugSchema.optional(),
  wifiExperimentSummary: wifiExperimentSummaryDebugSchema.optional(),
  http: z.object({
    previousResult: z.enum(["not_attempted", "accepted", "http_error", "transport_error"]),
    previousFailureReason: z.enum(["payload_rejected"]).nullable().optional(),
    previousStatusCode: z.number().int().min(100).max(999).nullable(),
    previousDurationMs: z.number().int().nonnegative().nullable(),
    previousBodyBytes: z.number().int().nonnegative().nullable().optional(),
    bodyLimitBytes: z.number().int().positive().optional(),
    payloadDetail: z.enum(["full", "compact"]).optional(),
    consecutiveFailures: z.number().int().nonnegative(),
  }),
});

const locationSchema = z.object({
  hardwareIdentifier: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  gpsFixValid: z.boolean().optional(),
  cellular: cellularSchema.nullable().optional(),
  wifi: wifiSchema.nullable().optional(),
  simulation: telemetrySimulationSchema.optional(),
  debug: telemetryDebugSchema.optional(),
  accuracyMeters: z.number().nonnegative().nullable().optional(),
  batteryPercent: z.number().int().min(0).max(100).nullable().optional(),
  batteryVoltageMv: z.number().int().positive().nullable().optional(),
  signalStrength: z.number().int().min(0).max(5).nullable().optional(),
  satelliteCount: z.number().int().nonnegative().nullable().optional(),
  stepCounter: z.number().int().nonnegative(),
  deviceState: z.enum(["active", "sleep", "offline"]).optional(),
});

const stepSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stepCount: z.number().int().nonnegative(),
});

const childParamsSchema = z.object({
  childId: UuidSchema.openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const historyQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().openapi({
    param: {
      name: "date",
      in: "query",
    },
  }),
  timezone: z.string().min(1).optional().openapi({
    param: {
      name: "timezone",
      in: "query",
    },
  }),
  page: z.coerce.number().int().positive().default(1).openapi({
    param: {
      name: "page",
      in: "query",
    },
  }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({
    param: {
      name: "pageSize",
      in: "query",
    },
  }),
});

const trailQuerySchema = z.object({
  distanceMeters: z.coerce.number().int().positive().max(10_000).default(2_000).openapi({
    param: {
      name: "distanceMeters",
      in: "query",
    },
  }),
  geometry: z.enum(["filtered", "roads"]).default("roads").openapi({
    param: {
      name: "geometry",
      in: "query",
    },
  }),
});

const ingestLocationRoute = createRoute({
  method: "post",
  path: "/telemetry/location",
  tags: ["Telemetry"],
  security: deviceIngestSecurity,
  middleware: [
    telemetryIngestDebugMiddleware,
    deviceIngestAuthMiddleware,
  ] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: locationSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(ChildSummarySchema, "Ingested location telemetry."),
    ...errorResponses([400, 401, 404, 409, 503]),
  },
});

const ingestStepsRoute = createRoute({
  method: "post",
  path: "/telemetry/steps",
  tags: ["Telemetry"],
  security: deviceSecurity,
  middleware: [deviceAuthMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: stepSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(z.object({
      eventDate: z.string(),
      stepCount: z.number().int(),
      childId: UuidSchema,
      deviceId: UuidSchema,
    }).openapi("StepTelemetryResult"), "Ingested step telemetry."),
    ...errorResponses([400, 401, 404]),
  },
});

const getLiveChildRoute = createRoute({
  method: "get",
  path: "/children/{childId}/live",
  tags: ["Telemetry"],
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ChildLiveResponseSchema, "Child live status."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const getHistoryRoute = createRoute({
  method: "get",
  path: "/children/{childId}/history",
  tags: ["History", "Telemetry"],
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
    query: historyQuerySchema,
  },
  responses: {
    200: jsonDataResponse(
      z.union([LocationHistoryResponseSchema, ChildHistoryDayResponseSchema]),
      "Legacy raw location history, or a materialized History day when date and timezone are supplied.",
    ),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const getTrailRoute = createRoute({
  method: "get",
  path: "/children/{childId}/trail",
  tags: ["Telemetry"],
  security: bearerSecurity,
  request: {
    params: childParamsSchema,
    query: trailQuerySchema,
  },
  responses: {
    200: jsonDataResponse(ChildTrailResponseSchema, "Child movement trail."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const telemetryIngestRoutes = createOpenApiApp();
const familyTelemetryRoutes = createOpenApiApp();

telemetryIngestRoutes.openapi(ingestLocationRoute, async (c) => {
  const body = c.req.valid("json");
  return created(c, await ingestLocation(body));
});

telemetryIngestRoutes.openapi(ingestStepsRoute, async (c) => {
  const device = c.get("device");
  const body = c.req.valid("json");
  return created(c, await ingestSteps(device.id, body));
});

familyTelemetryRoutes.openapi(getLiveChildRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  await requireChildCoverage(organization.id, childId);
  return ok(c, await getLiveChildForOrganization(organization.id, childId));
});

familyTelemetryRoutes.openapi(getHistoryRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");

  if (query.date || query.timezone) {
    if (!query.date || !query.timezone) {
      throw badRequest("History date and timezone must be supplied together.");
    }

    return ok(c, await getChildHistoryDayForOrganization(organization.id, childId, {
      date: query.date,
      timezone: query.timezone,
    }));
  }

  return ok(c, await getLocationHistoryForOrganization(organization.id, childId, query.page, query.pageSize));
});

familyTelemetryRoutes.openapi(getTrailRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const query = c.req.valid("query");
  return ok(c, await getChildTrailForOrganization(organization.id, childId, query.distanceMeters, query.geometry));
});

export {
  familyTelemetryRoutes,
  locationSchema as telemetryLocationSchema,
  telemetryIngestRoutes,
};
