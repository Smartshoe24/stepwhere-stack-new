import type { MiddlewareHandler } from "hono";

import { env } from "../../config/env";
import { unauthorized } from "../../shared/errors";

export const deviceIngestAuthMiddleware: MiddlewareHandler = async (
  c,
  next,
) => {
  if (env.DEVICE_INGEST_AUTH_DISABLED) {
    await next();
    return;
  }

  const apiKey = c.req.header("x-device-ingest-key")?.trim();

  if (!apiKey) {
    throw unauthorized("Device ingest API key is required.");
  }

  if (apiKey !== env.DEVICE_INGEST_API_KEY) {
    throw unauthorized("Device ingest API key is invalid.");
  }

  await next();
};
