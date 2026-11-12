import { describe, expect, it } from "vitest";
import { QA_FIRMWARE_MAX_BYTES } from "@stepwhere/types";
import type { QaSerialLine } from "@stepwhere/types";

import { AppError } from "../../shared/errors";
import {
  JOB_LOG_MAX_CHARS,
  PAIRING_CODE_ALPHABET,
  appendCappedLog,
  appendRingLines,
  capSerialLines,
  decodeStrictBase64,
  describeProbeConflict,
  serialPortKey,
  formatPairingCode,
  generatePairingCode,
  isUniqueViolation,
  normalizePairingCode,
  serialBufferKey,
  splitLogLines,
  validateFirmwareUpload,
} from "./qa-bench.helpers";

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64");

describe("pairing codes", () => {
  it("generates XXXX-XXXX codes from the unambiguous alphabet", () => {
    for (let index = 0; index < 200; index += 1) {
      const { display, normalized } = generatePairingCode();

      expect(display).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(normalized).toHaveLength(8);
      expect([...normalized].every((char) => PAIRING_CODE_ALPHABET.includes(char))).toBe(true);
      expect(normalizePairingCode(display)).toBe(normalized);
    }
  });

  it("normalises case, spaces and dashes", () => {
    expect(normalizePairingCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizePairingCode("  ab cd  ef-gh ")).toBe("ABCDEFGH");
    expect(normalizePairingCode("AB_CD.EF/GH")).toBe("ABCDEFGH");
    expect(formatPairingCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });
});

describe("validateFirmwareUpload", () => {
  const hexRecords = ":020000040800F2\n:10000000000002200100000800000000000000009C\n:00000001FF\n";

  it("accepts a .bin and hashes its bytes", () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    const result = validateFirmwareUpload({ fileName: "app.bin", contentBase64: b64(bytes) });

    expect(result.format).toBe("bin");
    expect(result.sizeBytes).toBe(4);
    expect(result.sha256).toBe("9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a");
    expect(result.bytes.equals(bytes)).toBe(true);
  });

  it("accepts an Intel HEX file (CRLF, blank lines, upper-case extension)", () => {
    const result = validateFirmwareUpload({
      fileName: "App.HEX",
      contentBase64: b64(`${hexRecords.replace(/\n/g, "\r\n")}\r\n`),
    });

    expect(result.format).toBe("hex");
  });

  it("rejects hex files with a malformed line", () => {
    expect(() => validateFirmwareUpload({
      fileName: "app.hex",
      contentBase64: b64(`${hexRecords}this is not hex\n`),
    })).toThrow(AppError);
    expect(() => validateFirmwareUpload({
      fileName: "app.hex",
      contentBase64: b64(":02ZZ\n"),
    })).toThrow(AppError);
    expect(() => validateFirmwareUpload({ fileName: "app.hex", contentBase64: b64("\n\n") })).toThrow(AppError);
  });

  it.each(["../app.bin", "a/b.bin", "a\\b.bin", "..bin", "x..y.bin", ""])("rejects file name %j", (fileName) => {
    expect(() => validateFirmwareUpload({ fileName, contentBase64: b64("abc") })).toThrow(AppError);
  });

  it("rejects wrong extensions", () => {
    expect(() => validateFirmwareUpload({ fileName: "app.elf", contentBase64: b64("abc") })).toThrow(/\.bin or \.hex/);
    expect(() => validateFirmwareUpload({ fileName: "bin", contentBase64: b64("abc") })).toThrow(AppError);
  });

  it("rejects empty and oversized content", () => {
    expect(() => validateFirmwareUpload({ fileName: "a.bin", contentBase64: "" })).toThrow(/empty/);
    expect(() => validateFirmwareUpload({
      fileName: "a.bin",
      contentBase64: b64(Buffer.alloc(QA_FIRMWARE_MAX_BYTES + 1, 1)),
    })).toThrow(/at most/);
    expect(validateFirmwareUpload({
      fileName: "a.bin",
      contentBase64: b64(Buffer.alloc(QA_FIRMWARE_MAX_BYTES, 1)),
    }).sizeBytes).toBe(QA_FIRMWARE_MAX_BYTES);
  });

  it("rejects non-strict base64", () => {
    expect(() => validateFirmwareUpload({ fileName: "a.bin", contentBase64: "not base64!" })).toThrow(/base64/);
    expect(() => validateFirmwareUpload({ fileName: "a.bin", contentBase64: "QUJD\nREVG" })).toThrow(/base64/);
    expect(decodeStrictBase64("QUJD")?.toString()).toBe("ABC");
    expect(decodeStrictBase64("QUJ")).toBeNull();
    expect(decodeStrictBase64("QUJ=")).toBeNull();
  });
});

describe("job log helpers", () => {
  it("appends until the cap, then truncates and stops", () => {
    let state = { log: "", truncated: false };

    state = appendCappedLog(state, "hello\n", 10);
    expect(state).toEqual({ log: "hello\n", truncated: false });

    state = appendCappedLog(state, "world and more\n", 10);
    expect(state).toEqual({ log: "hello\nworl", truncated: true });

    state = appendCappedLog(state, "ignored\n", 10);
    expect(state.log).toBe("hello\nworl");
  });

  it("exposes a 256 KB default cap", () => {
    const state = appendCappedLog({ log: "", truncated: false }, "x".repeat(JOB_LOG_MAX_CHARS + 5));

    expect(state.log).toHaveLength(JOB_LOG_MAX_CHARS);
    expect(state.truncated).toBe(true);
  });

  it("splits stored logs into lines", () => {
    expect(splitLogLines("")).toEqual([]);
    expect(splitLogLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLogLines("a\n\nb")).toEqual(["a", "", "b"]);
  });
});

describe("serial ring buffer", () => {
  const line = (index: number): QaSerialLine => ({ at: `t${index}`, text: `line ${index}` });

  it("keeps only the newest lines", () => {
    const first = Array.from({ length: 5 }, (_, index) => line(index));
    const next = appendRingLines(first, [line(5), line(6)], 4);

    expect(next.map((entry) => entry.at)).toEqual(["t3", "t4", "t5", "t6"]);
    expect(first).toHaveLength(5);
  });

  it("handles a batch larger than the buffer", () => {
    const batch = Array.from({ length: 10 }, (_, index) => line(index));

    expect(appendRingLines([], batch, 3).map((entry) => entry.at)).toEqual(["t7", "t8", "t9"]);
  });

  it("caps line text", () => {
    const [capped] = capSerialLines([{ at: "t", text: "x".repeat(5000) }]);

    expect(capped.text).toHaveLength(2000);
  });

  it("keys buffers per station and path", () => {
    expect(serialBufferKey("s", "/dev/ttyUSB0")).not.toBe(serialBufferKey("s", "/dev/ttyUSB1"));
  });
});

describe("isUniqueViolation", () => {
  it("finds the postgres code on the error or its cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("wrapped", { cause: { code: "23505" } }))).toBe(true);
    expect(isUniqueViolation(new Error("other"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("describeProbeConflict", () => {
  it("lets jobs on different ST-LINKs run side by side", () => {
    expect(describeProbeConflict([], null)).toBeNull();
    expect(describeProbeConflict(["066DFF49"], "0671FF55")).toBeNull();
  });

  it("keeps one job per ST-LINK, and runs a job without a chosen ST-LINK alone", () => {
    expect(describeProbeConflict(["066DFF49"], "066DFF49")).toContain("066DFF49");
    expect(describeProbeConflict(["066DFF49"], null)).toContain("Pick an ST-LINK");
    expect(describeProbeConflict([null], "066DFF49")).toContain("without a chosen ST-LINK");
  });
});

describe("serialPortKey", () => {
  it("follows the adapter's USB serial number across paths", () => {
    const port = { path: "/dev/tty.usbserial-A10K3Q1", serialNumber: "A10K3Q1", vendorId: "0403", productId: "6001" };
    expect(serialPortKey(port)).toBe("usb:0403:6001:A10K3Q1");
    expect(serialPortKey({ ...port, path: "COM7" })).toBe(serialPortKey(port));
  });

  it("falls back to the path for adapters without a serial number", () => {
    expect(serialPortKey({ path: "COM5", serialNumber: null, vendorId: "1a86", productId: "7523" })).toBe("path:COM5");
    expect(serialPortKey({ path: "COM5", serialNumber: "  ", vendorId: null, productId: null })).toBe("path:COM5");
  });
});
