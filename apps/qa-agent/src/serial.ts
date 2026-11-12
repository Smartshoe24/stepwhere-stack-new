import { SerialPort } from "serialport";
import { platform } from "node:os";
import type { QaAgentToServerMessage, QaSerialLine, QaSerialPortInfo } from "@stepwhere/types";
import * as log from "./log.js";

// ---------------------------------------------------------------------------
// Port listing
// ---------------------------------------------------------------------------

/** CP210x, CH340/CH341, FTDI, Prolific PL2303, ST-LINK virtual COM port. */
const USB_TTL_VENDOR_IDS = new Set(["10C4", "1A86", "0403", "067B", "0483"]);

type RawPort = {
  path: string;
  manufacturer?: string | undefined;
  serialNumber?: string | undefined;
  vendorId?: string | undefined;
  productId?: string | undefined;
};

export function toPortInfo(raw: RawPort): QaSerialPortInfo {
  const vendorId = raw.vendorId ? raw.vendorId.toUpperCase() : null;
  return {
    path: raw.path,
    manufacturer: raw.manufacturer || null,
    serialNumber: raw.serialNumber || null,
    vendorId,
    productId: raw.productId ? raw.productId.toUpperCase() : null,
    likelyUsbTtl: vendorId !== null && USB_TTL_VENDOR_IDS.has(vendorId),
  };
}

/** Likely USB-TTL adapters first, then alphabetical. On macOS `/dev/tty.X` is hidden when `/dev/cu.X` exists. */
export function normalizePorts(raw: RawPort[], os: NodeJS.Platform = platform()): QaSerialPortInfo[] {
  const paths = new Set(raw.map((port) => port.path));
  return raw
    .filter((port) => !(os === "darwin" && port.path.startsWith("/dev/tty.") && paths.has(port.path.replace("/dev/tty.", "/dev/cu."))))
    .map(toPortInfo)
    .sort((a, b) => Number(b.likelyUsbTtl) - Number(a.likelyUsbTtl) || a.path.localeCompare(b.path));
}

export async function listPorts(): Promise<QaSerialPortInfo[]> {
  return normalizePorts(await SerialPort.list());
}

// ---------------------------------------------------------------------------
// Line splitting
// ---------------------------------------------------------------------------

export const SERIAL_PARTIAL_FLUSH_MS = 300;
export const SERIAL_MAX_LINE_CHARS = 2000;

/**
 * Splits device output into lines on CRLF, LF or a lone CR. Control characters (except tab) are
 * stripped, empty lines dropped, lines longer than `maxLineChars` are split, and a trailing
 * partial line (a prompt without newline) is flushed after `flushDelayMs` of silence.
 */
export function createSerialLineSplitter(options: {
  onLine: (line: QaSerialLine) => void;
  flushDelayMs?: number;
  maxLineChars?: number;
  now?: () => Date;
}): { push: (bytes: Uint8Array) => void; dispose: () => void } {
  const flushDelayMs = options.flushDelayMs ?? SERIAL_PARTIAL_FLUSH_MS;
  const maxLineChars = options.maxLineChars ?? SERIAL_MAX_LINE_CHARS;
  const now = options.now ?? (() => new Date());
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let skipLf = false;
  let timer: NodeJS.Timeout | undefined;

  const emit = (): void => {
    const text = buffer;
    buffer = "";
    if (text.length > 0) options.onLine({ at: now().toISOString(), text });
  };
  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  return {
    push(bytes) {
      const text = decoder.decode(bytes, { stream: true });
      for (const ch of text) {
        if (skipLf) {
          skipLf = false;
          if (ch === "\n") continue;
        }
        if (ch === "\r") {
          emit();
          skipLf = true;
        } else if (ch === "\n") {
          emit();
        } else {
          const code = ch.codePointAt(0) ?? 0;
          if (ch === "\t" || (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f))) {
            buffer += ch;
            if (buffer.length >= maxLineChars) emit();
          }
        }
      }
      clearTimer();
      if (buffer.length > 0) {
        timer = setTimeout(() => {
          timer = undefined;
          emit();
        }, flushDelayMs);
      }
    },
    dispose() {
      clearTimer();
      emit();
    },
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const BATCH_INTERVAL_MS = 100;
const BATCH_MAX_LINES = 200;
export const SERIAL_WRITE_MAX_CHARS = 512;

type Session = {
  port: SerialPort;
  baudRate: number;
  splitter: ReturnType<typeof createSerialLineSplitter>;
  batch: QaSerialLine[];
  batchTimer: NodeJS.Timeout | undefined;
  closing: boolean;
};

type Send = (message: QaAgentToServerMessage) => void;

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/lock|busy|EACCES|Access denied|Permission denied|EBUSY/i.test(message)) {
    return `${message} (is another serial monitor using this port, or are you missing permission? On Linux add your user to the dialout group.)`;
  }
  return message;
}

export class SerialManager {
  private readonly sessions = new Map<string, Session>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly send: Send) {}

  openPaths(): string[] {
    return [...this.sessions.keys()];
  }

  open(path: string, baudRate: number): Promise<void> {
    return this.enqueue(path, () => this.doOpen(path, baudRate));
  }

  close(path: string): Promise<void> {
    return this.enqueue(path, async () => {
      const session = this.sessions.get(path);
      if (!session) {
        this.send({ type: "serial.closed", data: { path, reason: null } });
        return;
      }
      await this.shutdown(path, session, null);
    });
  }

  write(path: string, data: string): void {
    const session = this.sessions.get(path);
    if (!session || session.closing) {
      this.send({ type: "serial.error", data: { path, message: "Port is not open." } });
      return;
    }
    if (typeof data !== "string" || data.length > SERIAL_WRITE_MAX_CHARS) {
      this.send({ type: "serial.error", data: { path, message: `Write rejected: limit is ${SERIAL_WRITE_MAX_CHARS} characters.` } });
      return;
    }
    session.port.write(data, (error) => {
      if (error) this.send({ type: "serial.error", data: { path, message: describeError(error) } });
    });
  }

  /** Closes every open port without notifying the server (used on shutdown). */
  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.entries()].map(async ([path, session]) => {
        session.closing = true;
        session.splitter.dispose();
        if (session.batchTimer) clearTimeout(session.batchTimer);
        await closePort(session.port);
        this.sessions.delete(path);
      }),
    );
  }

  private enqueue(path: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.then(task).catch((error) => {
      this.send({ type: "serial.error", data: { path, message: describeError(error) } });
    });
    this.queues.set(path, next);
    void next.finally(() => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    });
    return next;
  }

  private async doOpen(path: string, baudRate: number): Promise<void> {
    if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 4_000_000) {
      this.send({ type: "serial.error", data: { path, message: `Invalid baud rate ${String(baudRate)}.` } });
      return;
    }
    const existing = this.sessions.get(path);
    if (existing && !existing.closing) {
      if (existing.baudRate === baudRate) {
        this.send({ type: "serial.opened", data: { path, baudRate } });
        return;
      }
      await this.shutdown(path, existing, null, false);
    }

    // Only open ports the OS reports; the path comes from the server.
    const known = (await SerialPort.list()).some((p) =>
      platform() === "win32" ? p.path.toLowerCase() === path.toLowerCase() : p.path === path,
    );
    if (!known) {
      this.send({ type: "serial.error", data: { path, message: "No such serial port on this station." } });
      return;
    }

    const port = new SerialPort({ path, baudRate, dataBits: 8, stopBits: 1, parity: "none", autoOpen: false });
    const session: Session = {
      port,
      baudRate,
      batch: [],
      batchTimer: undefined,
      closing: false,
      splitter: createSerialLineSplitter({ onLine: (line) => this.enqueueLine(path, line) }),
    };

    await new Promise<void>((resolve, reject) => {
      port.open((error) => (error ? reject(error) : resolve()));
    });
    this.sessions.set(path, session);

    port.on("data", (chunk: Buffer) => session.splitter.push(chunk));
    port.on("error", (error) => {
      this.send({ type: "serial.error", data: { path, message: describeError(error) } });
    });
    port.on("close", (error?: Error | null) => {
      if (session.closing || this.sessions.get(path) !== session) return;
      session.closing = true;
      session.splitter.dispose();
      this.flushBatch(path, session);
      this.sessions.delete(path);
      const reason = error?.message ?? "Port closed unexpectedly (adapter unplugged?).";
      log.info(`Serial port ${path} closed: ${reason}`);
      this.send({ type: "serial.closed", data: { path, reason } });
    });

    log.info(`Serial port ${path} opened at ${baudRate} baud`);
    this.send({ type: "serial.opened", data: { path, baudRate } });
  }

  private async shutdown(path: string, session: Session, reason: string | null, notify = true): Promise<void> {
    session.closing = true;
    session.splitter.dispose();
    this.flushBatch(path, session);
    await closePort(session.port);
    this.sessions.delete(path);
    log.info(`Serial port ${path} closed`);
    if (notify) this.send({ type: "serial.closed", data: { path, reason } });
  }

  private enqueueLine(path: string, line: QaSerialLine): void {
    const session = this.sessions.get(path);
    if (!session) return;
    session.batch.push(line);
    if (session.batch.length >= BATCH_MAX_LINES) {
      this.flushBatch(path, session);
    } else if (!session.batchTimer) {
      session.batchTimer = setTimeout(() => this.flushBatch(path, session), BATCH_INTERVAL_MS);
    }
  }

  private flushBatch(path: string, session: Session): void {
    if (session.batchTimer) clearTimeout(session.batchTimer);
    session.batchTimer = undefined;
    if (session.batch.length === 0) return;
    const lines = session.batch;
    session.batch = [];
    this.send({ type: "serial.data", data: { path, lines } });
  }
}

function closePort(port: SerialPort): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!port.isOpen) return resolve();
    const timer = setTimeout(resolve, 2000);
    port.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
