import { upgradeWebSocket } from "@hono/node-server";
import { createRoute, z } from "@hono/zod-openapi";
import type { WSContext } from "hono/ws";

import type { AppBindings } from "../../app-types";
import { auth } from "../../infrastructure/better-auth";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses } from "../../openapi/responses";
import { bearerSecurity } from "../../openapi/security";
import { AppError, unauthorized } from "../../shared/errors";
import { findFamilyMembershipForUser } from "../family/family.service";
import { getOverviewForOrganization } from "../children/children.service";
import { buildRealtimeAuthHeaders } from "./realtime-auth";
import { logRealtimeDebug } from "./realtime.debug";
import { startRealtimeHeartbeat, stopRealtimeHeartbeat } from "./realtime-heartbeat";
import { realtimeRegistry } from "./realtime.service";
import { assertAccountAccessAllowed } from "../account-deletion/account-deletion.service";

const realtimeQuerySchema = z.object({
  token: z.string().optional().openapi({
    param: {
      name: "token",
      in: "query",
    },
  }),
});

async function getRealtimeSession(c: Parameters<typeof upgradeWebSocket>[0] extends never ? never : any) {
  const token = c.req.query("token");
  const headers = buildRealtimeAuthHeaders(c.req.raw.headers, token);

  logRealtimeDebug("auth_attempt", {
    hasAuthorizationHeader: headers.has("authorization"),
    hasCookieHeader: headers.has("cookie"),
    hasQueryToken: Boolean(token),
  });

  const session = await auth.api.getSession({ headers });

  if (!session?.session || !session.user) {
    logRealtimeDebug("auth_failed", {
      hasAuthorizationHeader: headers.has("authorization"),
      hasCookieHeader: headers.has("cookie"),
      hasQueryToken: Boolean(token),
    });
    throw unauthorized();
  }


  await assertAccountAccessAllowed(session.user.id);

  logRealtimeDebug("auth_succeeded", {
    userId: session.user.id,
    activeOrganizationId: session.session.activeOrganizationId ?? null,
  });
  return session;
}

const socketOrganizationByConnection = new WeakMap<WSContext, string>();

const realtimeRoute = createRoute({
  method: "get",
  path: "/realtime/ws",
  tags: ["Realtime"],
  security: bearerSecurity,
  request: {
    query: realtimeQuerySchema,
  },
  responses: {
    101: {
      description: "WebSocket upgrade accepted.",
    },
    ...errorResponses([401, 409]),
  },
});

const realtimeRoutes = createOpenApiApp();

realtimeRoutes.openapi(realtimeRoute, async (c) => {
  const session = await getRealtimeSession(c);
  const familyMembership = await findFamilyMembershipForUser(
    session.user.id,
    session.session.activeOrganizationId ?? null,
  );

  if (!familyMembership) {
    logRealtimeDebug("membership_missing", {
      userId: session.user.id,
      activeOrganizationId: session.session.activeOrganizationId ?? null,
    });
    throw new AppError(409, "ONBOARDING_REQUIRED", "Family onboarding is required.");
  }

  const organizationId = familyMembership.organization.id;
  logRealtimeDebug("organization_resolved", {
    organizationId,
    userId: session.user.id,
  });

  return upgradeWebSocket(c, {
    onOpen: async (_, ws) => {
      socketOrganizationByConnection.set(ws, organizationId);
      realtimeRegistry.add(organizationId, ws, session.user.id);
      startRealtimeHeartbeat(ws);
      logRealtimeDebug("socket_open", { organizationId });

      ws.send(JSON.stringify({
        type: "overview.snapshot",
        data: await getOverviewForOrganization(organizationId),
      }));
    },
    onClose: (_, ws) => {
      stopRealtimeHeartbeat(ws);
      const owner = socketOrganizationByConnection.get(ws);
      logRealtimeDebug("socket_close", { organizationId: owner ?? null });
      if (owner) {
        realtimeRegistry.remove(owner, ws);
      }
    },
    onError: (_, ws) => {
      stopRealtimeHeartbeat(ws);
      const owner = socketOrganizationByConnection.get(ws);
      logRealtimeDebug("socket_error", { organizationId: owner ?? null });
      if (owner) {
        realtimeRegistry.remove(owner, ws);
      }
    },
  }, {
    onError: (error) => {
      logRealtimeDebug("upgrade_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
});

export { realtimeRoutes };
