import { beforeAll, describe, expect, it, vi } from "vitest";

// Payload shapes emitted by apps/firmware/stepwhere.dev.ino (v1.3-dev-wifi-quiet).
const modemState = {
  capturedAtUptimeMs: 23827,
  cfun: 1,
  registrationStatus: 5,
  dataConnected: true,
  gprsIp: "10.37.203.189",
};

const summaryStage = (status: string, error: string | null) => ({
  status,
  skipReason: null,
  durationMs: 3000,
  observedAccessPointCount: error ? 0 : 12,
  retainedAccessPointCount: error ? 0 : 12,
  commandGapMs: null,
  error,
});

function debug(overrides: { wifiScan?: object; http?: object; extra?: object } = {}) {
  return {
    firmwareVersion: "v1.3-dev-wifi-quiet",
    uptimeMs: 140030,
    system: { ready: true, modemPowered: true, imeiValid: true, gprsConnected: true, gpsReady: false, accelerometerReady: true },
    modem: { gprsIp: "10.37.203.189" },
    gps: { locationValid: false, fixAgeMs: null, satellitesValid: false, satellites: null, speedKmph: null, altitudeMeters: null, utc: null, charactersProcessed: 0, sentencesWithFix: 0, failedChecksum: 0 },
    power: { batteryAdcRaw: 2376, vrefAdcRaw: 1505, vddaMv: 3300, batteryVoltageMv: 3830, batteryPercent: 80, chargeStatus: "idle", lowBattery: false },
    activity: { stepsThisMinute: 0, pendingSteps: 0, totalSteps: 0, minuteCounter: 2, active: true, sleepMode: false, sleepMinuteCount: 0, lastActiveAgoMs: 1000 },
    cellQuery: { status: "success", rawResponse: null, error: null },
    wifiScan: {
      status: "success", durationMs: 2515, accessPointCount: 12, attempts: 1, quietMs: 15123,
      rawResponse: null, rawResponseTruncated: false, error: null, modemState: null,
      ...overrides.wifiScan,
    },
    http: {
      previousResult: "transport_error", previousFailureReason: "payload_rejected",
      previousBodyBytes: 4367, bodyLimitBytes: 4366, payloadDetail: "full",
      previousStatusCode: null, previousDurationMs: 178, consecutiveFailures: 13,
      ...overrides.http,
    },
    ...overrides.extra,
  };
}

const base = {
  hardwareIdentifier: "869938082392516",
  latitude: 0,
  longitude: 0,
  gpsFixValid: false,
  wifi: { accessPoints: [{ macAddress: "C0:06:C3:1F:BF:C9", signalStrengthDbm: -52, channel: 1, ageMs: 4000 }] },
  accuracyMeters: null,
  batteryPercent: 80,
  batteryVoltageMv: 3830,
  signalStrength: 0,
  satelliteCount: 0,
  stepCounter: 0,
  deviceState: "active",
};

type Schema = typeof import("./telemetry.routes")["telemetryLocationSchema"];
let schema: Schema;

beforeAll(async () => {
  vi.resetModules();
  process.env.NODE_ENV = "test";
  process.env.PORT = "3001";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
  process.env.BETTER_AUTH_SECRET = "test-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.DEVICE_PROVISIONING_SECRET = "test-provisioning-secret";
  process.env.DEVICE_INGEST_AUTH_DISABLED = "true";
  ({ telemetryLocationSchema: schema } = await import("./telemetry.routes"));
});

describe("telemetry location schema (dev firmware payloads)", () => {
  it("accepts the full-detail payload with the boot comparison summary", () => {
    const payload = {
      ...base,
      debug: debug({
        extra: {
          wifiExperimentSummary: {
            modemRevision: "N706B-A07-STD-BZ_CN1X-008",
            mcuResetFlags: 201326592,
            state: "completed",
            stages: {
              disconnected: summaryStage("command_failed", "ERROR"),
              connected_before_cell: summaryStage("command_failed", "ERROR"),
              connected_after_cell: summaryStage("success", null),
              connected_after_cell_quiet: summaryStage("success", null),
            },
          },
        },
      }),
    };
    const result = schema.safeParse(payload);
    expect(result.success).toBe(true);
    expect(result.data?.debug?.wifiExperimentSummary?.stages.connected_after_cell.retainedAccessPointCount).toBe(12);
  });

  it("accepts a compact payload with a failed scan retry and unknown quiet time", () => {
    const payload = {
      ...base,
      wifi: undefined,
      debug: debug({
        wifiScan: { status: "command_failed", attempts: 2, quietMs: null, error: "ERROR" },
        http: { payloadDetail: "compact", previousFailureReason: null, previousBodyBytes: null },
      }),
    };
    expect(schema.safeParse(payload).success).toBe(true);
  });

  it("accepts the minimal payload without debug", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("still accepts payloads from firmware without the new optional fields", () => {
    const legacy = debug();
    const { attempts: _a, quietMs: _q, ...wifiScan } = legacy.wifiScan;
    const { previousFailureReason: _r, previousBodyBytes: _b, bodyLimitBytes: _l, payloadDetail: _d, ...http } = legacy.http;
    expect(schema.safeParse({ ...base, debug: { ...legacy, wifiScan, http } }).success).toBe(true);
  });

  it("rejects an unknown failure reason", () => {
    const payload = { ...base, debug: debug({ http: { previousFailureReason: "unknown" } }) };
    expect(schema.safeParse(payload).success).toBe(false);
  });
});
