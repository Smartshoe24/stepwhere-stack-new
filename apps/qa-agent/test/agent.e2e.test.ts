import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { QaAgentJob, QaAgentToServerMessage } from "@stepwhere/types";
import { Agent } from "../src/connection.js";
import { setProgrammerPath } from "../src/programmer.js";
import * as log from "../src/log.js";

const FAKE_CLI = `#!/bin/sh
case "$*" in
  *--version*)
    printf '\\033[36m\\033[01m  STM32CubeProgrammer version: 2.23.0 \\033[0m\\n' ;;
  "-l st-link")
    printf '===== STLink Interface =====\\n\\n-------- Connected ST-LINK Probes List --------\\n\\nST-Link Probe 0 :\\n   ST-LINK SN  : 066DFF485550755187121723\\n   ST-LINK FW  : V2J45M31\\n   Board Name  : NUCLEO-G071RB\\n' ;;
  *slow-job*)
    printf 'Download in Progress:\\n'
    exec sleep 30 ;;
  *nofail-job*)
    printf 'Error: No STM32 target found!\\n'; exit 1 ;;
  *-d*)
    printf '0x1FFF7590 : 00390029 3A2F5143 91C40000\\nErasing internal memory sectors [0 45]\\nDownload in Progress:\\n'
    printf '[==      ]  25%%\\r[====    ]  50%%\\r[========] 100%%\\n'
    printf 'File download complete\\nVerifying ...\\nRead progress:\\n[========] 100%%\\nDownload verified successfully\\nMCU Reset\\n' ;;
  *-r32*)
    printf 'Voltage     : 3.27V\\nDevice ID   : 0x460\\nDevice name : STM32G071/STM32G081\\nFlash size  : 128 KBytes\\n0x1FFF7590 : 00390029 3A2F5143 91C40000\\n' ;;
esac
`;

type Frame = QaAgentToServerMessage;

let httpServer: Server;
let wss: WebSocketServer;
let baseUrl: string;
let socket: WebSocket | null = null;
const frames: Frame[] = [];
let rejectAuth = false;
let seenAuth: string | undefined;
const waiters: Array<() => void> = [];

function waitFor<T extends Frame["type"]>(
  type: T,
  predicate: (data: Extract<Frame, { type: T }>["data"]) => boolean = () => true,
  timeoutMs = 10_000,
): Promise<Extract<Frame, { type: T }>["data"]> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = (): void => {
      const hit = frames.find((f) => f.type === type && predicate(f.data as never));
      if (hit) return resolve(hit.data as never);
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${type}`));
      waiters.push(check);
      setTimeout(check, 50);
    };
    check();
  });
}

function sendToAgent(type: string, data: unknown): void {
  socket?.send(JSON.stringify({ type, data }));
}

function flashJob(id: string, bytes: Buffer, overrides: Partial<QaAgentJob["firmware"] & object> = {}): QaAgentJob {
  return {
    id,
    kind: "flash",
    probeSerial: null,
    connectMode: "normal",
    firmware: {
      fileName: "fw.bin",
      format: "bin",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
      contentBase64: bytes.toString("base64"),
      address: "0x08000000",
      ...overrides,
    },
  };
}

describe("agent end to end against a fake server and fake CubeProgrammer", () => {
  let agent: Agent;
  let runPromise: Promise<number>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-agent-fake-"));
    const cli = join(dir, "STM32_Programmer_CLI");
    writeFileSync(cli, FAKE_CLI);
    chmodSync(cli, 0o755);
    setProgrammerPath(cli);

    httpServer = createServer();
    wss = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req: IncomingMessage, sock, head) => {
      seenAuth = req.headers.authorization;
      if (rejectAuth || req.url !== "/v1/qa/agent/ws") {
        sock.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
        sock.destroy();
        return;
      }
      wss.handleUpgrade(req, sock, head, (ws) => {
        socket = ws;
        ws.on("message", (raw) => frames.push(JSON.parse(raw.toString()) as Frame));
        ws.send(JSON.stringify({ type: "server.welcome", data: { stationId: "s1", stationName: "Bench 1" } }));
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
    log.setVerbose(false);
    agent = new Agent({ serverUrl: baseUrl, stationId: "s1", stationName: "Bench 1", token: "tok-123" });
    runPromise = agent.run();
  });

  afterAll(async () => {
    agent.stop();
    await runPromise;
    wss.close();
    httpServer.close();
    setProgrammerPath(undefined);
  });

  it("authenticates and reports hello + hardware", async () => {
    const hello = await waitFor("agent.hello");
    expect(seenAuth).toBe("Bearer tok-123");
    expect(hello.programmer).toMatchObject({ found: true, version: "2.23.0" });
    expect(hello.protocolVersion).toBe(1);
    const hw = await waitFor("agent.hardware", (d) => d.probes.length === 1);
    expect(hw.probes[0]).toEqual({ serial: "066DFF485550755187121723", firmware: "V2J45M31", boardName: "NUCLEO-G071RB" });
  });

  it("answers pings and ignores junk", async () => {
    socket?.send("not json");
    sendToAgent("some.future.message", { x: 1 });
    sendToAgent("server.ping", { sentAt: "2026-01-01T00:00:00.000Z" });
    expect(await waitFor("agent.pong")).toEqual({ sentAt: "2026-01-01T00:00:00.000Z" });
  });

  it("identifies a target", async () => {
    sendToAgent("job.start", { job: { id: "job-identify", kind: "identify", probeSerial: null, connectMode: "normal", firmware: null } });
    await waitFor("job.accepted", (d) => d.jobId === "job-identify");
    const result = await waitFor("job.result", (d) => d.jobId === "job-identify");
    expect(result.ok).toBe(true);
    expect(result.result.target).toEqual({
      deviceId: "0x460",
      deviceName: "STM32G071/STM32G081",
      flashSizeKb: 128,
      voltage: "3.27V",
      uid: "003900293A2F514391C40000",
    });
  });

  it("flashes with progress and logs, then deletes the temp file", async () => {
    const bytes = Buffer.from("firmware-bytes");
    sendToAgent("job.start", { job: flashJob("job-flash", bytes) });
    const result = await waitFor("job.result", (d) => d.jobId === "job-flash");
    expect(result.ok).toBe(true);
    expect(result.result.verified).toBe(true);
    expect(result.result.target?.uid).toBe("003900293A2F514391C40000");
    expect(result.result.error).toBeNull();
    const phases = frames.filter((f) => f.type === "job.progress" && f.data.jobId === "job-flash").map((f) => (f as Extract<Frame, { type: "job.progress" }>).data.phase);
    expect(phases[0]).toBe("connecting");
    expect(phases).toContain("programming");
    expect(phases).toContain("verifying");
    expect(phases.at(-1)).toBe("done");
    const logged = frames.filter((f) => f.type === "job.log" && f.data.jobId === "job-flash").flatMap((f) => (f as Extract<Frame, { type: "job.log" }>).data.lines);
    expect(logged).toContain("Download verified successfully");
    expect(existsSync(join(tmpdir(), "stepwhere-qa-agent", "job-flash.bin"))).toBe(false);
  });

  it("refuses to flash on checksum mismatch", async () => {
    const bytes = Buffer.from("abc");
    sendToAgent("job.start", { job: flashJob("job-badsha", bytes, { sha256: "0".repeat(64) }) });
    const result = await waitFor("job.result", (d) => d.jobId === "job-badsha");
    expect(result.ok).toBe(false);
    expect(result.result.error).toMatch(/checksum mismatch/i);
    expect(readdirSync(join(tmpdir(), "stepwhere-qa-agent")).some((f) => f.startsWith("job-badsha"))).toBe(false);
  });

  it("reports the first Error: line", async () => {
    sendToAgent("job.start", { job: flashJob("nofail-job", Buffer.from("zzz")) });
    const result = await waitFor("job.result", (d) => d.jobId === "nofail-job");
    expect(result.ok).toBe(false);
    expect(result.result.error).toBe("No STM32 target found!");
    expect(result.result.exitCode).toBe(1);
  });

  it("rejects a second job while busy and supports cancel", async () => {
    sendToAgent("job.start", { job: flashJob("slow-job", Buffer.from("slow")) });
    await waitFor("job.accepted", (d) => d.jobId === "slow-job");
    sendToAgent("job.start", { job: flashJob("second-job", Buffer.from("two")) });
    const busy = await waitFor("job.result", (d) => d.jobId === "second-job");
    expect(busy.ok).toBe(false);
    expect(busy.result.error).toBe("Agent is busy with another job. Pick an ST-LINK to run jobs side by side.");
    expect(frames.some((f) => f.type === "job.accepted" && f.data.jobId === "second-job")).toBe(false);
    sendToAgent("job.cancel", { jobId: "slow-job" });
    const cancelled = await waitFor("job.result", (d) => d.jobId === "slow-job");
    expect(cancelled.ok).toBe(false);
    expect(cancelled.result.error).toBe("Cancelled from the admin panel.");
  });

  it("errors on serial.open of an unknown port", async () => {
    sendToAgent("serial.open", { path: "/dev/does-not-exist", baudRate: 115200 });
    const err = await waitFor("serial.error", (d) => d.path === "/dev/does-not-exist");
    expect(err.message).toMatch(/no such serial port/i);
  });
});

describe("token rejection", () => {
  it("exits with code 2 when the server answers 401", async () => {
    const server = createServer();
    server.on("upgrade", (_req, sock) => {
      sock.write("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
      sock.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const agent = new Agent({ serverUrl: url, stationId: "s", stationName: "n", token: "bad" });
    const code = await agent.run();
    server.close();
    expect(code).toBe(2);
  });
});
