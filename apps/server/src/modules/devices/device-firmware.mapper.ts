import type { AdminDeviceFirmwareDto } from "@stepwhere/types";

import type { devices } from "../../db/schema";

function emptyToNull(value: string | undefined) {
  return value ? value : null;
}

export function toAdminDeviceFirmwareDto(device: typeof devices.$inferSelect): AdminDeviceFirmwareDto | null {
  if (!device.firmwareVersion || !device.firmwareReportedAt) return null;
  const status = device.firmwareStatus ?? { app: device.firmwareVersion };
  return {
    version: device.firmwareVersion,
    bootloaderVersion: emptyToNull(status.boot),
    signingKey: emptyToNull(status.key),
    otaState: emptyToNull(status.ota),
    lastResult: emptyToNull(status.last),
    availableVersion: emptyToNull(status.avail),
    downloadPercent: typeof status.dl === "number" ? status.dl : null,
    reportedAt: device.firmwareReportedAt.toISOString(),
  };
}
