import { describe, expect, it } from "vitest";

import { buildDistanceBoundTrail } from "./telemetry-trail";

describe("telemetry trail", () => {
  it("returns points oldest to newest within the requested distance", () => {
    const points = buildDistanceBoundTrail([
      {
        latitude: 12.0009,
        longitude: 77,
        occurredAt: new Date("2026-06-11T10:02:00.000Z"),
      },
      {
        latitude: 12.00045,
        longitude: 77,
        occurredAt: new Date("2026-06-11T10:01:00.000Z"),
      },
      {
        latitude: 12,
        longitude: 77,
        occurredAt: new Date("2026-06-11T10:00:00.000Z"),
      },
    ], 100);

    expect(points[0]?.distanceFromLatestMeters).toBeCloseTo(100, 3);
    expect(points[points.length - 1]?.distanceFromLatestMeters).toBe(0);
    expect(points[0]?.occurredAt <= points[points.length - 1]?.occurredAt).toBe(true);
  });

  it("returns an empty trail when distance is not positive", () => {
    expect(buildDistanceBoundTrail([], 2000)).toEqual([]);
    expect(buildDistanceBoundTrail([
      {
        latitude: 12,
        longitude: 77,
        occurredAt: new Date("2026-06-11T10:00:00.000Z"),
      },
    ], 0)).toEqual([]);
  });
});
