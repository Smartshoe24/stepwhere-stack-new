import { describe, expect, it, vi } from "vitest";

import {
  buildFilteredTrailSegments,
  buildTrailGeometry,
  buildTrailResponseFromCachedSegments,
} from "./trail-path-builder";

function row(input: {
  id: string;
  latitude: number;
  longitude: number;
  occurredAt: string;
  accuracyMeters?: number | null;
  stepCounter?: number;
}) {
  return {
    id: input.id,
    latitude: input.latitude,
    longitude: input.longitude,
    occurredAt: new Date(input.occurredAt),
    accuracyMeters: input.accuracyMeters ?? 5,
    stepCounter: input.stepCounter ?? 0,
  };
}

describe("trail path builder", () => {
  it("splits filtered geometry across large time gaps", () => {
    const segments = buildFilteredTrailSegments([
      row({ id: "a", latitude: 12, longitude: 77, occurredAt: "2026-06-11T10:00:00.000Z" }),
      row({ id: "b", latitude: 12.00025, longitude: 77, occurredAt: "2026-06-11T10:00:10.000Z", stepCounter: 5 }),
      row({ id: "c", latitude: 12.0005, longitude: 77, occurredAt: "2026-06-11T10:01:00.000Z", stepCounter: 10 }),
      row({ id: "d", latitude: 12.00075, longitude: 77, occurredAt: "2026-06-11T10:01:10.000Z", stepCounter: 15 }),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.points).toHaveLength(2);
    expect(segments[1]?.points).toHaveLength(2);
  });

  it("removes an isolated A-B-A bounce spike before segment building", () => {
    const segments = buildFilteredTrailSegments([
      row({ id: "a", latitude: 12, longitude: 77, occurredAt: "2026-06-11T10:00:00.000Z" }),
      row({ id: "b", latitude: 12.00055, longitude: 77, occurredAt: "2026-06-11T10:00:20.000Z", stepCounter: 5 }),
      row({ id: "c", latitude: 12.00002, longitude: 77, occurredAt: "2026-06-11T10:00:40.000Z", stepCounter: 10 }),
      row({ id: "d", latitude: 12.00025, longitude: 77, occurredAt: "2026-06-11T10:01:00.000Z", stepCounter: 15 }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.points.some((point) => point.id === "b")).toBe(false);
    expect(segments[0]?.points.every((point) => point.latitude < 12.0004)).toBe(true);
  });

  it("uses roads geometry when snapped points satisfy validation", async () => {
    const roadSnapper = vi.fn(async (points: Array<{ latitude: number; longitude: number }>) => (
      points.map((point, index) => ({
        ...point,
        originalIndex: index,
      }))
    ));

    const result = await buildTrailGeometry([
      row({ id: "a", latitude: 12, longitude: 77, occurredAt: "2026-06-11T10:00:00.000Z", stepCounter: 0 }),
      row({ id: "b", latitude: 12, longitude: 77.0002, occurredAt: "2026-06-11T10:00:10.000Z", stepCounter: 10 }),
      row({ id: "c", latitude: 12.0002, longitude: 77.0002, occurredAt: "2026-06-11T10:00:20.000Z", stepCounter: 20 }),
    ], {
      geometryMode: "roads",
      roadsEnabled: true,
      roadSnapper,
      geofence: null,
    });

    expect(roadSnapper).toHaveBeenCalledTimes(1);
    expect(result.geometrySource).toBe("roads");
    expect(result.segments[0]?.source).toBe("roads");
  });

  it("skips road snapping for runs mostly inside the active geofence", async () => {
    const roadSnapper = vi.fn(async () => []);

    const result = await buildTrailGeometry([
      row({ id: "a", latitude: 12, longitude: 77, occurredAt: "2026-06-11T10:00:00.000Z" }),
      row({ id: "b", latitude: 12.00008, longitude: 77.00001, occurredAt: "2026-06-11T10:00:10.000Z", stepCounter: 5 }),
      row({ id: "c", latitude: 12.00014, longitude: 77.00002, occurredAt: "2026-06-11T10:00:20.000Z", stepCounter: 10 }),
    ], {
      geometryMode: "roads",
      roadsEnabled: true,
      roadSnapper,
      geofence: {
        centerLatitude: 12,
        centerLongitude: 77,
        radiusMeters: 100,
        status: "enabled",
      },
    });

    expect(roadSnapper).not.toHaveBeenCalled();
    expect(result.geometrySource).toBe("filtered");
    expect(result.segments[0]?.source).toBe("filtered");
  });

  it("trims cached segments to the requested distance and keeps points oldest to newest", () => {
    const cachedSegments = [{
      source: "filtered" as const,
      points: [
        { latitude: 12, longitude: 77, occurredAt: "2026-06-11T10:00:00.000Z" },
        { latitude: 12.00045, longitude: 77.00005, occurredAt: "2026-06-11T10:01:00.000Z" },
        { latitude: 12.0009, longitude: 77.0001, occurredAt: "2026-06-11T10:02:00.000Z" },
      ],
    }];

    const response = buildTrailResponseFromCachedSegments({
      childId: "child-1",
      distanceMeters: 100,
      generatedAt: "2026-06-11T10:02:00.000Z",
      geometrySource: "filtered",
      segments: cachedSegments,
    });

    expect(response.segments).toHaveLength(1);
    expect(response.points[0]?.distanceFromLatestMeters).toBeCloseTo(100, 3);
    expect(response.points[response.points.length - 1]?.distanceFromLatestMeters).toBe(0);
    expect(
      new Date(response.points[0]!.occurredAt).getTime()
      <= new Date(response.points[response.points.length - 1]!.occurredAt).getTime(),
    ).toBe(true);
  });
});
