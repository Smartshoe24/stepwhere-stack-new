import { describe, expect, it } from "vitest";
import { QA_UNIT_STAGES } from "@stepwhere/types";

import {
  acceptsTestReports,
  autoRegisterStage,
  imeiHasAllowedTac,
  networkLookupDue,
  QA_NETWORK_LOOKUP_MAX,
  reportChipUid,
  reportFirmware,
} from "./qa-test-log.helpers";

const UID = "0039003A3133510537363830";

describe("QA test log rules", () => {
  it("accepts uploads in every stage before Ready to ship, never once scrapped", () => {
    const accepted = QA_UNIT_STAGES.filter((stage) => acceptsTestReports({ stage, stageStatus: "pending" }));
    expect(accepted).toEqual([
      "registered", "qa_firmware", "board_tests", "production_firmware", "functional_tests", "assembled", "final_test",
    ]);
    expect(acceptsTestReports({ stage: "board_tests", stageStatus: "failed" })).toBe(true);
    expect(acceptsTestReports({ stage: "board_tests", stageStatus: "scrapped" })).toBe(false);
  });

  it("reads the chip UID and firmware from the QA block or the fw block", () => {
    expect(reportChipUid({ qa: { uid: UID.toLowerCase(), fw: "qa-0.7.0" } })).toBe(UID);
    expect(reportChipUid({ fw: { app: "2.2.1", uid: UID } })).toBe(UID);
    expect(reportChipUid({ fw: { app: "2.2.0" } })).toBeNull();
    expect(reportFirmware({ qa: { uid: UID, fw: "qa-0.7.0" } })).toBe("qa-0.7.0");
    expect(reportFirmware({ fw: { app: "2.2.0" } })).toBe("2.2.0");
    expect(autoRegisterStage({ qa: { uid: UID, fw: "qa-0.7.0" } })).toBe("board_tests");
    expect(autoRegisterStage({})).toBe("production_firmware");
  });

  it("auto-registers only IMEIs of our modem model", () => {
    expect(imeiHasAllowedTac("869938082392680", ["86993808"])).toBe(true);
    expect(imeiHasAllowedTac("490154203237518", ["86993808"])).toBe(false);
    expect(imeiHasAllowedTac("869938082392680", [])).toBe(false);
  });

  it("makes at most 10 lookups, 30 s apart, for QA firmware uploads only", () => {
    const now = new Date("2026-11-15T10:00:00.000Z");
    const base = { isQaFirmware: true, enabled: true, usableObservation: true, lookups: 0, lastLookupAt: null, now };
    const ago = (ms: number) => new Date(now.getTime() - ms);

    expect(networkLookupDue(base)).toBe(true);
    expect(networkLookupDue({ ...base, isQaFirmware: false })).toBe(false);
    expect(networkLookupDue({ ...base, enabled: false })).toBe(false);
    expect(networkLookupDue({ ...base, usableObservation: false })).toBe(false);
    expect(networkLookupDue({ ...base, lookups: QA_NETWORK_LOOKUP_MAX - 1, lastLookupAt: ago(30_000) })).toBe(true);
    expect(networkLookupDue({ ...base, lookups: QA_NETWORK_LOOKUP_MAX, lastLookupAt: ago(60_000) })).toBe(false);
    expect(networkLookupDue({ ...base, lookups: 3, lastLookupAt: ago(29_000) })).toBe(false);
  });
});
