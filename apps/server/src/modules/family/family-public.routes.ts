import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { PublicFamilyInvitePreviewSchema } from "../../openapi/schemas";
import { AppError } from "../../shared/errors";
import { ok } from "../../shared/http";
import { previewPublicJoinFamilyToken } from "./family.service";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 30;
const previewRateLimits = new Map<string, { count: number; resetsAt: number }>();

const previewFamilyInviteRoute = createRoute({
  method: "get",
  path: "/public/family-invites/preview",
  tags: ["Family invites"],
  request: {
    query: z.object({
      token: z.string().trim().min(12),
    }),
  },
  responses: {
    200: jsonDataResponse(PublicFamilyInvitePreviewSchema, "Public family invite preview."),
    ...errorResponses([400, 429]),
  },
});

function enforcePreviewRateLimit(requestKey: string) {
  const now = Date.now();
  const current = previewRateLimits.get(requestKey);

  if (!current || current.resetsAt <= now) {
    previewRateLimits.set(requestKey, {
      count: 1,
      resetsAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  if (current.count >= RATE_LIMIT_REQUESTS) {
    throw new AppError(429, "RATE_LIMITED", "Too many invite preview requests. Try again shortly.");
  }

  current.count += 1;
}

const publicFamilyRoutes = createOpenApiApp();

publicFamilyRoutes.openapi(previewFamilyInviteRoute, async (c) => {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const requestKey = forwardedFor || c.req.header("x-real-ip") || "unknown";
  enforcePreviewRateLimit(requestKey);
  c.header("cache-control", "no-store");
  c.header("pragma", "no-cache");
  return ok(c, await previewPublicJoinFamilyToken(c.req.valid("query").token));
});

export { publicFamilyRoutes };
