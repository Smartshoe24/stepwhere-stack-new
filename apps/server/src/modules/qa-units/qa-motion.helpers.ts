/**
 * Motion IC status from QA board tests, and the final-test step check (pure).
 *
 * Without motion the QA firmware proves the LIS2DH12 in two tests:
 *   imu   – answers on I2C with WHO_AM_I 0x33 and reads about 1 g at rest;
 *   steps – the chip's built-in self-test moves its sensing element on all
 *           three axes; the change must be 68-1440 mg (datasheet limits).
 * Steps themselves are proved in the Final test, with the board in its shoe.
 */
import type { QaFinalTestStepsDto, QaMotionIcDto, QaTestResultDto } from "@stepwhere/types";

/** Steps the counter must rise by in the Final test (operator moves the shoe for ~30 s). */
export const QA_FINAL_TEST_STEP_TARGET = 10;

type RunLike = { results: QaTestResultDto[]; startedAt: Date | string };

const decided = (result: QaTestResultDto | undefined) =>
  result && (result.status === "passed" || result.status === "failed") ? result : undefined;

function selfTestDetail(steps: QaTestResultDto) {
  const data = steps.data ?? {};
  const axes = [data.dxMg, data.dyMg, data.dzMg];
  if (data.mode === "self-test" && axes.every((value) => typeof value === "number")) {
    return `self-test ${axes.map((value) => Math.round(value as number)).join(" / ")} mg`;
  }
  if (typeof data.steps === "number") return `${data.steps} steps (swing test)`;
  return null;
}

/** Newest decided imu and steps results across runs (runs newest first). */
export function motionIcFromRuns(runs: readonly RunLike[]): QaMotionIcDto {
  let imu: QaTestResultDto | undefined;
  let steps: QaTestResultDto | undefined;
  let testedAt: Date | string | null = null;
  for (const run of runs) {
    const runImu = decided(run.results.find((result) => result.id === "imu"));
    const runSteps = decided(run.results.find((result) => result.id === "steps"));
    if (!imu && runImu) {
      imu = runImu;
      testedAt ??= run.startedAt;
    }
    if (!steps && runSteps) {
      steps = runSteps;
      testedAt ??= run.startedAt;
    }
    if (imu && steps) break;
  }

  const chip = (imu?.data?.chip ?? steps?.data?.chip ?? null) as string | null;
  const at = testedAt ? new Date(testedAt).toISOString() : null;
  if (!imu && !steps) return { status: "untested", chip: null, detail: null, testedAt: null };

  const failed = [imu, steps].find((result) => result?.status === "failed");
  if (failed) return { status: "failed", chip, detail: failed.error ?? `${failed.id} failed`, testedAt: at };
  if (!imu || !steps) {
    return { status: "untested", chip, detail: imu ? "Self-test not run yet" : "I2C check not run yet", testedAt: at };
  }
  return { status: "passed", chip, detail: selfTestDetail(steps), testedAt: at };
}

/** Step counter rise over the Final test uploads (oldest first). Null without uploads. */
export function finalTestSteps(counters: readonly number[]): QaFinalTestStepsDto | null {
  if (counters.length === 0) return null;
  const first = counters[0];
  // The counter only grows; a lower value means the board restarted from 0.
  let increase = 0;
  for (let i = 1; i < counters.length; i++) {
    const step = counters[i] - counters[i - 1];
    increase += step >= 0 ? step : counters[i];
  }
  return {
    first,
    latest: counters[counters.length - 1],
    increase,
    target: QA_FINAL_TEST_STEP_TARGET,
    passed: increase >= QA_FINAL_TEST_STEP_TARGET,
    reports: counters.length,
  };
}
