import { createRoute, z } from "@hono/zod-openapi";
import { QA_UNIT_STAGE_STATUSES, QA_UNIT_STAGES } from "@stepwhere/types";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { created, ok } from "../../shared/http";
import {
  addUnitNote,
  getOverview,
  getStationUnit,
  getUnitDetail,
  listUnits,
  setUnitStage,
  updateUnit,
} from "./qa-units.service";
import { getLatestStationRun } from "./qa-test-runs.query";

const TAGS = ["Admin QA"];

const unitParams = z.object({ unitId: z.string().uuid() });
const stationParams = z.object({ stationId: z.string().uuid() });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(64).optional(),
  stage: z.enum(QA_UNIT_STAGES).optional(),
  status: z.enum(QA_UNIT_STAGE_STATUSES).optional(),
  sort: z.enum(["updatedAt", "createdAt", "stage", "imei"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
const updateInput = z.object({
  imei: z.string().trim().min(1).max(32).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
const stageInput = z.object({
  stage: z.enum(QA_UNIT_STAGES),
  status: z.enum(QA_UNIT_STAGE_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
});
const noteInput = z.object({ note: z.string().trim().min(1).max(2000) });

const json = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { "application/json": { schema } },
});
const dto = (description: string) => jsonDataResponse(z.unknown(), description);
const adminErrors = errorResponses([400, 401, 403, 404, 409]);

const qaUnitsAdminRoutes = createOpenApiApp();

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/overview",
    tags: TAGS,
    security: bearerSecurity,
    responses: { 200: dto("Units per stage, failures, field state and stations."), ...adminErrors },
  }),
  async (c) => ok(c, await getOverview()),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/units",
    tags: TAGS,
    security: bearerSecurity,
    request: { query: listQuery },
    responses: { 200: dto("Units, paginated."), ...adminErrors },
  }),
  async (c) => ok(c, await listUnits(c.req.valid("query"))),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/units/{unitId}",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: unitParams },
    responses: { 200: dto("Unit with its timeline and bench jobs."), ...adminErrors },
  }),
  async (c) => ok(c, await getUnitDetail(c.req.valid("param").unitId)),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/admin/qa/units/{unitId}",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: unitParams, body: json(updateInput) },
    responses: { 200: dto("Unit updated."), ...adminErrors },
  }),
  async (c) => ok(c, await updateUnit(c.req.valid("param").unitId, c.req.valid("json"), c.get("user").id)),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/units/{unitId}/stage",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: unitParams, body: json(stageInput) },
    responses: { 200: dto("Stage set."), ...adminErrors },
  }),
  async (c) => ok(c, await setUnitStage(c.req.valid("param").unitId, c.req.valid("json"), c.get("user").id)),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "post",
    path: "/admin/qa/units/{unitId}/notes",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: unitParams, body: json(noteInput) },
    responses: { 201: dto("Note added to the timeline."), ...adminErrors },
  }),
  async (c) => created(c, await addUnitNote(c.req.valid("param").unitId, c.req.valid("json").note, c.get("user").id)),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations/{stationId}/unit",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("The board last identified or flashed on this station."), ...adminErrors },
  }),
  async (c) => ok(c, await getStationUnit(c.req.valid("param").stationId)),
);

qaUnitsAdminRoutes.openapi(
  createRoute({
    method: "get",
    path: "/admin/qa/stations/{stationId}/test-runs/latest",
    tags: TAGS,
    security: bearerSecurity,
    request: { params: stationParams },
    responses: { 200: dto("The station's latest board-test run, or null."), ...adminErrors },
  }),
  async (c) => ok(c, await getLatestStationRun(c.req.valid("param").stationId)),
);

export { qaUnitsAdminRoutes };
