import { describe, expect, it } from "vitest";

import type { devices } from "../../db/schema";
import { toAdminDeviceFirmwareDto } from "./device-firmware.mapper";

const base = { firmwareVersion: null, firmwareStatus: null, firmwareReportedAt: null } as const;

describe("toAdminDeviceFirmwareDto", () => {
  it("returns null when the device never reported firmware", () => {
    expect(toAdminDeviceFirmwareDto(base as unknown as typeof devices.$inferSelect)).toBeNull();
  });

  it("maps the fw block, turning empty strings into null", () => {
    const device = {
      ...base,
      firmwareVersion: "2.1.0",
      firmwareStatus: { app: "2.1.0", boot: "0.3.0", key: "59C07275", ota: "IDLE", last: "confirmed", avail: "", dl: 0 },
      firmwareReportedAt: new Date("2026-11-06T10:00:00.000Z"),
    } as unknown as typeof devices.$inferSelect;
    expect(toAdminDeviceFirmwareDto(device)).toEqual({
      version: "2.1.0",
      bootloaderVersion: "0.3.0",
      signingKey: "59C07275",
      otaState: "IDLE",
      lastResult: "confirmed",
      availableVersion: null,
      downloadPercent: 0,
      reportedAt: "2026-11-06T10:00:00.000Z",
    });
  });
});
