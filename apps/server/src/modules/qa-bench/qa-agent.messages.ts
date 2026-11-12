import { z } from "zod";
import type { QaAgentToServerMessage } from "@stepwhere/types";

/** Incoming frames above this size are dropped without parsing. */
export const QA_AGENT_MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

const shortText = (max: number) => z.string().max(max);
const nullableText = (max: number) => z.string().max(max).nullable();

const helloSchema = z.object({
  protocolVersion: z.number().int().min(0).max(1000),
  agentVersion: shortText(32),
  hostname: shortText(255),
  platform: shortText(64),
  arch: shortText(32),
  nodeVersion: shortText(32),
  programmer: z.object({
    found: z.boolean(),
    path: nullableText(1024),
    version: nullableText(64),
    error: nullableText(2000),
  }),
});

const hardwareSchema = z.object({
  probes: z.array(z.object({
    serial: shortText(64),
    firmware: nullableText(64),
    boardName: nullableText(128),
  })).max(16),
  ports: z.array(z.object({
    path: shortText(255),
    manufacturer: nullableText(128),
    serialNumber: nullableText(128),
    vendorId: nullableText(16),
    productId: nullableText(16),
    likelyUsbTtl: z.boolean(),
  })).max(64),
  scannedAt: shortText(64),
  probeScanError: nullableText(2000),
});

const jobResultSchema = z.object({
  target: z.object({
    deviceId: nullableText(64),
    deviceName: nullableText(128),
    flashSizeKb: z.number().int().min(0).max(1_000_000).nullable(),
    voltage: nullableText(32),
    uid: nullableText(64),
  }).nullable(),
  verified: z.boolean().nullable(),
  durationMs: z.number().min(0).max(24 * 60 * 60 * 1000),
  exitCode: z.number().int().nullable(),
  error: nullableText(4000),
});

const jobId = z.string().uuid();
const serialPath = z.string().min(1).max(255);

export const qaAgentMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.hello"), data: helloSchema }),
  z.object({ type: z.literal("agent.hardware"), data: hardwareSchema }),
  z.object({ type: z.literal("agent.pong"), data: z.object({ sentAt: shortText(64) }) }),
  z.object({ type: z.literal("job.accepted"), data: z.object({ jobId }) }),
  z.object({
    type: z.literal("job.progress"),
    data: z.object({
      jobId,
      phase: z.enum(["connecting", "erasing", "programming", "verifying", "resetting", "done"]),
      percent: z.number().min(0).max(100).nullable(),
    }),
  }),
  z.object({
    type: z.literal("job.log"),
    data: z.object({ jobId, lines: z.array(z.string().max(4000)).max(500) }),
  }),
  z.object({
    type: z.literal("job.result"),
    data: z.object({ jobId, ok: z.boolean(), result: jobResultSchema }),
  }),
  z.object({
    type: z.literal("serial.opened"),
    data: z.object({ path: serialPath, baudRate: z.number().int().min(1).max(10_000_000) }),
  }),
  z.object({
    type: z.literal("serial.closed"),
    data: z.object({ path: serialPath, reason: nullableText(500) }),
  }),
  z.object({
    type: z.literal("serial.data"),
    data: z.object({
      path: serialPath,
      lines: z.array(z.object({ at: shortText(64), text: z.string().max(4000) })).max(500),
    }),
  }),
  z.object({
    type: z.literal("serial.error"),
    data: z.object({ path: serialPath, message: shortText(1000) }),
  }),
]);

/** Compile-time check that the runtime schema stays assignable to the shared contract. */
type ParsedAgentMessage = z.infer<typeof qaAgentMessageSchema>;
const _contractCheck = (message: ParsedAgentMessage): QaAgentToServerMessage => message;
void _contractCheck;

export function parseAgentMessage(raw: unknown): QaAgentToServerMessage | null {
  if (typeof raw !== "string" || raw.length > QA_AGENT_MAX_MESSAGE_BYTES) {
    return null;
  }

  let json: unknown;

  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = qaAgentMessageSchema.safeParse(json);

  return result.success ? result.data : null;
}
