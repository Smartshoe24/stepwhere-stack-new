import { upgradeWebSocket } from "@hono/node-server";
import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { AppError, badRequest, unauthorized } from "../../shared/errors";
import { created } from "../../shared/http";
import { handleAgentClosed, handleAgentMessage, handleAgentOpen } from "./qa-agent.socket";
import { broadcastStationChanged } from "./qa-bench.realtime";
import { authenticateAgentToken, pairAgent } from "./qa-bench.service";

const PAIR_FAILURE_WINDOW_MS = 10 * 60_000;
const PAIR_FAILURE_LIMIT = 10;
const pairFailures = new Map<string, { count: number; resetsAt: number }>();

function enforcePairRateLimit(key: string) {
  const entry = pairFailures.get(key);

  if (entry && entry.resetsAt > Date.now() && entry.count >= PAIR_FAILURE_LIMIT) {
    throw new AppError(429, "RATE_LIMITED", "Too many failed pairing attempts. Try again later.");
  }
}

function recordPairFailure(key: string) {
  const now = Date.now();
  const entry = pairFailures.get(key);

  if (!entry || entry.resetsAt <= now) {
    pairFailures.set(key, { count: 1, resetsAt: now + PAIR_FAILURE_WINDOW_MS });
    return;
  }

  entry.count += 1;
}

const pairInputSchema = z.object({
  code: z.string().min(1).max(32),
  hostname: z.string().max(255),
  platform: z.string().max(64),
  agentVersion: z.string().max(32),
});

const pairRoute = createRoute({
  method: "post",
  path: "/qa/agent/pair",
  tags: ["QA Agent"],
  request: {
    body: { required: true, content: { "application/json": { schema: pairInputSchema } } },
  },
  responses: {
    201: jsonDataResponse(
      z.object({ stationId: z.string(), stationName: z.string(), token: z.string() }),
      "Agent paired. The token is shown once.",
    ),
    ...errorResponses([400, 429]),
  },
});

const agentWebSocketRoute = createRoute({
  method: "get",
  path: "/qa/agent/ws",
  tags: ["QA Agent"],
  description: "Bench agent websocket. Authenticate with `Authorization: Bearer <station token>`.",
  responses: {
    101: { description: "Agent websocket accepted." },
    ...errorResponses([401]),
  },
});

const qaAgentRoutes = createOpenApiApp();

qaAgentRoutes.openapi(pairRoute, async (c) => {
  const input = c.req.valid("json");
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const requestKey = forwardedFor || c.req.header("x-real-ip") || "unknown";

  enforcePairRateLimit(requestKey);

  const paired = await pairAgent(input);

  if (!paired) {
    recordPairFailure(requestKey);
    throw badRequest("Pairing code is invalid or has expired.");
  }

  broadcastStationChanged(paired.stationId, "paired");

  return created(c, paired.result);
});

qaAgentRoutes.openapi(agentWebSocketRoute, async (c) => {
  const authorization = c.req.header("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];

  if (!token || token.length > 256) {
    throw unauthorized();
  }

  const station = await authenticateAgentToken(token);

  if (!station) {
    throw unauthorized();
  }

  const agentStation = { id: station.id, name: station.name };

  return upgradeWebSocket(c, {
    onOpen: (_, ws) => {
      handleAgentOpen(agentStation, ws);
    },
    onMessage: (event, ws) => {
      handleAgentMessage(agentStation, ws, event.data);
    },
    onClose: (_, ws) => {
      void handleAgentClosed(agentStation, ws);
    },
    onError: (_, ws) => {
      void handleAgentClosed(agentStation, ws);
    },
  });
});

export { qaAgentRoutes };
