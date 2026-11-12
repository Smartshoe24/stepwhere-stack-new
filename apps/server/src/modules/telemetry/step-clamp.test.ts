import { describe, expect, it } from "vitest";

import {
  clampStepDelta,
  isStepCounterReset,
  MAX_PLAUSIBLE_STEPS_PER_SECOND,
  MAX_UNMEASURED_STEP_CREDIT,
} from "./telemetry.helpers";

describe("isStepCounterReset", () => {
  it("treats a rollback as a reset", () => {
    expect(isStepCounterReset(41_203, 9)).toBe(true);
  });

  it("does not treat a first sample or an increase as a reset", () => {
    expect(isStepCounterReset(null, 9)).toBe(false);
    expect(isStepCounterReset(undefined, 9)).toBe(false);
    expect(isStepCounterReset(100, 100)).toBe(false);
    expect(isStepCounterReset(100, 140)).toBe(false);
  });
});

describe("clampStepDelta", () => {
  it("passes through a plausible delta unchanged", () => {
    // 120 steps in 60s is a brisk 2 steps/second.
    expect(clampStepDelta({
      rawDelta: 120,
      elapsedSeconds: 60,
      isCounterReset: false,
    })).toBe(120);
  });

  it("caps a delta that exceeds the physical step rate", () => {
    expect(clampStepDelta({
      rawDelta: 50_000,
      elapsedSeconds: 60,
      isCounterReset: false,
    })).toBe(60 * MAX_PLAUSIBLE_STEPS_PER_SECOND);
  });

  it("caps a counter reset to the unmeasured credit ceiling", () => {
    // The raw derivation would credit the whole new counter here.
    expect(clampStepDelta({
      rawDelta: 39_000,
      elapsedSeconds: 60,
      isCounterReset: true,
    })).toBe(MAX_UNMEASURED_STEP_CREDIT);
  });

  it("keeps a small post-reset counter intact", () => {
    expect(clampStepDelta({
      rawDelta: 9,
      elapsedSeconds: 60,
      isCounterReset: true,
    })).toBe(9);
  });

  it("caps the first-ever sample, which has no elapsed window", () => {
    expect(clampStepDelta({
      rawDelta: 80_000,
      elapsedSeconds: null,
      isCounterReset: false,
    })).toBe(MAX_UNMEASURED_STEP_CREDIT);
  });

  it("returns zero for non-positive or unusable input", () => {
    expect(clampStepDelta({ rawDelta: 0, elapsedSeconds: 60, isCounterReset: false })).toBe(0);
    expect(clampStepDelta({ rawDelta: -5, elapsedSeconds: 60, isCounterReset: false })).toBe(0);
    expect(clampStepDelta({
      rawDelta: Number.NaN,
      elapsedSeconds: 60,
      isCounterReset: false,
    })).toBe(0);
  });

  it("never lets a long offline gap justify an unbounded delta", () => {
    // A 3-day gap scales the ceiling, but the raw delta is still what bounds it.
    const threeDays = 3 * 24 * 60 * 60;

    expect(clampStepDelta({
      rawDelta: 12_000,
      elapsedSeconds: threeDays,
      isCounterReset: false,
    })).toBe(12_000);
  });

  it("floors fractional deltas to whole steps", () => {
    expect(clampStepDelta({
      rawDelta: 10.9,
      elapsedSeconds: 60,
      isCounterReset: false,
    })).toBe(10);
  });
});
