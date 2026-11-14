import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { QA_DEFAULT_FLASH_ADDRESS } from "@stepwhere/types";
import type {
  CreateQaBenchJobInput,
  CreateQaFirmwareUploadInput,
  QaAgentHello,
  QaAgentJob,
  QaAgentPairInput,
  QaAgentPairResult,
  QaBenchJobDto,
  QaBenchJobLogDto,
  QaFirmwareChannel,
  QaFirmwareUploadDto,
  QaFlashPhase,
  QaJobResult,
  QaSerialBufferDto,
  QaStationDto,
  QaStationPairingDto,
} from "@stepwhere/types";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { qaBenchJobs, qaFirmwareUploads, qaStationSlots, qaStations, users } from "../../db/schema";
import { conflict, notFound } from "../../shared/errors";
import { generateOpaqueToken, sha256 } from "../../shared/crypto";
import {
  PAIRING_CODE_TTL_MS,
  describeProbeConflict,
  generatePairingCode,
  isUniqueViolation,
  normalizePairingCode,
  splitLogLines,
  validateFirmwareUpload,
} from "./qa-bench.helpers";
import { flushJobLog } from "./qa-bench.job-runtime";
import { broadcastJobChanged, broadcastStationChanged } from "./qa-bench.realtime";
import { qaBenchRegistry } from "./qa-bench.registry";

type StationRow = typeof qaStations.$inferSelect;

const ACTIVE_JOB_STATUSES = ["queued", "running"] as const;

export const QA_DISCONNECT_CODE_REVOKED = 4001;
export const QA_DISCONNECT_CODE_REPAIR = 4002;

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

function toStationDto(row: StationRow, activeJobIds: string[]): QaStationDto {
  const live = qaBenchRegistry.get(row.id);
  const connection = live ? "online" : row.pairedAt ? "offline" : "never_paired";

  return {
    id: row.id,
    name: row.name,
    connection,
    pairedAt: row.pairedAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    agent: live?.hello ?? row.agentInfo ?? null,
    hardware: live?.hardware ?? null,
    serialSessions: live
      ? [...live.serialSessions.entries()].map(([path, session]) => ({
        path,
        baudRate: session.baudRate,
        openedAt: session.openedAt,
      }))
      : [],
    activeJobId: activeJobIds[0] ?? null,
    activeJobIds,
    automationEnabled: row.automationEnabled,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadActiveJobIds(stationIds: string[]) {
  const byStation = new Map<string, string[]>();

  if (stationIds.length === 0) {
    return byStation;
  }

  const rows = await db
    .select({ id: qaBenchJobs.id, stationId: qaBenchJobs.stationId })
    .from(qaBenchJobs)
    .where(and(
      inArray(qaBenchJobs.stationId, stationIds),
      inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES]),
    ))
    .orderBy(asc(qaBenchJobs.createdAt));

  for (const row of rows) {
    byStation.set(row.stationId, [...(byStation.get(row.stationId) ?? []), row.id]);
  }

  return byStation;
}

async function findStationRow(stationId: string) {
  const [row] = await db
    .select()
    .from(qaStations)
    .where(and(eq(qaStations.id, stationId), isNull(qaStations.revokedAt)))
    .limit(1);

  return row ?? null;
}

export async function requireStationRow(stationId: string) {
  const row = await findStationRow(stationId);

  if (!row) {
    throw notFound("NOT_FOUND", "Station not found.");
  }

  return row;
}

export async function getStationDto(stationId: string) {
  const row = await requireStationRow(stationId);
  const active = await loadActiveJobIds([row.id]);

  return toStationDto(row, active.get(row.id) ?? []);
}

export async function listStations(): Promise<QaStationDto[]> {
  const rows = await db
    .select()
    .from(qaStations)
    .where(isNull(qaStations.revokedAt))
    .orderBy(asc(qaStations.createdAt));
  const active = await loadActiveJobIds(rows.map((row) => row.id));

  return rows.map((row) => toStationDto(row, active.get(row.id) ?? []));
}

export function resolveAgentServerUrl() {
  return (env.QA_AGENT_SERVER_URL ?? new URL(env.BETTER_AUTH_URL).origin).replace(/\/+$/, "");
}

function issuePairingCode() {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  return {
    display: code.display,
    expiresAt,
    update: {
      pairingCodeHash: sha256(code.normalized),
      pairingExpiresAt: expiresAt,
    },
  };
}

export async function createStation(name: string, userId: string): Promise<QaStationPairingDto> {
  const pairing = issuePairingCode();
  const [row] = await db
    .insert(qaStations)
    .values({ name, createdByUserId: userId, ...pairing.update })
    .returning();

  broadcastStationChanged(row.id, "created");

  return {
    station: toStationDto(row, []),
    pairingCode: pairing.display,
    pairingExpiresAt: pairing.expiresAt.toISOString(),
    serverUrl: resolveAgentServerUrl(),
    agentDownloadUrl: env.QA_AGENT_DOWNLOAD_URL ?? null,
  };
}

/** Turns bench automation on or off for one station. */
export async function setStationAutomation(stationId: string, enabled: boolean) {
  const [row] = await db
    .update(qaStations)
    .set({ automationEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(qaStations.id, stationId), isNull(qaStations.revokedAt)))
    .returning();

  if (!row) {
    throw notFound("NOT_FOUND", "Station not found.");
  }

  broadcastStationChanged(row.id, "automation");

  return getStationDto(row.id);
}

export async function renameStation(stationId: string, name: string) {
  const [row] = await db
    .update(qaStations)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(qaStations.id, stationId), isNull(qaStations.revokedAt)))
    .returning();

  if (!row) {
    throw notFound("NOT_FOUND", "Station not found.");
  }

  const live = qaBenchRegistry.get(row.id);

  if (live) {
    live.stationName = row.name;
  }

  broadcastStationChanged(row.id, "renamed");

  return getStationDto(row.id);
}

/** New pairing code; invalidates the current agent token so the agent must pair again. */
export async function regeneratePairingCode(stationId: string): Promise<QaStationPairingDto> {
  await requireStationRow(stationId);

  const pairing = issuePairingCode();
  const [row] = await db
    .update(qaStations)
    .set({ ...pairing.update, tokenHash: null, pairedAt: null, updatedAt: new Date() })
    .where(and(eq(qaStations.id, stationId), isNull(qaStations.revokedAt)))
    .returning();

  if (!row) {
    throw notFound("NOT_FOUND", "Station not found.");
  }

  await disconnectStation(row.id, QA_DISCONNECT_CODE_REPAIR, "Station must pair again", "pairing_code");

  return {
    station: await getStationDto(row.id),
    pairingCode: pairing.display,
    pairingExpiresAt: pairing.expiresAt.toISOString(),
    serverUrl: resolveAgentServerUrl(),
    agentDownloadUrl: env.QA_AGENT_DOWNLOAD_URL ?? null,
  };
}

export async function revokeStation(stationId: string) {
  const [row] = await db
    .update(qaStations)
    .set({
      revokedAt: new Date(),
      tokenHash: null,
      pairingCodeHash: null,
      pairingExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(qaStations.id, stationId), isNull(qaStations.revokedAt)))
    .returning({ id: qaStations.id });

  if (!row) {
    throw notFound("NOT_FOUND", "Station not found.");
  }

  await disconnectStation(row.id, QA_DISCONNECT_CODE_REVOKED, "Station revoked", "revoked");
  qaBenchRegistry.clearSerialBuffers(row.id);

  return { revoked: true as const };
}

/**
 * Closes the station's live agent connection (if any) and runs the same
 * cleanup as a socket close, since the registry entry is removed up front.
 */
export async function disconnectStation(stationId: string, code: number, reason: string, broadcastReason: string) {
  const hadConnection = qaBenchRegistry.disconnect(stationId, code, reason);

  if (hadConnection) {
    await handleStationDisconnected(stationId);
  }

  broadcastStationChanged(stationId, broadcastReason);
}

/** Cleanup after an agent connection ends. Idempotent. */
export async function handleStationDisconnected(stationId: string) {
  await failActiveJobs(stationId, "Agent disconnected before the job finished.");
  qaBenchRegistry.clearSerialBuffers(stationId);

  await db
    .update(qaStations)
    .set({ lastSeenAt: new Date() })
    .where(eq(qaStations.id, stationId));
}

export async function pairAgent(input: QaAgentPairInput): Promise<{ result: QaAgentPairResult; stationId: string } | null> {
  const token = generateOpaqueToken(32);
  const now = new Date();
  const [row] = await db
    .update(qaStations)
    .set({
      tokenHash: sha256(token),
      pairingCodeHash: null,
      pairingExpiresAt: null,
      pairedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(qaStations.pairingCodeHash, sha256(normalizePairingCode(input.code))),
      isNull(qaStations.revokedAt),
      gt(qaStations.pairingExpiresAt, now),
    ))
    .returning({ id: qaStations.id, name: qaStations.name });

  if (!row) {
    return null;
  }

  // A previous agent may still be connected under the old token.
  await disconnectStation(row.id, QA_DISCONNECT_CODE_REPAIR, "Station paired again", "paired");

  return { stationId: row.id, result: { stationId: row.id, stationName: row.name, token } };
}

export async function authenticateAgentToken(token: string) {
  const [row] = await db
    .select({ id: qaStations.id, name: qaStations.name })
    .from(qaStations)
    .where(and(eq(qaStations.tokenHash, sha256(token)), isNull(qaStations.revokedAt)))
    .limit(1);

  return row ?? null;
}

export async function recordAgentHello(stationId: string, hello: QaAgentHello) {
  await db
    .update(qaStations)
    .set({ agentInfo: hello, lastSeenAt: new Date() })
    .where(eq(qaStations.id, stationId));
}

export async function touchStationLastSeen(stationId: string) {
  await db
    .update(qaStations)
    .set({ lastSeenAt: new Date() })
    .where(eq(qaStations.id, stationId));
}

// ---------------------------------------------------------------------------
// Firmware
// ---------------------------------------------------------------------------

const uploader = alias(users, "qa_uploader");
const requester = alias(users, "qa_requester");

const firmwareColumns = {
  id: qaFirmwareUploads.id,
  fileName: qaFirmwareUploads.fileName,
  format: qaFirmwareUploads.format,
  channel: qaFirmwareUploads.channel,
  version: qaFirmwareUploads.version,
  sizeBytes: qaFirmwareUploads.sizeBytes,
  sha256: qaFirmwareUploads.sha256,
  createdAt: qaFirmwareUploads.createdAt,
  uploadedByName: uploader.name,
};

type FirmwareRow = {
  id: string;
  fileName: string;
  format: "bin" | "hex";
  channel: QaFirmwareChannel;
  version: string | null;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  uploadedByName: string | null;
};

function toFirmwareDto(row: FirmwareRow): QaFirmwareUploadDto {
  return {
    id: row.id,
    fileName: row.fileName,
    format: row.format,
    channel: row.channel,
    version: row.version,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    uploadedByName: row.uploadedByName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadFirmwareDto(firmwareId: string) {
  const [row] = await db
    .select(firmwareColumns)
    .from(qaFirmwareUploads)
    .leftJoin(uploader, eq(uploader.id, qaFirmwareUploads.uploadedByUserId))
    .where(eq(qaFirmwareUploads.id, firmwareId))
    .limit(1);

  return row ? toFirmwareDto(row) : null;
}

export async function listFirmwareUploads(limit: number) {
  const rows = await db
    .select(firmwareColumns)
    .from(qaFirmwareUploads)
    .leftJoin(uploader, eq(uploader.id, qaFirmwareUploads.uploadedByUserId))
    .orderBy(desc(qaFirmwareUploads.createdAt))
    .limit(limit);

  return rows.map(toFirmwareDto);
}

/**
 * Firmware from CI: the same upload, without a user, and skipped when the same
 * image (same SHA-256 and channel) is already on the bench.
 */
export async function createCiFirmwareUpload(input: CreateQaFirmwareUploadInput) {
  const firmware = validateFirmwareUpload(input);
  const [existing] = await db
    .select({ id: qaFirmwareUploads.id })
    .from(qaFirmwareUploads)
    .where(and(eq(qaFirmwareUploads.sha256, firmware.sha256), eq(qaFirmwareUploads.channel, input.channel)))
    .orderBy(desc(qaFirmwareUploads.createdAt))
    .limit(1);

  if (existing) {
    const dto = await loadFirmwareDto(existing.id);

    if (dto) {
      return { created: false, firmware: dto };
    }
  }

  return { created: true, firmware: await createFirmwareUpload(input, null) };
}

/** `userId` is null for uploads from CI. */
export async function createFirmwareUpload(input: CreateQaFirmwareUploadInput, userId: string | null) {
  const firmware = validateFirmwareUpload(input);
  const [row] = await db
    .insert(qaFirmwareUploads)
    .values({
      fileName: firmware.fileName,
      format: firmware.format,
      channel: input.channel,
      version: input.version?.trim() || null,
      sizeBytes: firmware.sizeBytes,
      sha256: firmware.sha256,
      content: firmware.bytes,
      uploadedByUserId: userId,
    })
    .returning({ id: qaFirmwareUploads.id });
  const [dto] = await db
    .select(firmwareColumns)
    .from(qaFirmwareUploads)
    .leftJoin(uploader, eq(uploader.id, qaFirmwareUploads.uploadedByUserId))
    .where(eq(qaFirmwareUploads.id, row.id));

  return toFirmwareDto(dto);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const jobColumns = {
  job: qaBenchJobs,
  firmware: {
    id: qaFirmwareUploads.id,
    fileName: qaFirmwareUploads.fileName,
    format: qaFirmwareUploads.format,
    channel: qaFirmwareUploads.channel,
    version: qaFirmwareUploads.version,
    sizeBytes: qaFirmwareUploads.sizeBytes,
    sha256: qaFirmwareUploads.sha256,
    createdAt: qaFirmwareUploads.createdAt,
    uploadedByName: uploader.name,
  },
  requestedByName: requester.name,
};

type JobRow = typeof qaBenchJobs.$inferSelect;

function toJobDto(
  job: JobRow,
  firmware: { [K in keyof FirmwareRow]: FirmwareRow[K] | null } | null,
  requestedByName: string | null,
): QaBenchJobDto {
  return {
    id: job.id,
    stationId: job.stationId,
    kind: job.kind,
    status: job.status,
    probeSerial: job.probeSerial,
    connectMode: job.connectMode,
    firmware: firmware?.id ? toFirmwareDto(firmware as FirmwareRow) : null,
    address: job.address,
    phase: (job.phase as QaFlashPhase | null) ?? null,
    percent: job.percent,
    result: job.result ?? null,
    unitId: job.unitId,
    slotId: job.slotId,
    requestedByName,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function selectJobs() {
  return db
    .select(jobColumns)
    .from(qaBenchJobs)
    .leftJoin(qaFirmwareUploads, eq(qaFirmwareUploads.id, qaBenchJobs.firmwareUploadId))
    .leftJoin(uploader, eq(uploader.id, qaFirmwareUploads.uploadedByUserId))
    .leftJoin(requester, eq(requester.id, qaBenchJobs.requestedByUserId));
}

export async function loadJobDto(jobId: string): Promise<QaBenchJobDto | null> {
  const [row] = await selectJobs().where(eq(qaBenchJobs.id, jobId)).limit(1);

  return row ? toJobDto(row.job, row.firmware, row.requestedByName) : null;
}

/** Active jobs of a station with the progress the agent reported last (only phase changes are stored). */
export async function listActiveJobs(stationId: string) {
  const rows = await selectJobs()
    .where(and(eq(qaBenchJobs.stationId, stationId), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])))
    .orderBy(asc(qaBenchJobs.createdAt));

  return rows.map((row) => {
    const dto = toJobDto(row.job, row.firmware, row.requestedByName);
    const runtime = qaBenchRegistry.getJob(dto.id);

    return runtime
      ? { ...dto, phase: (runtime.phase as QaFlashPhase | null) ?? dto.phase, percent: runtime.percent ?? dto.percent }
      : dto;
  });
}

export async function requireJobDto(jobId: string) {
  const dto = await loadJobDto(jobId);

  if (!dto) {
    throw notFound("NOT_FOUND", "Job not found.");
  }

  return dto;
}

/** The job if it belongs to `stationId` and is still queued or running, with its stored log state. */
export async function findActiveJobForStation(stationId: string, jobId: string) {
  const dto = await loadJobDto(jobId);

  if (!dto || dto.stationId !== stationId || (dto.status !== "queued" && dto.status !== "running")) {
    return null;
  }

  const [logRow] = await db
    .select({ log: qaBenchJobs.log, truncated: qaBenchJobs.logTruncated })
    .from(qaBenchJobs)
    .where(eq(qaBenchJobs.id, jobId))
    .limit(1);

  return { dto, log: logRow?.log ?? "", truncated: logRow?.truncated ?? false };
}

/** Moves a queued job to running. Returns the fresh DTO, or null if it was not queued. */
export async function markJobRunning(jobId: string) {
  const [row] = await db
    .update(qaBenchJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(qaBenchJobs.id, jobId), eq(qaBenchJobs.status, "queued")))
    .returning({ id: qaBenchJobs.id });

  return row ? loadJobDto(jobId) : null;
}

export async function persistJobPhase(jobId: string, phase: QaFlashPhase, percent: number | null) {
  await db
    .update(qaBenchJobs)
    .set({ phase, percent })
    .where(eq(qaBenchJobs.id, jobId));
}

/** Writes the terminal state of a job reported by the agent. Returns the fresh DTO, or null if already terminal. */
export async function completeJob(
  jobId: string,
  outcome: { status: "succeeded" | "failed" | "cancelled"; result: QaJobResult; phase: QaFlashPhase | null; percent: number | null },
) {
  const [row] = await db
    .update(qaBenchJobs)
    .set({
      status: outcome.status,
      result: outcome.result,
      finishedAt: new Date(),
      ...(outcome.phase ? { phase: outcome.phase } : {}),
      ...(outcome.percent !== null ? { percent: outcome.percent } : {}),
    })
    .where(and(eq(qaBenchJobs.id, jobId), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])))
    .returning({ id: qaBenchJobs.id });

  return row ? loadJobDto(jobId) : null;
}

export async function listJobs(stationId: string, limit: number) {
  await requireStationRow(stationId);

  const rows = await selectJobs()
    .where(eq(qaBenchJobs.stationId, stationId))
    .orderBy(desc(qaBenchJobs.createdAt))
    .limit(limit);

  return rows.map((row) => toJobDto(row.job, row.firmware, row.requestedByName));
}

export async function listJobsForUnit(unitId: string, limit: number) {
  const rows = await selectJobs()
    .where(eq(qaBenchJobs.unitId, unitId))
    .orderBy(desc(qaBenchJobs.createdAt))
    .limit(limit);

  return rows.map((row) => toJobDto(row.job, row.firmware, row.requestedByName));
}

/** `userId` is null for jobs that bench automation starts. */
export async function createJob(stationId: string, input: CreateQaBenchJobInput, userId: string | null) {
  const station = await requireStationRow(stationId);

  if (!qaBenchRegistry.isOnline(station.id)) {
    throw conflict("Station is offline.");
  }

  // Jobs on different ST-LINKs run side by side. A job without a chosen ST-LINK may use any of them, so it runs alone.
  const active = await db
    .select({ probeSerial: qaBenchJobs.probeSerial })
    .from(qaBenchJobs)
    .where(and(eq(qaBenchJobs.stationId, station.id), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])));
  const busyMessage = describeProbeConflict(active.map((job) => job.probeSerial), input.probeSerial);

  if (busyMessage) {
    throw conflict(busyMessage);
  }

  if (input.slotId) {
    const [slot] = await db
      .select({ id: qaStationSlots.id })
      .from(qaStationSlots)
      .where(and(eq(qaStationSlots.id, input.slotId), eq(qaStationSlots.stationId, station.id)))
      .limit(1);

    if (!slot) {
      throw notFound("NOT_FOUND", "Slot not found on this station.");
    }
  }

  let firmware: typeof qaFirmwareUploads.$inferSelect | null = null;

  if (input.kind === "flash") {
    const [found] = await db
      .select()
      .from(qaFirmwareUploads)
      .where(eq(qaFirmwareUploads.id, input.firmwareId))
      .limit(1);

    if (!found) {
      throw notFound("NOT_FOUND", "Firmware not found.");
    }

    firmware = found;
  }

  const address = input.kind === "flash" ? (input.address ?? QA_DEFAULT_FLASH_ADDRESS) : null;
  let inserted: JobRow;

  try {
    [inserted] = await db
      .insert(qaBenchJobs)
      .values({
        stationId: station.id,
        kind: input.kind,
        probeSerial: input.probeSerial,
        connectMode: input.connectMode,
        firmwareUploadId: firmware?.id ?? null,
        address,
        slotId: input.slotId ?? null,
        requestedByUserId: userId,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict(input.probeSerial ? `ST-LINK ${input.probeSerial} already has a job in progress.` : "Another job is in progress on this station.");
    }

    throw error;
  }

  const agentJob: QaAgentJob = {
    id: inserted.id,
    kind: inserted.kind,
    probeSerial: inserted.probeSerial,
    connectMode: inserted.connectMode,
    firmware: firmware
      ? {
        fileName: firmware.fileName,
        format: firmware.format,
        sha256: firmware.sha256,
        sizeBytes: firmware.sizeBytes,
        contentBase64: firmware.content.toString("base64"),
        address: address ?? QA_DEFAULT_FLASH_ADDRESS,
      }
      : null,
  };

  const sent = qaBenchRegistry.send(station.id, { type: "job.start", data: { job: agentJob } });

  if (!sent) {
    await markJobFailed(inserted.id, "Agent is not connected.");
  }

  const dto = await requireJobDto(inserted.id);

  broadcastJobChanged(dto);

  return dto;
}

export async function cancelJob(jobId: string) {
  const dto = await requireJobDto(jobId);

  if (dto.status !== "queued" && dto.status !== "running") {
    return dto;
  }

  if (!qaBenchRegistry.isOnline(dto.stationId)) {
    const [row] = await db
      .update(qaBenchJobs)
      .set({
        status: "cancelled",
        finishedAt: new Date(),
        result: failureResult("Cancelled while the agent was offline."),
      })
      .where(and(eq(qaBenchJobs.id, jobId), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])))
      .returning({ id: qaBenchJobs.id });

    qaBenchRegistry.forgetJob(jobId);

    const updated = await requireJobDto(jobId);

    if (row) {
      broadcastJobChanged(updated);
    }

    return updated;
  }

  qaBenchRegistry.markCancelRequested(jobId);
  qaBenchRegistry.send(dto.stationId, { type: "job.cancel", data: { jobId } });

  return dto;
}

export async function getJobLog(jobId: string): Promise<QaBenchJobLogDto> {
  const [row] = await db
    .select({ log: qaBenchJobs.log, truncated: qaBenchJobs.logTruncated })
    .from(qaBenchJobs)
    .where(eq(qaBenchJobs.id, jobId))
    .limit(1);

  if (!row) {
    throw notFound("NOT_FOUND", "Job not found.");
  }

  const runtime = qaBenchRegistry.getJob(jobId);
  const lines = splitLogLines(row.log);

  if (runtime && !runtime.logTruncated) {
    lines.push(...runtime.unflushedLines);
  }

  return { jobId, lines, truncated: row.truncated || (runtime?.logTruncated ?? false) };
}

export function failureResult(error: string): QaJobResult {
  return { target: null, verified: null, durationMs: 0, exitCode: null, error };
}

async function markJobFailed(jobId: string, error: string) {
  await db
    .update(qaBenchJobs)
    .set({ status: "failed", finishedAt: new Date(), result: failureResult(error) })
    .where(and(eq(qaBenchJobs.id, jobId), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])));
}

/** Fails every queued/running job of a station, e.g. when its agent drops or restarts. */
export async function failActiveJobs(stationId: string, error: string) {
  for (const runtime of qaBenchRegistry.jobsForStation(stationId)) {
    await flushJobLog(runtime);
  }

  const rows = await db
    .update(qaBenchJobs)
    .set({ status: "failed", finishedAt: new Date(), result: failureResult(error) })
    .where(and(eq(qaBenchJobs.stationId, stationId), inArray(qaBenchJobs.status, [...ACTIVE_JOB_STATUSES])))
    .returning({ id: qaBenchJobs.id });

  for (const runtime of qaBenchRegistry.jobsForStation(stationId)) {
    qaBenchRegistry.forgetJob(runtime.jobId);
  }

  for (const row of rows) {
    qaBenchRegistry.forgetJob(row.id);

    const dto = await loadJobDto(row.id);

    if (dto) {
      broadcastJobChanged(dto);
    }
  }
}

// ---------------------------------------------------------------------------
// Serial
// ---------------------------------------------------------------------------

export async function getSerialBuffer(stationId: string, path: string): Promise<QaSerialBufferDto> {
  await requireStationRow(stationId);

  return { stationId, path, lines: qaBenchRegistry.getSerialLines(stationId, path) };
}

/** Ensures the station exists and is online; used before forwarding anything to the agent. */
export async function requireOnlineStation(stationId: string) {
  const station = await requireStationRow(stationId);

  if (!qaBenchRegistry.isOnline(station.id)) {
    throw conflict("Station is offline.");
  }

  return station;
}

export function sendToAgent(stationId: string, message: Parameters<typeof qaBenchRegistry.send>[1]) {
  if (!qaBenchRegistry.send(stationId, message)) {
    throw conflict("Station is offline.");
  }
}
