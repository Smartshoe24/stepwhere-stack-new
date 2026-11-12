import { describe, expect, it } from "vitest";

import {
  buildDevelopmentHistoryDay,
  buildDevelopmentHistoryRange,
} from "./history-fixtures";
import { TELEMETRY_GAP_SECONDS } from "./history.constants";
import {
  buildUtcDayRange,
  resolveHistoryEventReadState,
} from "./history.service";

describe("History development fixtures", () => {
  it("identifies range and day responses as fixture data", () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    const range = buildDevelopmentHistoryRange({
      childId: "00000000-0000-4000-8000-000000000001",
      timezone: "Asia/Kolkata",
      now,
    });
    const day = buildDevelopmentHistoryDay({
      childId: "00000000-0000-4000-8000-000000000001",
      date: range.today,
      timezone: "Asia/Kolkata",
      now,
    });

    expect(range.dataSource).toBe("fixture");
    expect(day.dataSource).toBe("fixture");
  });
});

describe("History local-day UTC ranges", () => {
  it("builds a 23-hour day across the spring DST transition", () => {
    const range = buildUtcDayRange("2026-03-08", "America/New_York");

    expect(range.endUtcExclusive.getTime() - range.startUtc.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("builds a 25-hour day across the fall DST transition", () => {
    const range = buildUtcDayRange("2026-11-01", "America/New_York");

    expect(range.endUtcExclusive.getTime() - range.startUtc.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("starts an India local day at the correct UTC instant", () => {
    const range = buildUtcDayRange("2026-07-25", "Asia/Kolkata");

    expect(range.startUtc.toISOString()).toBe("2026-07-24T18:30:00.000Z");
  });
});

describe("History event day overlap", () => {
  const startedAt = new Date("2026-08-03T23:52:27.077Z");
  const lastTelemetryAt = new Date("2026-08-04T00:00:19.123Z");
  const now = new Date("2026-08-12T12:00:00.000Z");

  function resolve(input: Partial<Parameters<typeof resolveHistoryEventReadState>[0]> = {}) {
    return resolveHistoryEventReadState({
      endedAt: null,
      lastTelemetryAt,
      now,
      startedAt,
      status: "ongoing",
      ...buildUtcDayRange("2026-08-04", "Asia/Kolkata"),
      ...input,
    });
  }

  it("finalizes a stale ongoing trip at its last telemetry on its actual day", () => {
    expect(resolve()).toEqual({
      status: "finalized",
      endedAt: lastTelemetryAt,
    });
  });

  it("changes only the read-time status and end of a stale trip", () => {
    const trip = {
      id: "bc2d04b4-ce19-428d-9632-0c4f78f4e2e7",
      status: "ongoing" as const,
      endedAt: null,
      distanceMeters: 2_324,
      tripMode: "walking",
      filteredPath: [
        { latitude: 12.9716, longitude: 77.5946 },
        { latitude: 12.9726, longitude: 77.6046 },
      ],
    };
    const readState = resolve();

    expect({ ...trip, ...readState }).toEqual({
      ...trip,
      status: "finalized",
      endedAt: lastTelemetryAt,
    });
  });

  it("excludes a stale ongoing trip from every later day", () => {
    expect(resolve({
      ...buildUtcDayRange("2026-08-12", "Asia/Kolkata"),
    })).toBeNull();
  });

  it("keeps a fresh ongoing event open", () => {
    const freshTelemetryAt = new Date(now.getTime() - 5 * 60_000);

    expect(resolve({
      lastTelemetryAt: freshTelemetryAt,
      startedAt: new Date(freshTelemetryAt.getTime() - 60_000),
      ...buildUtcDayRange("2026-08-12", "Asia/Kolkata"),
    })).toEqual({ status: "ongoing", endedAt: null });
  });

  it("preserves the explicit end of an already-finalized event", () => {
    expect(resolve({
      endedAt: lastTelemetryAt,
      status: "finalized",
    })).toEqual({ status: "finalized", endedAt: lastTelemetryAt });
  });

  it("uses the start as a defensive end when the last telemetry reference is missing", () => {
    expect(resolve({
      lastTelemetryAt: null,
      ...buildUtcDayRange("2026-08-12", "Asia/Kolkata"),
    })).toBeNull();
    expect(resolve({ lastTelemetryAt: null })).toEqual({
      status: "finalized",
      endedAt: startedAt,
    });
  });

  it("finalizes only after the existing ten-minute telemetry-gap boundary", () => {
    const boundary = new Date(now.getTime() - TELEMETRY_GAP_SECONDS * 1_000);

    expect(resolve({
      lastTelemetryAt: boundary,
      startedAt: new Date(boundary.getTime() - 60_000),
      ...buildUtcDayRange("2026-08-12", "Asia/Kolkata"),
    })).toEqual({ status: "ongoing", endedAt: null });
    expect(resolve({
      lastTelemetryAt: new Date(boundary.getTime() - 1),
      startedAt: new Date(boundary.getTime() - 60_000),
      ...buildUtcDayRange("2026-08-12", "Asia/Kolkata"),
    })).toEqual({
      status: "finalized",
      endedAt: new Date(boundary.getTime() - 1),
    });
  });
});
