import { describe, expect, it } from "vitest";

import { toPublicShareChildDto } from "./shares.mapper";

describe("toPublicShareChildDto", () => {
  it("reduces the child name to the first name and preserves only public fields", () => {
    const child = toPublicShareChildDto({
      id: "child-1",
      name: "Aarav Anand",
      initials: "AA",
      avatarUrl: "https://example.com/avatar.jpg",
      latitude: 18.5204,
      longitude: 73.8567,
      resolvedPosition: {
        latitude: 18.5204,
        longitude: 73.8567,
        source: "gps",
        accuracyMeters: 5,
        observedAt: "2026-06-09T18:00:00.000Z",
      },
      locationLabel: null,
      telemetryState: "sleep",
      connectivity: {
        gsmState: "connected",
        gpsState: "connected",
        lastGpsFixAt: "2026-06-09T18:00:00.000Z",
      },
      statusLabel: "Sleep",
      lastUpdatedAt: "2026-06-09T18:00:00.000Z",
    });

    expect(child).toEqual({
      childName: "Aarav",
      initials: "AA",
      avatarUrl: "https://example.com/avatar.jpg",
      latitude: 18.5204,
      longitude: 73.8567,
      resolvedPosition: {
        latitude: 18.5204,
        longitude: 73.8567,
        source: "gps",
        accuracyMeters: 5,
        observedAt: "2026-06-09T18:00:00.000Z",
      },
      telemetryState: "sleep",
      gpsState: "connected",
      statusLabel: "Sleep",
      lastUpdatedAt: "2026-06-09T18:00:00.000Z",
    });
  });
});
