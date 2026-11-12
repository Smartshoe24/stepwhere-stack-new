import { describe, expect, it } from "vitest";

import { QA_AGENT_MAX_MESSAGE_BYTES, parseAgentMessage } from "./qa-agent.messages";

const jobId = "3f2b9c1e-6d1a-4c52-9a38-0d7c8a6f1b11";
const frame = (type: string, data: unknown) => JSON.stringify({ type, data });

const hello = {
  protocolVersion: 1,
  agentVersion: "0.1.0",
  hostname: "bench-pc",
  platform: "win32",
  arch: "x64",
  nodeVersion: "v22.0.0",
  programmer: { found: true, path: "C:\\ST\\STM32_Programmer_CLI.exe", version: "2.17", error: null },
};

describe("parseAgentMessage", () => {
  it("accepts every valid message type", () => {
    const valid: Array<[string, unknown]> = [
      ["agent.hello", hello],
      ["agent.hardware", {
        probes: [{ serial: "0670FF", firmware: "V3J9", boardName: null }],
        ports: [{ path: "COM3", manufacturer: "FTDI", serialNumber: null, vendorId: "0403", productId: "6001", likelyUsbTtl: true }],
        scannedAt: new Date().toISOString(),
        probeScanError: null,
      }],
      ["agent.pong", { sentAt: new Date().toISOString() }],
      ["job.accepted", { jobId }],
      ["job.progress", { jobId, phase: "programming", percent: 42 }],
      ["job.progress", { jobId, phase: "connecting", percent: null }],
      ["job.log", { jobId, lines: ["a", "b"] }],
      ["job.result", {
        jobId,
        ok: true,
        result: {
          target: { deviceId: "0x460", deviceName: "STM32G07x", flashSizeKb: 128, voltage: "3.3", uid: "0".repeat(24) },
          verified: true,
          durationMs: 1234,
          exitCode: 0,
          error: null,
        },
      }],
      ["serial.opened", { path: "COM3", baudRate: 115200 }],
      ["serial.closed", { path: "COM3", reason: null }],
      ["serial.data", { path: "COM3", lines: [{ at: new Date().toISOString(), text: "boot" }] }],
      ["serial.error", { path: "COM3", message: "port busy" }],
    ];

    for (const [type, data] of valid) {
      expect(parseAgentMessage(frame(type, data)), type).toMatchObject({ type, data });
    }
  });

  it("rejects garbage and non-string payloads", () => {
    expect(parseAgentMessage("not json")).toBeNull();
    expect(parseAgentMessage("null")).toBeNull();
    expect(parseAgentMessage("[]")).toBeNull();
    expect(parseAgentMessage(frame("agent.unknown", {}))).toBeNull();
    expect(parseAgentMessage(new ArrayBuffer(8))).toBeNull();
    expect(parseAgentMessage(undefined)).toBeNull();
  });

  it("rejects malformed fields", () => {
    expect(parseAgentMessage(frame("job.accepted", { jobId: "nope" }))).toBeNull();
    expect(parseAgentMessage(frame("job.progress", { jobId, phase: "melting", percent: 1 }))).toBeNull();
    expect(parseAgentMessage(frame("job.progress", { jobId, phase: "erasing", percent: 101 }))).toBeNull();
    expect(parseAgentMessage(frame("serial.opened", { path: "", baudRate: 115200 }))).toBeNull();
    expect(parseAgentMessage(frame("agent.hello", { ...hello, hostname: "h".repeat(256) }))).toBeNull();
  });

  it("rejects oversized batches and lines", () => {
    expect(parseAgentMessage(frame("job.log", { jobId, lines: Array(501).fill("x") }))).toBeNull();
    expect(parseAgentMessage(frame("job.log", { jobId, lines: ["x".repeat(4001)] }))).toBeNull();
    expect(parseAgentMessage(frame("job.log", { jobId, lines: Array(500).fill("x".repeat(4000)) }))).not.toBeNull();
    expect(parseAgentMessage(frame("serial.data", {
      path: "COM3",
      lines: Array(501).fill({ at: "t", text: "x" }),
    }))).toBeNull();
  });

  it("drops payloads over the size limit without parsing", () => {
    const huge = `{"type":"job.log","data":{"jobId":"${jobId}","lines":["${"x".repeat(QA_AGENT_MAX_MESSAGE_BYTES)}"]}}`;

    expect(parseAgentMessage(huge)).toBeNull();
  });
});
