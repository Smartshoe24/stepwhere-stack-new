import { describe, expect, it } from "vitest";

import { applyLiveStepsTodayForTest } from "./activity.service";

describe("applyLiveStepsToday", () => {
  const base = {
    steps: 1_000,
    activeMinutes: 30,
    rhythm: [],
    series: [
      { date: "2026-01-01", label: "1 Jan", steps: 400, activeMinutes: 10, calories: 12 },
      { date: "2026-01-02", label: "2 Jan", steps: 600, activeMinutes: 20, calories: 18 },
    ],
  };

  it("lifts today's steps when the live total is ahead of the aggregate", () => {
    const next = applyLiveStepsTodayForTest({
      aggregated: base,
      liveStepsToday: 900,
      todayDateKey: "2026-01-02",
    });

    expect(next.series[1]!.steps).toBe(900);
    expect(next.steps).toBe(1_300);
    expect(next.series[0]!.steps).toBe(400);
  });

  it("recomputes calories for the lifted day", () => {
    const next = applyLiveStepsTodayForTest({
      aggregated: base,
      liveStepsToday: 1_000,
      todayDateKey: "2026-01-02",
    });

    expect(next.series[1]!.calories).toBe(30);
  });

  it("never lowers the aggregate, which stays authoritative", () => {
    const next = applyLiveStepsTodayForTest({
      aggregated: base,
      liveStepsToday: 100,
      todayDateKey: "2026-01-02",
    });

    expect(next).toBe(base);
  });

  it("is a no-op when there is no live total", () => {
    expect(applyLiveStepsTodayForTest({
      aggregated: base,
      liveStepsToday: null,
      todayDateKey: "2026-01-02",
    })).toBe(base);
  });

  it("is a no-op when today is not inside the range", () => {
    expect(applyLiveStepsTodayForTest({
      aggregated: base,
      liveStepsToday: 5_000,
      todayDateKey: "2026-02-09",
    })).toBe(base);
  });
});
