import type { QaBoardTestId, QaFirmwareFormat, QaUnitStage, QaUnitStageStatus } from "@stepwhere/types";

/**
 * Board tests that depend on the network or the SIM, and so can fail by chance
 * (a busy cell, a slow registration). Automation retries each of these once
 * before a board counts as failed. Hardware tests are never retried.
 */
export const QA_AUTOMATION_RETRYABLE_TESTS: readonly QaBoardTestId[] = ["sim", "gsm", "wifi", "cell", "data"];

/** A board sitting on a slot, as automation sees it after identifying it. */
export type SlotBoard = {
  chipUid: string;
  unit: {
    stage: QaUnitStage;
    stageStatus: QaUnitStageStatus;
    stageChangedAt: Date;
  } | null;
  /** A QA test run read for this unit since it reached its current stage. */
  hasRunSinceStageChange: boolean;
  /** The slot's TTL port is open, so QA RUN can reach the board. */
  portOpen: boolean;
};

export type AutomationFirmware = { id: string; format: QaFirmwareFormat };

export type SlotAction =
  | { kind: "none"; reason: string }
  | { kind: "flash_qa"; key: string; firmwareId: string; reason: string }
  | { kind: "run_tests"; key: string; reason: string }
  | { kind: "flash_production"; key: string; firmwareId: string; reason: string };

/**
 * What to do with the board on a slot. Each action has a key, and an action is
 * taken at most once per key (`done`), so a board is never flashed or tested
 * in a loop. Keys include the time the unit reached its stage, so the next
 * stage starts fresh.
 */
export function decideSlotAction(
  board: SlotBoard,
  firmware: { qa: AutomationFirmware | null; production: AutomationFirmware | null },
  done: ReadonlySet<string>,
): SlotAction {
  const { chipUid, unit } = board;

  if (unit?.stageStatus === "scrapped") {
    return { kind: "none", reason: "Scrapped" };
  }

  if (!unit || unit.stage === "registered") {
    const key = `${chipUid}:flash_qa:new`;

    if (!firmware.qa) {
      return { kind: "none", reason: "No QA firmware uploaded" };
    }

    return done.has(key)
      ? { kind: "none", reason: "QA firmware already flashed once" }
      : { kind: "flash_qa", key, firmwareId: firmware.qa.id, reason: "New board" };
  }

  const since = unit.stageChangedAt.getTime();

  if (unit.stage === "qa_firmware") {
    if (board.hasRunSinceStageChange) {
      return { kind: "none", reason: "Board tests are running" };
    }

    // Safety net: the boot run was missed (the port opened late). Ask for it once,
    // then flash again once, in case the board holds other firmware.
    const runKey = `${chipUid}:run_tests:${since}`;

    if (!done.has(runKey)) {
      return board.portOpen
        ? { kind: "run_tests", key: runKey, reason: "No board test results after the QA flash" }
        : { kind: "none", reason: "Waiting for the TTL port" };
    }

    const reflashKey = `${chipUid}:flash_qa:${since}`;

    if (firmware.qa && !done.has(reflashKey)) {
      return { kind: "flash_qa", key: reflashKey, firmwareId: firmware.qa.id, reason: "QA RUN got no answer" };
    }

    return { kind: "none", reason: "Board does not answer the QA firmware" };
  }

  if (unit.stage === "board_tests" && unit.stageStatus === "passed") {
    const key = `${chipUid}:flash_production:${since}`;

    if (!firmware.production) {
      return { kind: "none", reason: "No production firmware uploaded" };
    }

    if (firmware.production.format !== "hex") {
      return { kind: "none", reason: "Production firmware must be the combined .hex (bootloader + app)" };
    }

    return done.has(key)
      ? { kind: "none", reason: "Production firmware already flashed once" }
      : { kind: "flash_production", key, firmwareId: firmware.production.id, reason: "Board tests passed" };
  }

  return { kind: "none", reason: `Nothing to do at ${unit.stage}/${unit.stageStatus}` };
}

/** The next failing test to retry, or null when none is left. Each test is retried once. */
export function pickRetry(failing: readonly QaBoardTestId[], retried: ReadonlySet<QaBoardTestId>) {
  return failing.find((id) => QA_AUTOMATION_RETRYABLE_TESTS.includes(id) && !retried.has(id)) ?? null;
}

/** True when a slot may be probed now: nothing running on it and no TTL output for a while. */
export function slotIsIdle(input: {
  hasActiveJob: boolean;
  runRunning: boolean;
  lastLineAt: string | null;
  now: number;
  quietMs: number;
}) {
  if (input.hasActiveJob || input.runRunning) {
    return false;
  }

  if (!input.lastLineAt) {
    return true;
  }

  const last = Date.parse(input.lastLineAt);

  return Number.isNaN(last) || input.now - last >= input.quietMs;
}
