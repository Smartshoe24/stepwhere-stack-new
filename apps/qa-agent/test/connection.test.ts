import { describe, expect, it } from "vitest";
import { normalizeServerUrl, toWebSocketBase } from "../src/config.js";
import { backoffDelayMs, parseServerMessage } from "../src/connection.js";
import { snapshotSignature } from "../src/hardware.js";

describe("config helpers", () => {
  it("normalizes server URLs", () => {
    expect(normalizeServerUrl("https://api.example.com/")).toBe("https://api.example.com");
    expect(normalizeServerUrl(" http://localhost:3000// ")).toBe("http://localhost:3000");
    expect(() => normalizeServerUrl("ftp://x")).toThrow();
    expect(() => normalizeServerUrl("not a url")).toThrow();
  });
  it("maps http to ws", () => {
    expect(toWebSocketBase("https://a.b")).toBe("wss://a.b");
    expect(toWebSocketBase("http://a.b:1")).toBe("ws://a.b:1");
  });
});

describe("connection helpers", () => {
  it("parses server messages and tolerates garbage", () => {
    expect(parseServerMessage('{"type":"server.ping","data":{"sentAt":"x"}}')).toEqual({ type: "server.ping", data: { sentAt: "x" } });
    expect(parseServerMessage('{"type":"future.thing"}')).toEqual({ type: "future.thing", data: {} });
    expect(parseServerMessage("not json")).toBeNull();
    expect(parseServerMessage("[]")).toBeNull();
    expect(parseServerMessage('{"data":{}}')).toBeNull();
  });

  it("backs off 1 s to 30 s with jitter", () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(1000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(8000);
    expect(backoffDelayMs(20, () => 0.5)).toBe(30000);
    expect(backoffDelayMs(0, () => 0)).toBe(750);
    expect(backoffDelayMs(20, () => 1)).toBe(37500);
  });

  it("compares snapshots ignoring scannedAt", () => {
    const a = { probes: [], ports: [], probeScanError: null };
    expect(snapshotSignature(a)).toBe(snapshotSignature({ ...a }));
    expect(snapshotSignature(a)).not.toBe(snapshotSignature({ ...a, probeScanError: "x" }));
  });
});
