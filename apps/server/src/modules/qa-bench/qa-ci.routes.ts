/**
 * Lets CI put a freshly built QA firmware on the bench, so nobody downloads and
 * uploads it by hand. Authenticated with `Authorization: Bearer <QA_CI_UPLOAD_TOKEN>`
 * (a long random secret shared with GitHub Actions). Only the QA channel:
 * production firmware ships to customers and stays a deliberate admin upload.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { QA_FIRMWARE_MAX_BYTES } from "@stepwhere/types";

import { env } from "../../config/env";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { AppError, unauthorized } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { ciTokenMatches } from "./qa-bench.helpers";
import { createCiFirmwareUpload } from "./qa-bench.service";

const BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const BASE64_MAX_CHARS = Math.ceil(QA_FIRMWARE_MAX_BYTES / 3) * 4;

const uploadInput = z.object({
  fileName: z.string().min(1).max(200),
  contentBase64: z.string().min(1).max(BASE64_MAX_CHARS),
  version: z.string().trim().max(40).nullable().optional(),
});

const uploadRoute = createRoute({
  method: "post",
  path: "/qa/ci/firmware-uploads",
  tags: ["QA CI"],
  description: "CI uploads a QA firmware build. Authenticate with `Authorization: Bearer <QA_CI_UPLOAD_TOKEN>`.",
  request: { body: { required: true, content: { "application/json": { schema: uploadInput } } } },
  responses: {
    200: jsonDataResponse(z.unknown(), "This image was already uploaded; the existing upload is returned."),
    201: jsonDataResponse(z.unknown(), "Firmware uploaded to the QA channel."),
    ...errorResponses([400, 401, 503]),
  },
});

const qaCiRoutes = createOpenApiApp();

qaCiRoutes.use("/qa/ci/firmware-uploads", bodyLimit({ maxSize: BODY_LIMIT_BYTES }));

qaCiRoutes.openapi(uploadRoute, async (c) => {
  if (!env.QA_CI_UPLOAD_TOKEN) {
    throw new AppError(503, "SERVICE_UNAVAILABLE", "CI firmware upload is not configured on this server.");
  }

  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];

  if (!token || token.length > 256 || !ciTokenMatches(token, env.QA_CI_UPLOAD_TOKEN)) {
    throw unauthorized();
  }

  const input = c.req.valid("json");
  const result = await createCiFirmwareUpload({ ...input, channel: "qa" });

  return result.created ? created(c, result.firmware) : ok(c, result.firmware);
});

export { qaCiRoutes };
