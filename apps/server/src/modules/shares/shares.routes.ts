import { upgradeWebSocket } from "@hono/node-server";
import { createRoute, z } from "@hono/zod-openapi";

import { env } from "../../config/env";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  ActiveShareLinkResponseSchema,
  PublicShareResponseSchema,
  RevokedShareLinkSchema,
  ShareLinkSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { forbidden } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { familyAdminMiddleware, familyMemberMiddleware } from "../family/family.middleware";
import { logRealtimeDebug } from "../realtime/realtime.debug";
import { publicShareRealtimeRegistry } from "./share-realtime.service";
import {
  createShareLink,
  getActiveShareLink,
  getPublicShareResponseByRawToken,
  getPublicShareSocketContext,
  revokeShareLink,
} from "./shares.service";

const childParamsSchema = z.object({
  childId: UuidSchema.openapi({
    param: {
      name: "childId",
      in: "path",
    },
  }),
});

const tokenParamsSchema = z.object({
  token: z.string().trim().min(1).openapi({
    param: {
      name: "token",
      in: "path",
    },
  }),
});

const shareParamsSchema = childParamsSchema.extend({
  shareId: UuidSchema.openapi({
    param: {
      name: "shareId",
      in: "path",
    },
  }),
});

const createShareSchema = z.object({
  durationMinutes: z.union([z.literal(15), z.literal(60), z.literal(240)]),
});

function setNoStoreHeaders(c: Parameters<typeof ok>[0]) {
  c.header("cache-control", "no-store, private");
  c.header("pragma", "no-cache");
}

function validatePublicShareOrigin(origin: string | undefined) {
  if (!origin) {
    return;
  }

  if (origin !== new URL(env.PUBLIC_SHARE_APP_URL).origin) {
    throw forbidden("Share socket origin is not allowed.");
  }
}

const createShareRoute = createRoute({
  method: "post",
  path: "/children/{childId}/share-links",
  tags: ["Shares"],
  security: bearerSecurity,
  middleware: [familyMemberMiddleware, familyAdminMiddleware] as const,
  request: {
    params: childParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: createShareSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(ShareLinkSchema, "Created share link."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const getActiveShareRoute = createRoute({
  method: "get",
  path: "/children/{childId}/share-links/active",
  tags: ["Shares"],
  security: bearerSecurity,
  middleware: [familyMemberMiddleware, familyAdminMiddleware] as const,
  request: {
    params: childParamsSchema,
  },
  responses: {
    200: jsonDataResponse(ActiveShareLinkResponseSchema, "Current active share link."),
    ...errorResponses([401, 403, 404]),
  },
});

const revokeShareRoute = createRoute({
  method: "delete",
  path: "/children/{childId}/share-links/{shareId}",
  tags: ["Shares"],
  security: bearerSecurity,
  middleware: [familyMemberMiddleware, familyAdminMiddleware] as const,
  request: {
    params: shareParamsSchema,
  },
  responses: {
    200: jsonDataResponse(RevokedShareLinkSchema, "Share link revoked."),
    ...errorResponses([401, 403, 404]),
  },
});

const getShareRoute = createRoute({
  method: "get",
  path: "/share-links/{token}",
  tags: ["Shares"],
  request: {
    params: tokenParamsSchema,
  },
  responses: {
    200: jsonDataResponse(PublicShareResponseSchema, "Public share data."),
    ...errorResponses([404, 410]),
  },
});

const shareSocketRoute = createRoute({
  method: "get",
  path: "/share-links/{token}/ws",
  tags: ["Shares"],
  request: {
    params: tokenParamsSchema,
  },
  responses: {
    101: {
      description: "WebSocket upgrade accepted.",
    },
    ...errorResponses([403, 404, 410]),
  },
});

const authenticatedSharesRoutes = createOpenApiApp();
const publicSharesRoutes = createOpenApiApp();

authenticatedSharesRoutes.openapi(getActiveShareRoute, async (c) => {
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");

  return ok(c, await getActiveShareLink({
    childId,
    organizationId: organization.id,
  }));
});

authenticatedSharesRoutes.openapi(createShareRoute, async (c) => {
  const user = c.get("user");
  const organization = c.get("organization");
  const { childId } = c.req.valid("param");
  const body = c.req.valid("json");

  const result = await createShareLink({
    childId,
    create: body,
    organizationId: organization.id,
    userId: user.id,
  });

  await Promise.all(result.replacedShareIds.map((shareId) => (
    publicShareRealtimeRegistry.endShare(shareId, "replaced")
  )));

  return created(c, result.share);
});

authenticatedSharesRoutes.openapi(revokeShareRoute, async (c) => {
  const organization = c.get("organization");
  const { childId, shareId } = c.req.valid("param");
  const result = await revokeShareLink({
    childId,
    organizationId: organization.id,
    shareId,
  });

  if (result.didRevoke) {
    await publicShareRealtimeRegistry.endShare(shareId, "stopped");
  }

  return ok(c, result.share);
});

publicSharesRoutes.openapi(getShareRoute, async (c) => {
  setNoStoreHeaders(c);
  return ok(c, await getPublicShareResponseByRawToken(c.req.valid("param").token));
});

publicSharesRoutes.openapi(shareSocketRoute, async (c) => {
  validatePublicShareOrigin(c.req.header("origin"));

  const { token } = c.req.valid("param");
  const shareContext = await getPublicShareSocketContext(token);

  return upgradeWebSocket(c, {
    onOpen: (_, ws) => {
      publicShareRealtimeRegistry.add({
        shareId: shareContext.shareId,
        childId: shareContext.childId,
        expiresAt: shareContext.expiresAt,
        socket: ws,
      });

      ws.send(JSON.stringify({
        type: "share.snapshot",
        data: shareContext.snapshot,
      }));
    },
    onClose: (_, ws) => {
      publicShareRealtimeRegistry.remove(ws);
    },
    onError: (_, ws) => {
      publicShareRealtimeRegistry.remove(ws);
    },
  }, {
    onError: (error) => {
      logRealtimeDebug("share_upgrade_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
});

export { authenticatedSharesRoutes, publicSharesRoutes };
