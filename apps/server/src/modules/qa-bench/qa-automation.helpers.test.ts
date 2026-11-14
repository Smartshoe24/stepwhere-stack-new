import { describe, expect, it } from "vitest";

import { decideSlotAction, pickRetry, slotIsIdle, type SlotBoard } from "./qa-automation.helpers";

const UID = "003900293A2F514391C40000";
const at = new Date("2026-11-14T10:00:00Z");
const qa = { id: "qa-fw", format: "hex" as const };
const prodHex = { id: "prod-fw", format: "hex" as const };
const prodBin = { id: "prod-bin", format: "bin" as const };
const board = (unit: SlotBoard["unit"], extra: Partial<SlotBoard> = {}): SlotBoard => ({
  chipUid: UID,
  unit,
  hasRunSinceStageChange: false,
  portOpen: true,
  ...extra,
});
const unit = (stage: NonNullable<SlotBoard["unit"]>["stage"], stageStatus: NonNullable<SlotBoard["unit"]>["stageStatus"] = "passed") => ({
  stage,
  stageStatus,
  stageChangedAt: at,
});

describe("decideSlotAction", () => {
  it("flashes the QA firmware onto a new board, once", () => {
    const action = decideSlotAction(board(null), { qa, production: prodHex }, new Set());
    expect(action).toMatchObject({ kind: "flash_qa", firmwareId: "qa-fw" });

    const again = decideSlotAction(board(null), { qa, production: prodHex }, new Set([action.kind === "none" ? "" : action.key]));
    expect(again.kind).toBe("none");
  });

  it("treats a registered unit as new, and does nothing without QA firmware", () => {
    expect(decideSlotAction(board(unit("registered", "pending")), { qa, production: null }, new Set()).kind).toBe("flash_qa");
    expect(decideSlotAction(board(null), { qa: null, production: null }, new Set()).kind).toBe("none");
  });

  it("asks a silent QA board for its tests, then reflashes it once, then gives up", () => {
    const flashed = board(unit("qa_firmware"));
    const first = decideSlotAction(flashed, { qa, production: null }, new Set());
    expect(first.kind).toBe("run_tests");

    const done = new Set([first.kind === "none" ? "" : first.key]);
    const second = decideSlotAction(flashed, { qa, production: null }, done);
    expect(second.kind).toBe("flash_qa");

    done.add(second.kind === "none" ? "" : second.key);
    expect(decideSlotAction(flashed, { qa, production: null }, done).kind).toBe("none");
  });

  it("waits for the TTL port before asking for tests", () => {
    expect(decideSlotAction(board(unit("qa_firmware"), { portOpen: false }), { qa, production: null }, new Set()).kind).toBe("none");
  });

  it("leaves a board alone while its tests run", () => {
    expect(decideSlotAction(board(unit("qa_firmware"), { hasRunSinceStageChange: true }), { qa, production: null }, new Set()).kind).toBe("none");
  });

  it("flashes production firmware after the board tests pass, only from a combined .hex", () => {
    expect(decideSlotAction(board(unit("board_tests", "passed")), { qa, production: prodHex }, new Set()))
      .toMatchObject({ kind: "flash_production", firmwareId: "prod-fw" });
    expect(decideSlotAction(board(unit("board_tests", "passed")), { qa, production: prodBin }, new Set()).kind).toBe("none");
    expect(decideSlotAction(board(unit("board_tests", "passed")), { qa, production: null }, new Set()).kind).toBe("none");
  });

  it("never flashes failed, untested, scrapped or later boards", () => {
    for (const u of [unit("board_tests", "failed"), unit("board_tests", "pending"), unit("production_firmware"), unit("functional_tests"), unit("delivered"), unit("qa_firmware", "scrapped")]) {
      expect(decideSlotAction(board(u), { qa, production: prodHex }, new Set()).kind).toBe("none");
    }
  });

  it("starts fresh when the unit reaches its stage again", () => {
    const first = decideSlotAction(board(unit("board_tests", "passed")), { qa, production: prodHex }, new Set());
    const later = { ...unit("board_tests", "passed"), stageChangedAt: new Date("2026-11-15T10:00:00Z") };
    const again = decideSlotAction(board(later), { qa, production: prodHex }, new Set([first.kind === "none" ? "" : first.key]));
    expect(again.kind).toBe("flash_production");
  });
});

describe("pickRetry", () => {
  it("retries each network test once and never a hardware test", () => {
    expect(pickRetry(["imu", "gsm"], new Set())).toBe("gsm");
    expect(pickRetry(["gsm", "data"], new Set(["gsm"]))).toBe("data");
    expect(pickRetry(["gsm"], new Set(["gsm"]))).toBeNull();
    expect(pickRetry(["imu", "flash", "power", "steps", "gps", "modem"], new Set())).toBeNull();
  });
});

describe("slotIsIdle", () => {
  const now = Date.parse("2026-11-14T10:00:30Z");

  it("is busy while a job or a run is active", () => {
    expect(slotIsIdle({ hasActiveJob: true, runRunning: false, lastLineAt: null, now, quietMs: 20_000 })).toBe(false);
    expect(slotIsIdle({ hasActiveJob: false, runRunning: true, lastLineAt: null, now, quietMs: 20_000 })).toBe(false);
  });

  it("is idle after a quiet period on the TTL port", () => {
    expect(slotIsIdle({ hasActiveJob: false, runRunning: false, lastLineAt: "2026-11-14T10:00:25Z", now, quietMs: 20_000 })).toBe(false);
    expect(slotIsIdle({ hasActiveJob: false, runRunning: false, lastLineAt: "2026-11-14T10:00:00Z", now, quietMs: 20_000 })).toBe(true);
    expect(slotIsIdle({ hasActiveJob: false, runRunning: false, lastLineAt: null, now, quietMs: 20_000 })).toBe(true);
  });
});
