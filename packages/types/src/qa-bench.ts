/**
 * QA bench: the contract between the bench agent (apps/qa-agent), the server
 * (modules/qa-bench) and the admin Bench screen.
 *
 * The agent runs on a bench PC next to the ST-LINK and the USB-TTL adapter. It
 * opens one outbound WebSocket to the server, so a bench can sit on any network;
 * the admin never talks to the agent directly. Every message on that socket is
 * `{ type, data }`, matching the app realtime events.
 *
 * The agent only performs the operations listed here. It never runs a command
 * line the server sends it: CubeProgrammer arguments are built on the agent from
 * these validated fields.
 */

import type { QaBoardTestVerdictDto, QaTestRunDto } from "./qa-tests";
import type { QaFirmwareChannel } from "./qa-units";

export const QA_AGENT_PROTOCOL_VERSION = 1;

/** Flash base address of the STM32G071 main flash. Used for .bin files. */
export const QA_DEFAULT_FLASH_ADDRESS = "0x08000000";
export const QA_DEFAULT_BAUD_RATE = 115_200;
/** STM32G071 flash is 128 KB; an Intel HEX of it is under 400 KB. */
export const QA_FIRMWARE_MAX_BYTES = 1024 * 1024;

export type QaFirmwareFormat = "bin" | "hex";
/** CubeProgrammer `mode=` values the bench offers. */
export type QaConnectMode = "normal" | "underReset" | "hotPlug";
export type QaBenchJobKind = "identify" | "flash";
export type QaBenchJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type QaFlashPhase = "connecting" | "erasing" | "programming" | "verifying" | "resetting" | "done";

// ---------------------------------------------------------------------------
// Hardware the agent reports
// ---------------------------------------------------------------------------

export type QaProgrammerInfo = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type QaProbe = {
  /** ST-LINK serial number; selects the probe with `sn=`. */
  serial: string;
  firmware: string | null;
  boardName: string | null;
};

export type QaSerialPortInfo = {
  path: string;
  manufacturer: string | null;
  serialNumber: string | null;
  vendorId: string | null;
  productId: string | null;
  /** True for adapters that look like USB-TTL bridges (CP210x, CH340, FTDI, PL2303, ST-LINK VCP). */
  likelyUsbTtl: boolean;
};

export type QaHardwareSnapshot = {
  probes: QaProbe[];
  ports: QaSerialPortInfo[];
  scannedAt: string;
  probeScanError: string | null;
};

export type QaTargetInfo = {
  deviceId: string | null;
  deviceName: string | null;
  flashSizeKb: number | null;
  voltage: string | null;
  /** 96-bit unique ID as 24 hex characters, read from UID_BASE (0x1FFF7590 on G0). */
  uid: string | null;
};

export type QaJobResult = {
  target: QaTargetInfo | null;
  verified: boolean | null;
  durationMs: number;
  exitCode: number | null;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Agent <-> server WebSocket messages
// ---------------------------------------------------------------------------

export type QaAgentHello = {
  protocolVersion: number;
  agentVersion: string;
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  programmer: QaProgrammerInfo;
};

export type QaSerialLine = {
  /** ISO time the agent received the line. */
  at: string;
  text: string;
};

export type QaFlashJobPayload = {
  fileName: string;
  format: QaFirmwareFormat;
  sha256: string;
  sizeBytes: number;
  contentBase64: string;
  /** Required for .bin, ignored for .hex. */
  address: string;
};

export type QaAgentJob = {
  id: string;
  kind: QaBenchJobKind;
  probeSerial: string | null;
  connectMode: QaConnectMode;
  /** Present when kind is "flash". */
  firmware: QaFlashJobPayload | null;
};

export type QaAgentToServerMessage =
  | { type: "agent.hello"; data: QaAgentHello }
  | { type: "agent.hardware"; data: QaHardwareSnapshot }
  | { type: "agent.pong"; data: { sentAt: string } }
  | { type: "job.accepted"; data: { jobId: string } }
  | { type: "job.progress"; data: { jobId: string; phase: QaFlashPhase; percent: number | null } }
  | { type: "job.log"; data: { jobId: string; lines: string[] } }
  | { type: "job.result"; data: { jobId: string; ok: boolean; result: QaJobResult } }
  | { type: "serial.opened"; data: { path: string; baudRate: number } }
  | { type: "serial.closed"; data: { path: string; reason: string | null } }
  | { type: "serial.data"; data: { path: string; lines: QaSerialLine[] } }
  | { type: "serial.error"; data: { path: string; message: string } };

export type QaServerToAgentMessage =
  | { type: "server.welcome"; data: { stationId: string; stationName: string } }
  | { type: "server.ping"; data: { sentAt: string } }
  | { type: "hardware.scan"; data: Record<string, never> }
  | { type: "job.start"; data: { job: QaAgentJob } }
  | { type: "job.cancel"; data: { jobId: string } }
  | { type: "serial.open"; data: { path: string; baudRate: number } }
  | { type: "serial.close"; data: { path: string } }
  | { type: "serial.write"; data: { path: string; data: string } };

// ---------------------------------------------------------------------------
// Admin REST DTOs
// ---------------------------------------------------------------------------

export type QaStationConnection = "online" | "offline" | "never_paired";

export type QaSerialSessionDto = {
  path: string;
  baudRate: number;
  openedAt: string;
};

export type QaStationDto = {
  id: string;
  name: string;
  connection: QaStationConnection;
  pairedAt: string | null;
  lastSeenAt: string | null;
  agent: QaAgentHello | null;
  hardware: QaHardwareSnapshot | null;
  serialSessions: QaSerialSessionDto[];
  /** The first active job; kept for the single-board Bench view. */
  activeJobId: string | null;
  /** Every queued or running job. Jobs on different ST-LINKs run side by side. */
  activeJobIds: string[];
  /** Bench automation: boards are identified, flashed, tested, retried and given production firmware without clicks. */
  automationEnabled: boolean;
  createdAt: string;
};

export type UpdateQaStationAutomationInput = {
  enabled: boolean;
};

/** Something on the bench that a person should look at, pushed to every open admin. */
export type QaAttentionDto = {
  stationId: string;
  unitId: string | null;
  slotId: string | null;
  slotLabel: string | null;
  level: "error" | "warning" | "success";
  title: string;
  message: string;
};

export type QaStationPairingDto = {
  station: QaStationDto;
  /** Shown once. Format XXXX-XXXX. */
  pairingCode: string;
  pairingExpiresAt: string;
  /** API base the agent should call, e.g. https://api.stepwhere.in */
  serverUrl: string;
  /** Where bench PCs can download the agent tarball, when this server hosts one. */
  agentDownloadUrl: string | null;
};

export type QaFirmwareUploadDto = {
  id: string;
  fileName: string;
  format: QaFirmwareFormat;
  /** QA firmware runs the board tests; production firmware ships. */
  channel: QaFirmwareChannel;
  /** e.g. v1.2. Null when the uploader left it blank. */
  version: string | null;
  sizeBytes: number;
  sha256: string;
  uploadedByName: string | null;
  createdAt: string;
};

export type QaBenchJobDto = {
  id: string;
  stationId: string;
  kind: QaBenchJobKind;
  status: QaBenchJobStatus;
  probeSerial: string | null;
  connectMode: QaConnectMode;
  firmware: QaFirmwareUploadDto | null;
  address: string | null;
  phase: QaFlashPhase | null;
  percent: number | null;
  result: QaJobResult | null;
  /** The QA unit this job identified, once the chip UID is known. */
  unitId: string | null;
  /** The bench slot the job was started from, if any. */
  slotId: string | null;
  requestedByName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type QaBenchJobLogDto = {
  jobId: string;
  lines: string[];
  truncated: boolean;
};

export type QaSerialBufferDto = {
  stationId: string;
  path: string;
  lines: QaSerialLine[];
};

export type CreateQaStationInput = { name: string };

export type CreateQaFirmwareUploadInput = {
  fileName: string;
  contentBase64: string;
  channel: QaFirmwareChannel;
  version?: string | null;
};

export type CreateQaBenchJobInput =
  | { kind: "identify"; probeSerial: string | null; connectMode: QaConnectMode; slotId?: string | null }
  | {
    kind: "flash";
    probeSerial: string | null;
    connectMode: QaConnectMode;
    slotId?: string | null;
    firmwareId: string;
    /** Defaults to QA_DEFAULT_FLASH_ADDRESS. Ignored for .hex. */
    address?: string;
  };

export type QaSerialOpenInput = { path: string; baudRate: number };
export type QaSerialCloseInput = { path: string };
export type QaSerialWriteInput = { path: string; data: string };

export type QaAgentPairInput = {
  code: string;
  hostname: string;
  platform: string;
  agentVersion: string;
};

export type QaAgentPairResult = {
  stationId: string;
  stationName: string;
  /** Long-lived station token. The agent stores it; the server keeps only a hash. */
  token: string;
};

// ---------------------------------------------------------------------------
// Slots: many boards on one bench
// ---------------------------------------------------------------------------
//
// A slot is one place on the bench where a board sits: its USB-TTL adapter and
// the ST-LINK that flashes it. Several slots may share one ST-LINK that the
// operator moves between boards. Test results never depend on the slot: every
// TTL line carries the board's chip UID. Slots only tell the operator where a
// board physically is.

export const QA_MAX_SLOTS = 48;

/** A TTL adapter the agent sees, keyed so a slot survives the adapter moving to a new path. */
export type QaBenchPortDto = {
  /** "usb:<vid>:<pid>:<serial>" when the adapter has a USB serial number, else "path:<path>". */
  key: string;
  path: string;
  manufacturer: string | null;
  serialNumber: string | null;
  likelyUsbTtl: boolean;
  open: boolean;
  /** When the agent last forwarded a line from this port, while the server has been up. */
  lastLineAt: string | null;
  slotId: string | null;
};

export type QaSlotUnitDto = {
  id: string;
  chipUid: string;
  imei: string | null;
  deviceId: string | null;
};

export type QaSlotDto = {
  id: string;
  stationId: string;
  position: number;
  /** "Slot 3" unless renamed. */
  label: string;
  portKey: string;
  /** Where the adapter is right now; null while it is unplugged. */
  portPath: string | null;
  portOpen: boolean;
  /** False when the adapter has no USB serial number, so the slot follows its path instead. */
  portStable: boolean;
  probeSerial: string | null;
  probePresent: boolean;
  /** Another slot uses the same ST-LINK, so it is moved by hand and flashing is one slot at a time. */
  probeShared: boolean;
  lastLineAt: string | null;
  /** The queued or running job started from this slot. */
  activeJob: QaBenchJobDto | null;
  /** The latest board test run read from this slot's port. */
  run: QaTestRunDto | null;
  verdict: QaBoardTestVerdictDto | null;
  unit: QaSlotUnitDto | null;
};

export type QaStationSlotsDto = {
  stationId: string;
  slots: QaSlotDto[];
  ports: QaBenchPortDto[];
};

export type QaSlotConfigInput = {
  position: number;
  label?: string | null;
  portKey: string;
  probeSerial: string | null;
};

/** Replaces the station's slots. Slots missing from the list are removed; their history is kept. */
export type UpdateQaStationSlotsInput = { slots: QaSlotConfigInput[] };
