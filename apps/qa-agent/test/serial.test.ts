import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QaSerialLine } from "@stepwhere/types";
import { createSerialLineSplitter, normalizePorts } from "../src/serial.js";

const enc = (text: string) => new TextEncoder().encode(text);

function setup(options: { maxLineChars?: number } = {}) {
  const lines: QaSerialLine[] = [];
  const splitter = createSerialLineSplitter({ onLine: (l) => lines.push(l), ...options });
  return { lines, splitter, texts: () => lines.map((l) => l.text) };
}

describe("serial line splitter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("splits CRLF, LF and lone CR", () => {
    const { splitter, texts } = setup();
    splitter.push(enc("one\r\ntwo\nthree\rfour\r\n"));
    expect(texts()).toEqual(["one", "two", "three", "four"]);
  });

  it("handles CRLF split across chunks without a blank line", () => {
    const { splitter, texts } = setup();
    splitter.push(enc("hello\r"));
    splitter.push(enc("\nworld\n"));
    expect(texts()).toEqual(["hello", "world"]);
  });

  it("flushes a partial line after 300 ms of silence", () => {
    const { splitter, texts } = setup();
    splitter.push(enc("boot ok\nlogin: "));
    expect(texts()).toEqual(["boot ok"]);
    vi.advanceTimersByTime(299);
    expect(texts()).toEqual(["boot ok"]);
    vi.advanceTimersByTime(2);
    expect(texts()).toEqual(["boot ok", "login: "]);
  });

  it("restarts the flush timer when more data arrives", () => {
    const { splitter, texts } = setup();
    splitter.push(enc("abc"));
    vi.advanceTimersByTime(200);
    splitter.push(enc("def"));
    vi.advanceTimersByTime(200);
    expect(texts()).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(texts()).toEqual(["abcdef"]);
  });

  it("strips NUL and control characters but keeps tabs", () => {
    const { splitter, texts } = setup();
    splitter.push(enc("a\u0000b\u0007c\u001b[0m\td\u007fe\n"));
    expect(texts()).toEqual(["abc[0m\tde"]);
  });

  it("decodes UTF-8 split across chunks", () => {
    const { splitter, texts } = setup();
    const bytes = enc("temp 25°C\n");
    splitter.push(bytes.slice(0, 9));
    splitter.push(bytes.slice(9));
    expect(texts()).toEqual(["temp 25°C"]);
  });

  it("splits lines longer than the cap", () => {
    const { splitter, texts } = setup();
    splitter.push(enc(`${"x".repeat(4500)}\n`));
    expect(texts().map((t) => t.length)).toEqual([2000, 2000, 500]);
  });

  it("drops empty lines and stamps ISO times", () => {
    const { splitter, lines } = setup();
    splitter.push(enc("\r\n\r\nx\n"));
    expect(lines).toHaveLength(1);
    expect(new Date(lines[0]!.at).toISOString()).toBe(lines[0]!.at);
  });
});

describe("port listing", () => {
  it("uppercases ids, marks USB-TTL adapters and sorts them first", () => {
    const ports = normalizePorts(
      [
        { path: "/dev/cu.Bluetooth-Incoming-Port" },
        { path: "/dev/cu.usbserial-0001", vendorId: "10c4", productId: "ea60", manufacturer: "Silicon Labs" },
        { path: "/dev/cu.wchusbserial1410", vendorId: "1a86", productId: "7523" },
        { path: "/dev/cu.other", vendorId: "dead", productId: "beef" },
      ],
      "linux",
    );
    expect(ports.map((p) => p.path)).toEqual([
      "/dev/cu.usbserial-0001",
      "/dev/cu.wchusbserial1410",
      "/dev/cu.Bluetooth-Incoming-Port",
      "/dev/cu.other",
    ]);
    expect(ports[0]).toMatchObject({ vendorId: "10C4", productId: "EA60", likelyUsbTtl: true, manufacturer: "Silicon Labs" });
    expect(ports[3]).toMatchObject({ likelyUsbTtl: false, manufacturer: null });
  });

  it("hides /dev/tty.X when /dev/cu.X exists on macOS", () => {
    const ports = normalizePorts([{ path: "/dev/tty.usbserial-1" }, { path: "/dev/cu.usbserial-1" }, { path: "/dev/tty.solo" }], "darwin");
    expect(ports.map((p) => p.path)).toEqual(["/dev/cu.usbserial-1", "/dev/tty.solo"]);
  });
});
