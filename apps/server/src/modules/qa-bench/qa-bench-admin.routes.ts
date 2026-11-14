import { createRoute, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { QA_DEFAULT_FLASH_ADDRESS, QA_FIRMWARE_CHANNELS, QA_FIRMWARE_MAX_BYTES, QA_MAX_SLOTS } from "@stepwhere/types";
import type { CreateQaBenchJobInput } from "@stepwhere/types";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { created, ok } from "../../shared/http";
import {
  cancelJob,
  createFirmwareUpload,
  createJob,
  createStation,
  getJobLog,
  getSerialBuffer,
  listFirmwareUploads,
  listJobs,
  listStations,
  regeneratePairingCode,
  renameStation,
  requireOnlineStation,
  revokeStation,
  sendToAgent,
  setStationAutomation,
} from "./qa-bench.service";
import { getStationSlots, sendSlotCommand, updateStationSlots } from "./qa-slots.service";

const TAGS = ["Admin QA"];
const FIRMWARE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const FIRMWARE_BASE64_MAX_CHARS = Math.ceil(QA_FIRMWARE_MAX_BYTES / 3) * 4;

const stationParams = z.object({ stationId: z.string().uuid() });
const jobParams = z.object({ jobId: z.string().uuid() });
const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const nameInput = z.object({ name: z.string().trim().min(1).max(60) });
const serialPath = z.string().min(1).max(255);
const baudRate = z.union([
  z.literal(9600),
  z.literal(19200),
  z.literal(38400),
  z.literal(57600),
  z.literal(115200),
  z.literal(230400),
  z.literal(460800),
  z.literal(921600),
]);

const probeSerial = z.string().regex(/^[0-9A-Za-z]{4,64}$/).nullable();
const connectMode = z.enum(["normal", "underReset", "hotPlug"]);
const slotId = z.string().uuid().nullable().optional();
const createJobInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("identify"), probeSerial, connectMode, slotId }),
  z.object({
    kind: z.literal("flash"),
    probeSerial,
    connectMode,
    slotId,
    firmwareId: z.string().uuid(),
    address: z.string().regex(/^0x[0-9A-Fa-f]{1,8}$/).default(QA_DEFAULT_FLASH_ADDRESS),
  }),
]);

const json = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { "application/json": { schema } },
});
const dto = (description: string) => jsonDataResponse(z.unknown(), description);
const adminErrors = errorResponses([400, 401, 403, 404, 409]);

const qaBenchAdminRoutes = createOpenApiApp();

qaBenchAdminRoutes.use("/admin/qa/firmware-uploads", bodyLimit({ maxSize: FIRMWARE_BODY_LIMIT_BYTES }));

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations",
    tags: TAGS,
    security: bearerSecurity,
    responses: { 200: dto("QA bench stations."), ...adminErrors },
  }),
  async (c) => ok(c, await listStations()),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations",
    tags: TAGS,
    security: bearerSecurity,
    request: { body: json(nameInput) },
    responses: { 201: dto("Station created with a one-time pairing code."), ...adminErrors },
  }),
  async (c) => created(c, await createStation(c.req.valid("json").name, c.get("user").id)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/admin/qa/stations/{stationId}",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(nameInput) },
    responses: { 200: dto("Station renamed."), ...adminErrors },
  }),
  async (c) => ok(c, await renameStation(c.req.valid("param").stationId, c.req.valid("json").name)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "put",
    path: "/admin/qa/stations/{stationId}/automation",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(z.object({ enabled: z.boolean() })) },
    responses: { 200: dto("Bench automation turned on or off."), ...adminErrors },
  }),
  async (c) => ok(c, await setStationAutomation(c.req.valid("param").stationId, c.req.valid("json").enabled)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/pairing-code",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("New pairing code. The current agent is disconnected."), ...adminErrors },
  }),
  async (c) => ok(c, await regeneratePairingCode(c.req.valid("param").stationId)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/admin/qa/stations/{stationId}",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("Station revoked."), ...adminErrors },
  }),
  async (c) => ok(c, await revokeStation(c.req.valid("param").stationId)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/hardware-scan",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("Hardware scan requested."), ...adminErrors },
  }),
  async (c) => {
    const { stationId } = c.req.valid("param");

    await requireOnlineStation(stationId);
    sendToAgent(stationId, { type: "hardware.scan", data: {} });

    return ok(c, { requested: true });
  },
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/firmware-uploads",
    tags: TAGS,
    security: bearerSecurity,
    request: { query: limitQuery },
    responses: { 200: dto("Uploaded firmware, newest first."), ...adminErrors },
  }),
  async (c) => ok(c, await listFirmwareUploads(c.req.valid("query").limit)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/firmware-uploads",
    tags: TAGS,
    security: bearerSecurity,
    request: {
      body: json(z.object({
        fileName: z.string().min(1).max(200),
        contentBase64: z.string().min(1).max(FIRMWARE_BASE64_MAX_CHARS),
        channel: z.enum(QA_FIRMWARE_CHANNELS),
        version: z.string().trim().max(32).nullable().optional(),
      })),
    },
    responses: { 201: dto("Firmware stored."), ...adminErrors },
  }),
  async (c) => created(c, await createFirmwareUpload(c.req.valid("json"), c.get("user").id)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations/{stationId}/jobs",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, query: limitQuery },
    responses: { 200: dto("Recent jobs, newest first."), ...adminErrors },
  }),
  async (c) => ok(c, await listJobs(c.req.valid("param").stationId, c.req.valid("query").limit)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/jobs",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(createJobInput) },
    responses: { 201: dto("Job queued on the station."), ...adminErrors },
  }),
  async (c) => created(
    c,
    await createJob(c.req.valid("param").stationId, c.req.valid("json") as CreateQaBenchJobInput, c.get("user").id),
  ),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/jobs/{jobId}/cancel",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: jobParams },
    responses: { 200: dto("Job after the cancel request."), ...adminErrors },
  }),
  async (c) => ok(c, await cancelJob(c.req.valid("param").jobId)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/jobs/{jobId}/log",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: jobParams },
    responses: { 200: dto("Job log."), ...adminErrors },
  }),
  async (c) => ok(c, await getJobLog(c.req.valid("param").jobId)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/serial/open",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(z.object({ path: serialPath, baudRate })) },
    responses: { 200: dto("Serial open requested."), ...adminErrors },
  }),
  async (c) => {
    const { stationId } = c.req.valid("param");
    const input = c.req.valid("json");

    await requireOnlineStation(stationId);
    sendToAgent(stationId, { type: "serial.open", data: { path: input.path, baudRate: input.baudRate } });

    return ok(c, { requested: true });
  },
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/serial/close",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(z.object({ path: serialPath })) },
    responses: { 200: dto("Serial close requested."), ...adminErrors },
  }),
  async (c) => {
    const { stationId } = c.req.valid("param");

    await requireOnlineStation(stationId);
    sendToAgent(stationId, { type: "serial.close", data: { path: c.req.valid("json").path } });

    return ok(c, { requested: true });
  },
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/serial/write",
    tags: TAGS,
    security: bearerSecurity,
    request: {
      params: stationParams,
      body: json(z.object({ path: serialPath, data: z.string().min(1).max(512) })),
    },
    responses: { 200: dto("Serial write forwarded."), ...adminErrors },
  }),
  async (c) => {
    const { stationId } = c.req.valid("param");
    const input = c.req.valid("json");

    await requireOnlineStation(stationId);
    sendToAgent(stationId, { type: "serial.write", data: { path: input.path, data: input.data } });

    return ok(c, { requested: true });
  },
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations/{stationId}/serial/buffer",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, query: z.object({ path: serialPath }) },
    responses: { 200: dto("Buffered serial lines."), ...adminErrors },
  }),
  async (c) => ok(c, await getSerialBuffer(c.req.valid("param").stationId, c.req.valid("query").path)),
);

const slotsInput = z.object({
  slots: z.array(z.object({
    position: z.number().int().min(1).max(QA_MAX_SLOTS),
    label: z.string().max(40).nullable().optional(),
    portKey: z.string().min(1).max(320),
    probeSerial,
  })).max(QA_MAX_SLOTS),
});
const slotCommandInput = z.object({
  /** Omit to send to every slot whose port is open. */
  slotIds: z.array(z.string().uuid()).max(QA_MAX_SLOTS).optional(),
  data: z.string().min(1).max(512),
});

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations/{stationId}/slots",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("The station's slots with their live state, and the TTL adapters the agent sees."), ...adminErrors },
  }),
  async (c) => ok(c, await getStationSlots(c.req.valid("param").stationId)),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "put",
    path: "/admin/qa/stations/{stationId}/slots",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(slotsInput) },
    responses: { 200: dto("Slots saved."), ...adminErrors },
  }),
  async (c) => ok(c, await updateStationSlots(c.req.valid("param").stationId, c.req.valid("json"))),
);

qaBenchAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/stations/{stationId}/slots/command",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams, body: json(slotCommandInput) },
    responses: { 200: dto("Written to each slot's TTL port."), ...adminErrors },
  }),
  async (c) => {
    const { stationId } = c.req.valid("param");
    const input = c.req.valid("json");

    await requireOnlineStation(stationId);

    return ok(c, await sendSlotCommand(stationId, input.slotIds ?? null, input.data));
  },
);

export { qaBenchAdminRoutes };
