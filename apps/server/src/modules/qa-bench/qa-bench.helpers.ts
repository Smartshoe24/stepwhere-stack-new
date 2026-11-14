import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { QA_FIRMWARE_MAX_BYTES } from "@stepwhere/types";
import type { QaFirmwareFormat, QaSerialLine, QaSerialPortInfo } from "@stepwhere/types";

import { badRequest } from "../../shared/errors";

// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

/** No I, L, O, 0, 1: easy to read off a screen and type on a bench PC. */
export const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

export function normalizePairingCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatPairingCode(normalized: string) {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/** Returns the display form (`XXXX-XXXX`) and the normalised form that gets hashed. */
export function generatePairingCode() {
  let normalized = "";

  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    normalized += PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)];
  }

  return { display: formatPairingCode(normalized), normalized };
}

// ---------------------------------------------------------------------------
// Firmware uploads
// ---------------------------------------------------------------------------

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const HEX_RECORD_PATTERN = /^:[0-9A-Fa-f]{10,}$/;

export type ValidatedFirmware = {
  fileName: string;
  format: QaFirmwareFormat;
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
};

/** Strict base64: canonical alphabet, correct padding, no whitespace. Returns null when invalid. */
export function decodeStrictBase64(input: string): Buffer | null {
  if (input.length % 4 !== 0 || !BASE64_PATTERN.test(input)) {
    return null;
  }

  const bytes = Buffer.from(input, "base64");

  // Rejects non-canonical trailing bits.
  return bytes.toString("base64") === input ? bytes : null;
}

export function validateFirmwareUpload(input: { fileName: string; contentBase64: string }): ValidatedFirmware {
  const fileName = input.fileName.trim();

  if (fileName.length < 1 || fileName.length > 200) {
    throw badRequest("File name must be 1 to 200 characters.");
  }

  if (/[\\/\u0000-\u001f]/.test(fileName) || fileName.includes("..")) {
    throw badRequest("File name must not contain path separators.");
  }

  const lower = fileName.toLowerCase();
  let format: QaFirmwareFormat;

  if (lower.endsWith(".bin")) {
    format = "bin";
  } else if (lower.endsWith(".hex")) {
    format = "hex";
  } else {
    throw badRequest("Firmware must be a .bin or .hex file.");
  }

  // Cheap bound before allocating: base64 is 4 chars per 3 bytes.
  if (input.contentBase64.length > Math.ceil(QA_FIRMWARE_MAX_BYTES / 3) * 4) {
    throw badRequest(`Firmware must be at most ${QA_FIRMWARE_MAX_BYTES} bytes.`);
  }

  const bytes = decodeStrictBase64(input.contentBase64);

  if (!bytes) {
    throw badRequest("Firmware content is not valid base64.");
  }

  if (bytes.length < 1) {
    throw badRequest("Firmware file is empty.");
  }

  if (bytes.length > QA_FIRMWARE_MAX_BYTES) {
    throw badRequest(`Firmware must be at most ${QA_FIRMWARE_MAX_BYTES} bytes.`);
  }

  if (format === "hex") {
    const lines = bytes.toString("latin1").split(/\r?\n/);
    let records = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.length === 0) {
        continue;
      }

      if (!HEX_RECORD_PATTERN.test(line)) {
        throw badRequest("File is not valid Intel HEX.");
      }

      records += 1;
    }

    if (records === 0) {
      throw badRequest("File is not valid Intel HEX.");
    }
  }

  return {
    fileName,
    format,
    bytes,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// Job logs
// ---------------------------------------------------------------------------

export const JOB_LOG_MAX_CHARS = 256 * 1024;

/**
 * Appends `addition` to a stored job log without exceeding `maxChars`. Once the
 * cap is hit the log is flagged truncated and later appends are dropped.
 */
export function appendCappedLog(
  current: { log: string; truncated: boolean },
  addition: string,
  maxChars = JOB_LOG_MAX_CHARS,
): { log: string; truncated: boolean } {
  if (current.truncated || addition.length === 0) {
    return current;
  }

  const room = maxChars - current.log.length;

  if (addition.length <= room) {
    return { log: current.log + addition, truncated: false };
  }

  return { log: current.log + addition.slice(0, Math.max(room, 0)), truncated: true };
}

export function splitLogLines(log: string) {
  if (log.length === 0) {
    return [];
  }

  const lines = log.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Serial ring buffer
// ---------------------------------------------------------------------------

export const SERIAL_BUFFER_MAX_LINES = 2000;
export const SERIAL_LINE_MAX_CHARS = 2000;

export function capSerialLines(lines: QaSerialLine[], maxChars = SERIAL_LINE_MAX_CHARS): QaSerialLine[] {
  return lines.map((line) => (
    line.text.length > maxChars ? { at: line.at, text: line.text.slice(0, maxChars) } : line
  ));
}

/** Appends to a ring buffer, keeping only the newest `maxLines`. Returns a new array. */
export function appendRingLines(
  existing: QaSerialLine[],
  incoming: QaSerialLine[],
  maxLines = SERIAL_BUFFER_MAX_LINES,
): QaSerialLine[] {
  const combined = existing.concat(incoming);

  return combined.length > maxLines ? combined.slice(combined.length - maxLines) : combined;
}

export function serialBufferKey(stationId: string, path: string) {
  return `${stationId}\u0000${path}`;
}

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * Why a new job cannot start next to the station's active jobs, or null when it can.
 * Jobs on different ST-LINKs run side by side; a job without a chosen ST-LINK may use any, so it runs alone.
 */
export function describeProbeConflict(activeProbes: (string | null)[], probeSerial: string | null): string | null {
  if (activeProbes.length === 0) {
    return null;
  }

  if (probeSerial === null) {
    return "Another job is in progress. Pick an ST-LINK to flash boards side by side.";
  }

  if (activeProbes.includes(null)) {
    return "A job without a chosen ST-LINK is in progress. Wait for it to finish.";
  }

  return activeProbes.includes(probeSerial) ? `ST-LINK ${probeSerial} already has a job in progress.` : null;
}

/**
 * Identifies a TTL adapter across replugs: by its USB serial number when it has one,
 * else by its path (CH340 adapters usually have no serial number).
 */
export function serialPortKey(port: Pick<QaSerialPortInfo, "path" | "serialNumber" | "vendorId" | "productId">): string {
  const serial = port.serialNumber?.trim();

  if (serial) {
    return `usb:${(port.vendorId ?? "").toLowerCase()}:${(port.productId ?? "").toLowerCase()}:${serial}`;
  }

  return `path:${port.path}`;
}

/** Constant-time check of the CI upload token (both sides hashed, so lengths may differ). */
export function ciTokenMatches(presented: string | undefined, expected: string | undefined) {
  if (!presented || !expected) {
    return false;
  }

  const digest = (value: string) => createHash("sha256").update(value).digest();

  return timingSafeEqual(digest(presented), digest(expected));
}
