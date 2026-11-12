import { describe, expect, it } from "vitest";

import { detectHistoryEvents } from "./history-detector";
import { inferTripMode } from "./history-mode";
import {
  calculateDistanceMeters,
  distanceMeters,
  filterAcceptedSamples,
  weightedMedoid,
  type HistorySample,
  type AcceptedHistorySample,
} from "./history-path";

function sample(input: Partial<HistorySample> & {
  id: string;
  minute: number;
  latitude?: number;
  longitude?: number;
  stepCounter?: number;
}): HistorySample {
  return {
    deviceId: "device-1",
    latitude: input.latitude ?? 28.6139,
    longitude: input.longitude ?? 77.209,
    accuracyMeters: input.accuracyMeters ?? 10,
    stepCounter: input.stepCounter ?? input.minute * 80,
    deviceState: input.deviceState ?? "active",
    occurredAt: new Date(Date.UTC(2026, 6, 19, 8, input.minute, 0)),
    ...input,
  };
}

describe("detectHistoryEvents", () => {
  it("confirms the initial stay at five minutes and not earlier", () => {
    const before = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 4 }),
    ]);
    const after = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 5 }),
    ]);

    expect(before.some((event) => event.kind === "stay")).toBe(false);
    expect(after[0]?.kind).toBe("stay");
    expect(after[0]?.status).toBe("ongoing");
  });

  it("uses the normal ten-minute rule for later stops", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2, latitude: 28.6148 }),
      sample({ id: "c", minute: 4, latitude: 28.6158 }),
      sample({ id: "d", minute: 6, latitude: 28.6168 }),
      sample({ id: "e", minute: 10, latitude: 28.6168 }),
      sample({ id: "f", minute: 15, latitude: 28.6168 }),
      sample({ id: "g", minute: 16, latitude: 28.6168 }),
    ]);

    expect(events.some((event) => event.kind === "stay")).toBe(true);
    expect(events.find((event) => event.kind === "stay")?.startedAt.toISOString()).toBe(sample({ id: "d", minute: 6 }).occurredAt.toISOString());
  });

  it("creates a gap only when usable samples are more than ten minutes apart", () => {
    const continuous = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 10, latitude: 28.615 }),
    ]);
    const gapped = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 11, latitude: 28.615 }),
    ]);

    expect(continuous.some((event) => event.kind === "gap")).toBe(false);
    expect(gapped.some((event) => event.kind === "gap")).toBe(true);
  });

  it("requires five outside active samples to close a stay", () => {
    const fourOutside = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 3 }),
      sample({ id: "c", minute: 5 }),
      sample({ id: "d", minute: 6, latitude: 28.615 }),
      sample({ id: "e", minute: 7, latitude: 28.6152 }),
      sample({ id: "f", minute: 8, latitude: 28.6154 }),
      sample({ id: "g", minute: 9, latitude: 28.6156 }),
    ]);
    const fiveOutside = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 3 }),
      sample({ id: "c", minute: 5 }),
      sample({ id: "d", minute: 6, latitude: 28.615 }),
      sample({ id: "e", minute: 7, latitude: 28.6152 }),
      sample({ id: "f", minute: 8, latitude: 28.6154 }),
      sample({ id: "g", minute: 9, latitude: 28.6156 }),
      sample({ id: "h", minute: 10, latitude: 28.6158 }),
    ]);

    expect(fourOutside[0]?.status).toBe("ongoing");
    expect(fiveOutside[0]?.status).toBe("finalized");
    expect(fiveOutside[0]?.endedAt?.toISOString()).toBe(sample({ id: "d", minute: 6 }).occurredAt.toISOString());
  });

  it("discards an initial candidate that is left before five minutes", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 4, latitude: 28.615 }),
      sample({ id: "d", minute: 8, latitude: 28.615 }),
    ]);

    expect(events.some(event => event.kind === "stay")).toBe(false);
  });

  it("requires at least three accepted samples for a stay", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 8 }),
    ]);

    expect(events.some(event => event.kind === "stay")).toBe(false);
  });

  it("clamps adaptive stay radii at 35 and 50 meters", () => {
    const lowAccuracy = detectHistoryEvents([
      sample({ id: "a", minute: 0, accuracyMeters: 5 }),
      sample({ id: "b", minute: 2, accuracyMeters: 5 }),
      sample({ id: "c", minute: 5, accuracyMeters: 5 }),
    ]);
    const highAccuracy = detectHistoryEvents([
      sample({ id: "d", minute: 0, accuracyMeters: 50 }),
      sample({ id: "e", minute: 2, accuracyMeters: 50 }),
      sample({ id: "f", minute: 5, accuracyMeters: 50 }),
    ]);

    expect(lowAccuracy.find(event => event.kind === "stay")?.stayRadiusMeters).toBe(35);
    expect(highAccuracy.find(event => event.kind === "stay")?.stayRadiusMeters).toBe(50);
  });

  it("resets exit confirmation after returning inside", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 5 }),
      sample({ id: "d", minute: 6, latitude: 28.615 }),
      sample({ id: "e", minute: 7, latitude: 28.615 }),
      sample({ id: "f", minute: 8 }),
      sample({ id: "g", minute: 9, latitude: 28.615 }),
      sample({ id: "h", minute: 10, latitude: 28.615 }),
      sample({ id: "i", minute: 11, latitude: 28.615 }),
      sample({ id: "j", minute: 12, latitude: 28.615 }),
    ]);

    expect(events.find(event => event.kind === "stay")?.status).toBe("ongoing");
  });

  it("continues a sleeping stay when waking inside", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 5 }),
      sample({ id: "d", minute: 20, deviceState: "sleep" }),
      sample({ id: "e", minute: 40 }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("stay");
    expect(events[0]?.status).toBe("ongoing");
  });

  it("creates a moved-while-sleeping gap after five outside wake samples", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2 }),
      sample({ id: "c", minute: 5 }),
      sample({ id: "d", minute: 20, deviceState: "sleep" }),
      sample({ id: "e", minute: 21, latitude: 28.615 }),
      sample({ id: "f", minute: 22, latitude: 28.6151 }),
      sample({ id: "g", minute: 23, latitude: 28.6152 }),
      sample({ id: "h", minute: 24, latitude: 28.6153 }),
      sample({ id: "i", minute: 25, latitude: 28.6154 }),
    ]);

    const stay = events.find(event => event.kind === "stay");
    const gap = events.find(event => event.kind === "gap");

    expect(stay?.status).toBe("finalized");
    expect(stay?.endedAt?.toISOString()).toBe(sample({ id: "d", minute: 20 }).occurredAt.toISOString());
    expect(gap?.gapReason).toBe("moved_while_sleeping");
  });

  it("does not invent a stay when sleeping while moving", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2, latitude: 28.615 }),
      sample({ id: "c", minute: 4, latitude: 28.616, deviceState: "sleep" }),
      sample({ id: "d", minute: 20, latitude: 28.617 }),
    ]);

    expect(events.some(event => event.kind === "stay")).toBe(false);
    expect(events.some(event => event.kind === "gap" && event.gapReason === "moved_while_sleeping")).toBe(true);
  });

  it("creates one explicit offline gap and begins a new session", () => {
    const events = detectHistoryEvents([
      sample({ id: "a", minute: 0 }),
      sample({ id: "b", minute: 2, latitude: 28.615 }),
      sample({ id: "c", minute: 3, latitude: 28.615, deviceState: "offline" }),
      sample({ id: "d", minute: 20, latitude: 28.616 }),
    ]);
    const gaps = events.filter(event => event.kind === "gap");

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapReason).toBe("offline");
  });
});

describe("history geometry helpers", () => {
  it("weighted medoid favors the accurate consistent coordinate", () => {
    const samples: AcceptedHistorySample[] = [
      sample({ id: "a", minute: 0, latitude: 28.6139, longitude: 77.209, accuracyMeters: 5 }) as AcceptedHistorySample,
      sample({ id: "b", minute: 1, latitude: 28.61391, longitude: 77.209, accuracyMeters: 5 }) as AcceptedHistorySample,
      sample({ id: "c", minute: 2, latitude: 28.6148, longitude: 77.21, accuracyMeters: 45 }) as AcceptedHistorySample,
    ];

    const medoid = weightedMedoid(samples);

    expect(medoid?.id).toBe("b");
    expect(distanceMeters(samples[0]!, samples[1]!)).toBeLessThan(2);
  });

  it("infers walking and vehicle trips", () => {
    const walking = inferTripMode([
      sample({ id: "a", minute: 0, latitude: 28.6139, stepCounter: 0 }) as AcceptedHistorySample,
      sample({ id: "b", minute: 2, latitude: 28.6149, stepCounter: 180 }) as AcceptedHistorySample,
    ]);
    const vehicle = inferTripMode([
      sample({ id: "a", minute: 0, latitude: 28.6139, stepCounter: 0 }) as AcceptedHistorySample,
      sample({ id: "b", minute: 2, latitude: 28.6239, stepCounter: 0 }) as AcceptedHistorySample,
    ]);

    expect(walking.mode).toBe("walking");
    expect(vehicle.mode).toBe("vehicle");
  });

  it("uses unknown mode below the duration and distance thresholds", () => {
    const result = inferTripMode([
      sample({ id: "a", minute: 0, stepCounter: 0 }) as AcceptedHistorySample,
      {
        ...sample({ id: "b", minute: 0, latitude: 28.6141, stepCounter: 20 }),
        occurredAt: new Date(Date.UTC(2026, 6, 19, 8, 0, 30)),
      } as AcceptedHistorySample,
    ]);

    expect(result.mode).toBe("unknown");
    expect(result.confidence).toBe("low");
  });

  it("ignores unusable accuracy and isolated bounce spikes", () => {
    const accepted = filterAcceptedSamples([
      sample({ id: "a", minute: 0 }),
      {
        ...sample({ id: "b", minute: 0, latitude: 29.6139 }),
        occurredAt: new Date(Date.UTC(2026, 6, 19, 8, 0, 10)),
      },
      {
        ...sample({ id: "c", minute: 0 }),
        occurredAt: new Date(Date.UTC(2026, 6, 19, 8, 0, 20)),
      },
      sample({ id: "d", minute: 1, accuracyMeters: 80 }),
    ]);

    expect(accepted.map(item => item.id)).toEqual(["a", "c"]);
  });

  it("calculates distance from the device-derived filtered geometry", () => {
    const points = [
      { latitude: 28.6139, longitude: 77.209 },
      { latitude: 28.6149, longitude: 77.209 },
    ];

    expect(calculateDistanceMeters(points)).toBeGreaterThan(100);
    expect(calculateDistanceMeters(points)).toBeLessThan(120);
  });
});
