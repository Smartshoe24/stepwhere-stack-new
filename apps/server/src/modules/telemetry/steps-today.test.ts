import { describe, expect, it } from "vitest";

import {
  accumulateStepsToday,
  getLocalDateKey,
  readCurrentStepsToday,
} from "./steps-today";

describe("getLocalDateKey", () => {
  it("uses the child's timezone, not the server's", () => {
    // 20:00 UTC is already the next calendar day in Kolkata (+05:30).
    const instant = new Date("2026-01-01T20:00:00.000Z");

    expect(getLocalDateKey(instant, "Asia/Kolkata")).toBe("2026-01-02");
    expect(getLocalDateKey(instant, "America/Los_Angeles")).toBe("2026-01-01");
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    const instant = new Date("2026-01-01T20:00:00.000Z");

    expect(getLocalDateKey(instant, "Not/AZone")).toBe("2026-01-01");
  });
});

describe("accumulateStepsToday", () => {
  const timezone = "Asia/Kolkata";

  it("starts a fresh total when there is no previous state", () => {
    expect(accumulateStepsToday({
      previous: null,
      stepDelta: 120,
      sampleAt: new Date("2026-01-02T04:00:00.000Z"),
      timezone,
    })).toEqual({
      stepsToday: 120,
      stepsTodayDate: "2026-01-02",
      stepsTodayTimezone: timezone,
    });
  });

  it("adds to the running total within the same local day", () => {
    expect(accumulateStepsToday({
      previous: {
        stepsToday: 500,
        stepsTodayDate: "2026-01-02",
        stepsTodayTimezone: timezone,
      },
      stepDelta: 120,
      sampleAt: new Date("2026-01-02T06:00:00.000Z"),
      timezone,
    }).stepsToday).toBe(620);
  });

  it("resets at the child's local midnight, not UTC midnight", () => {
    // 18:35 UTC is 00:05 on the 3rd in Kolkata, so the day has rolled over even
    // though the UTC date has not.
    expect(accumulateStepsToday({
      previous: {
        stepsToday: 8_000,
        stepsTodayDate: "2026-01-02",
        stepsTodayTimezone: timezone,
      },
      stepDelta: 12,
      sampleAt: new Date("2026-01-02T18:35:00.000Z"),
      timezone,
    })).toEqual({
      stepsToday: 12,
      stepsTodayDate: "2026-01-03",
      stepsTodayTimezone: timezone,
    });
  });

  it("resets when the child changes timezone", () => {
    // Same local date string, different zone: the day boundaries differ, so
    // carrying the total forward would be meaningless.
    expect(accumulateStepsToday({
      previous: {
        stepsToday: 4_000,
        stepsTodayDate: "2026-01-02",
        stepsTodayTimezone: "Asia/Kolkata",
      },
      stepDelta: 30,
      sampleAt: new Date("2026-01-02T12:00:00.000Z"),
      timezone: "Europe/London",
    })).toEqual({
      stepsToday: 30,
      stepsTodayDate: "2026-01-02",
      stepsTodayTimezone: "Europe/London",
    });
  });

  it("ignores negative and fractional deltas", () => {
    expect(accumulateStepsToday({
      previous: { stepsToday: 100, stepsTodayDate: "2026-01-02", stepsTodayTimezone: timezone },
      stepDelta: -50,
      sampleAt: new Date("2026-01-02T06:00:00.000Z"),
      timezone,
    }).stepsToday).toBe(100);

    expect(accumulateStepsToday({
      previous: { stepsToday: 100, stepsTodayDate: "2026-01-02", stepsTodayTimezone: timezone },
      stepDelta: 10.8,
      sampleAt: new Date("2026-01-02T06:00:00.000Z"),
      timezone,
    }).stepsToday).toBe(110);
  });
});

describe("readCurrentStepsToday", () => {
  const timezone = "Asia/Kolkata";
  const base = {
    stepsToday: 4_200,
    stepsTodayDate: "2026-01-02",
    stepsTodayTimezone: timezone,
  };

  it("returns the total while it is still that local day in the device's zone", () => {
    expect(readCurrentStepsToday({
      ...base,
      now: new Date("2026-01-02T06:00:00.000Z"),
    })).toBe(4_200);
  });

  it("discards a total from a past local day", () => {
    // 18:35 UTC is already the 3rd in Kolkata.
    expect(readCurrentStepsToday({
      ...base,
      now: new Date("2026-01-02T18:35:00.000Z"),
    })).toBeNull();
  });

  it("is evaluated in the device's zone, not the caller's", () => {
    // 20:00 UTC on the 1st is the 2nd in Kolkata, so a Kolkata-accumulated total
    // dated the 2nd is current even though it is still the 1st in UTC or the US.
    expect(readCurrentStepsToday({
      ...base,
      now: new Date("2026-01-01T20:00:00.000Z"),
    })).toBe(4_200);
  });

  it("treats a never-populated snapshot as zero rather than null", () => {
    expect(readCurrentStepsToday({
      stepsToday: null,
      stepsTodayDate: "2026-01-02",
      stepsTodayTimezone: timezone,
      now: new Date("2026-01-02T06:00:00.000Z"),
    })).toBe(0);
  });

  it("returns null when the snapshot has never recorded a day or zone", () => {
    expect(readCurrentStepsToday({
      stepsToday: 10,
      stepsTodayDate: null,
      stepsTodayTimezone: timezone,
    })).toBeNull();
    expect(readCurrentStepsToday({
      stepsToday: 10,
      stepsTodayDate: "2026-01-02",
      stepsTodayTimezone: null,
    })).toBeNull();
  });
});
