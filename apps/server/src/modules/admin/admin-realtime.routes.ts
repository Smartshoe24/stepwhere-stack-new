import { upgradeWebSocket } from "@hono/node-server";
import { createRoute, z } from "@hono/zod-openapi";

import { auth } from "../../infrastructure/better-auth";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { unauthorized } from "../../shared/errors";
import { buildRealtimeAuthHeaders } from "../realtime/realtime-auth";
import { startRealtimeHeartbeat, stopRealtimeHeartbeat } from "../realtime/realtime-heartbeat";
import { adminRealtimeRegistry } from "./admin-realtime.service";

const realtimeQuerySchema = z.object({
  token: z.string().optional().openapi({
    param: {
      name: "token",
      in: "query",
    },
  }),
});

const adminRealtimeRoute = createRoute({
  method: "get",
  path: "/admin/realtime/ws",
  tags: ["Admin"],
  security: bearerSecurity,
  request: {
    query: realtimeQuerySchema,
  },
  responses: {
    101: {
      description: "Admin realtime websocket accepted.",
    },
    ...errorResponses([401, 403]),
  },
});

async function getAdminRealtimeSession(c: Parameters<typeof upgradeWebSocket>[0] extends never ? never : any) {
  const token = c.req.query("token");
  const headers = buildRealtimeAuthHeaders(c.req.raw.headers, token);
  const session = await auth.api.getSession({ headers });

  if (!session?.session || !session.user || session.user.role !== "admin") {
    throw unauthorized();
  }

  return session;
}

const adminRealtimeRoutes = createOpenApiApp();

adminRealtimeRoutes.openapi(adminRealtimeRoute, async (c) => {
  await getAdminRealtimeSession(c);

  return upgradeWebSocket(c, {
    onOpen: (_, ws) => {
      adminRealtimeRegistry.add(ws);
      startRealtimeHeartbeat(ws);
    },
    onClose: (_, ws) => {
      stopRealtimeHeartbeat(ws);
      adminRealtimeRegistry.remove(ws);
    },
    onError: (_, ws) => {
      stopRealtimeHeartbeat(ws);
      adminRealtimeRegistry.remove(ws);
    },
  });
});

export { adminRealtimeRoutes };
