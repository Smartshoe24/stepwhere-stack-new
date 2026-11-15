import { describe, expect, it } from "vitest";
import type { QaTestResultDto } from "@stepwhere/types";

import { finalTestSteps, motionIcFromRuns, QA_FINAL_TEST_STEP_TARGET } from "./qa-motion.helpers";

const result = (id: QaTestResultDto["id"], status: QaTestResultDto["status"], data: Record<string, unknown> | null = null, error: string | null = null): QaTestResultDto => ({
  id, status, ms: 10, data, error, progress: null, prompt: null, awaiting: null, startedAt: null, finishedAt: null,
});
const run = (startedAt: string, ...results: QaTestResultDto[]) => ({ startedAt, results });

describe("motion IC from QA board tests", () => {
  it("is untested without board tests", () => {
    expect(motionIcFromRuns([])).toEqual({ status: "untested", chip: null, detail: null, testedAt: null });
  });

  it("passes on the I2C check plus the self-test, with the self-test readings", () => {
    const status = motionIcFromRuns([run("2026-11-15T10:00:00.000Z",
      result("imu", "passed", { chip: "LIS2DH12", whoAmI: "0x33" }),
      result("steps", "passed", { chip: "LIS2DH12", mode: "self-test", dxMg: 412, dyMg: 398.4, dzMg: 655 }),
    )]);
    expect(status).toEqual({
      status: "passed", chip: "LIS2DH12", detail: "self-test 412 / 398 / 655 mg", testedAt: "2026-11-15T10:00:00.000Z",
    });
  });

  it("fails when either test failed, with its error", () => {
    const status = motionIcFromRuns([run("2026-11-15T10:00:00.000Z",
      result("imu", "passed", { chip: "LIS2DH12" }),
      result("steps", "failed", { chip: "LIS2DH12", mode: "self-test" }, "Self-test out of range on Z"),
    )]);
    expect(status.status).toBe("failed");
    expect(status.detail).toBe("Self-test out of range on Z");
  });

  it("takes each test's newest decided result, ignoring skipped ones", () => {
    const status = motionIcFromRuns([
      run("2026-11-15T11:00:00.000Z", result("steps", "skipped"), result("imu", "passed", { chip: "LIS2DH12" })),
      run("2026-11-15T10:00:00.000Z", result("steps", "passed", { mode: "self-test", dxMg: 1, dyMg: 2, dzMg: 3 })),
    ]);
    expect(status.status).toBe("passed");
    expect(status.testedAt).toBe("2026-11-15T11:00:00.000Z");
  });

  it("is untested while the self-test has not run", () => {
    expect(motionIcFromRuns([run("2026-11-15T10:00:00.000Z", result("imu", "passed", { chip: "LIS2DH12" }))]))
      .toMatchObject({ status: "untested", chip: "LIS2DH12", detail: "Self-test not run yet" });
  });
});

describe("final test steps", () => {
  it("needs the counter to rise by the target", () => {
    expect(finalTestSteps([])).toBeNull();
    expect(finalTestSteps([120, 120, 125])).toMatchObject({ first: 120, latest: 125, increase: 5, passed: false });
    expect(finalTestSteps([0, 4, 14])).toMatchObject({ increase: 14, passed: true, target: QA_FINAL_TEST_STEP_TARGET, reports: 3 });
  });

  it("keeps counting across a restart that reset the counter", () => {
    expect(finalTestSteps([50, 56, 2, 6])).toMatchObject({ increase: 12, passed: true });
  });
});
