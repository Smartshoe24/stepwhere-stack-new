import { describe, expect, it } from "vitest";

import { deriveStepDelta, deriveTelemetryState, getHourBucketStart } from "./telemetry.helpers";

describe("telemetry helpers", () => {
  it("derives step deltas from increasing counters", () => {
    expect(deriveStepDelta(100, 125)).toBe(25);
  });

  it("treats the first counter as newly earned steps", () => {
    expect(deriveStepDelta(null, 18)).toBe(18);
  });

  it("treats counter rollbacks as device resets", () => {
    expect(deriveStepDelta(125, 9)).toBe(9);
  });

  it("floors timestamps to the utc hour", () => {
    expect(getHourBucketStart(new Date("2026-06-08T14:37:21.123Z")).toISOString()).toBe("2026-06-08T14:00:00.000Z");
  });

  it("keeps active telemetry at 59 seconds as active", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:00:59.000Z"))).toEqual({
      status: "safe",
      statusLabel: "School",
      telemetryState: "active",
    });
  });

  it("keeps active telemetry at exactly one minute as active", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:01:00.000Z"))).toEqual({
      status: "safe",
      statusLabel: "School",
      telemetryState: "active",
    });
  });

  it("maps active telemetry older than one minute to connecting", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:01:00.001Z"))).toEqual({
      status: "offline",
      statusLabel: "Connecting",
      telemetryState: "connecting",
    });
  });

  it("keeps active telemetry at exactly five minutes as active", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:05:00.000Z"))).toEqual({
      status: "offline",
      statusLabel: "Connecting",
      telemetryState: "connecting",
    });
  });

  it("maps active telemetry older than five minutes to offline", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:05:00.001Z"))).toEqual({
      status: "offline",
      statusLabel: "Offline",
      telemetryState: "offline",
    });
  });

  it("keeps active telemetry at five seconds as active", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "School",
    }, new Date("2026-06-08T10:00:05.000Z"))).toEqual({
      status: "safe",
      statusLabel: "School",
      telemetryState: "active",
    });
  });

  it("keeps recent sleep telemetry in sleep", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "sleep",
      status: "safe",
      statusLabel: "Live",
    }, new Date("2026-06-08T10:04:59.000Z"))).toEqual({
      status: "safe",
      statusLabel: "Sleep",
      telemetryState: "sleep",
    });
  });

  it("keeps stale sleep telemetry in sleep", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "sleep",
      status: "safe",
      statusLabel: "Live",
    }, new Date("2026-06-08T10:05:01.000Z"))).toEqual({
      status: "safe",
      statusLabel: "Sleep",
      telemetryState: "sleep",
    });
  });

  it("maps explicit offline device state to offline immediately", () => {
    expect(deriveTelemetryState({
      lastSeenAt: new Date("2026-06-08T10:00:00.000Z"),
      lastDeviceState: "offline",
      status: "safe",
      statusLabel: "Live",
    }, new Date("2026-06-08T10:00:05.000Z"))).toEqual({
      status: "offline",
      statusLabel: "Offline",
      telemetryState: "offline",
    });
  });

  it("maps missing active telemetry to connecting", () => {
    expect(deriveTelemetryState({
      lastSeenAt: null,
      lastDeviceState: "active",
      status: "safe",
      statusLabel: "Live",
    })).toEqual({
      status: "offline",
      statusLabel: "Connecting",
      telemetryState: "connecting",
    });
  });
});
