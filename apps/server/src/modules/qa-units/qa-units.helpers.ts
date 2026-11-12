import { QA_FIELD_OFFLINE_AFTER_MS, QA_UNIT_STAGES } from "@stepwhere/types";
import type { QaFirmwareChannel, QaUnitFieldState, QaUnitStage, QaUnitStageStatus } from "@stepwhere/types";

/** How long after an identify or flash a station's TTL output is still attributed to that board. */
export const STATION_UNIT_WINDOW_MS = 30 * 60 * 1000;

export const STAGE_LABELS: Record<QaUnitStage, string> = {
  registered: "Registered",
  qa_firmware: "QA firmware",
  board_tests: "Board tests",
  production_firmware: "Production firmware",
  functional_tests: "Functional tests",
  assembled: "Assembled",
  final_test: "Final test",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
};

const STATUS_VERBS: Record<QaUnitStageStatus, string> = {
  pending: "pending",
  passed: "passed",
  failed: "failed",
  scrapped: "scrapped",
};

/** STM32 96-bit UID as 24 upper-case hex characters, or null when malformed. */
export function normalizeChipUid(value: string | null | undefined) {
  const uid = value?.trim().toUpperCase() ?? "";

  return /^[0-9A-F]{24}$/.test(uid) ? uid : null;
}

/** True when the 15 digits pass the IMEI Luhn check digit. */
export function isValidImei(value: string) {
  if (!/^\d{15}$/.test(value)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 15; index += 1) {
    let digit = Number(value[14 - index]);

    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

/** Spaces, dashes and dots are stripped, so labels like "86 0123 45..." work. */
export function normalizeImei(value: string | null | undefined) {
  const digits = value?.replace(/[\s.-]/g, "") ?? "";

  return isValidImei(digits) ? digits : null;
}

/**
 * The production firmware logs `[IMEI] 860123456789012` on the debug UART
 * after reading AT+CGSN at boot. Returns the IMEI when the line carries a valid one.
 */
export function parseImeiFromSerialLine(text: string) {
  const match = /\[IMEI\]\s*(\d{15})(?!\d)/.exec(text);

  return match ? normalizeImei(match[1]) : null;
}

export function stageForFirmwareChannel(channel: QaFirmwareChannel): QaUnitStage {
  return channel === "qa" ? "qa_firmware" : "production_firmware";
}

export function stageIndex(stage: QaUnitStage) {
  return QA_UNIT_STAGES.indexOf(stage);
}

export function describeStage(stage: QaUnitStage, status: QaUnitStageStatus) {
  return status === "scrapped" ? `Scrapped at ${STAGE_LABELS[stage]}` : `${STAGE_LABELS[stage]} ${STATUS_VERBS[status]}`;
}

/** Field state of a delivered unit, from its device's last telemetry. */
export function deriveFieldState(lastSeenAt: Date | null | undefined, now: Date): QaUnitFieldState {
  if (!lastSeenAt) {
    return "never_seen";
  }

  return now.getTime() - lastSeenAt.getTime() <= QA_FIELD_OFFLINE_AFTER_MS ? "active" : "offline";
}

export function shortChipUid(uid: string) {
  return uid.slice(-8);
}
