import { describe, expect, it } from "vitest";
import { QA_FIELD_OFFLINE_AFTER_MS } from "@stepwhere/types";

import {
  describeStage,
  deriveFieldState,
  isValidImei,
  normalizeChipUid,
  normalizeImei,
  parseImeiFromSerialLine,
  stageForFirmwareChannel,
  stageIndex,
} from "./qa-units.helpers";

// 490154203237518 is the canonical example IMEI with a valid check digit.
const IMEI = "490154203237518";

describe("chip UIDs", () => {
  it("accepts 24 hex characters and upper-cases them", () => {
    expect(normalizeChipUid("005500313434510231303739")).toBe("005500313434510231303739");
    expect(normalizeChipUid(" 0055003134345102313037ab ")).toBe("0055003134345102313037AB");
  });

  it("rejects anything else", () => {
    expect(normalizeChipUid(null)).toBeNull();
    expect(normalizeChipUid("")).toBeNull();
    expect(normalizeChipUid("00550031343451023130373")).toBeNull();
    expect(normalizeChipUid("0055003134345102313037ZZ")).toBeNull();
  });
});

describe("IMEIs", () => {
  it("checks the Luhn digit", () => {
    expect(isValidImei(IMEI)).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false);
    expect(isValidImei("49015420323751")).toBe(false);
  });

  it("strips label separators", () => {
    expect(normalizeImei("49-015420-323751-8")).toBe(IMEI);
    expect(normalizeImei("49 0154 2032 3751 8")).toBe(IMEI);
    expect(normalizeImei("not an imei")).toBeNull();
  });

  it("reads the firmware's boot log line", () => {
    expect(parseImeiFromSerialLine(`[IMEI] ${IMEI}`)).toBe(IMEI);
    expect(parseImeiFromSerialLine(`12:00:01 [IMEI] ${IMEI}\r`)).toBe(IMEI);
    expect(parseImeiFromSerialLine("[IMEI] ERROR")).toBeNull();
    expect(parseImeiFromSerialLine(`[IMEI] ${IMEI}7`)).toBeNull();
    expect(parseImeiFromSerialLine("[IMEI] 490154203237519")).toBeNull();
    expect(parseImeiFromSerialLine(`[STATUS] IMEI valid   : yes ${IMEI}`)).toBeNull();
  });
});

describe("stages", () => {
  it("maps firmware channels to their stage", () => {
    expect(stageForFirmwareChannel("qa")).toBe("qa_firmware");
    expect(stageForFirmwareChannel("production")).toBe("production_firmware");
  });

  it("orders stages along the production line", () => {
    expect(stageIndex("registered")).toBe(0);
    expect(stageIndex("board_tests")).toBeLessThan(stageIndex("production_firmware"));
    expect(stageIndex("delivered")).toBe(9);
  });

  it("describes a stage change", () => {
    expect(describeStage("board_tests", "passed")).toBe("Board tests passed");
    expect(describeStage("final_test", "failed")).toBe("Final test failed");
    expect(describeStage("assembled", "scrapped")).toBe("Scrapped at Assembled");
  });
});

describe("field state", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("is active within the offline window", () => {
    expect(deriveFieldState(new Date(now.getTime() - QA_FIELD_OFFLINE_AFTER_MS), now)).toBe("active");
    expect(deriveFieldState(new Date(now.getTime() - QA_FIELD_OFFLINE_AFTER_MS - 1), now)).toBe("offline");
    expect(deriveFieldState(null, now)).toBe("never_seen");
  });
});
