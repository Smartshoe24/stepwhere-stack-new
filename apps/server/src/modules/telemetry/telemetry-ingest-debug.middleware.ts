import type { MiddlewareHandler } from "hono";

import type { AppBindings } from "../../app-types";
import { env } from "../../config/env";

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export const telemetryIngestDebugMiddleware: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  if (env.NODE_ENV !== "development") {
    await next();
    return;
  }

  const startedAt = c.get("requestStartedAt") ?? Date.now();
  let payload: string | null = null;
  let payloadCaptureError: string | undefined;

  try {
    payload = await c.req.raw.clone().text();
  } catch (error) {
    payloadCaptureError = getErrorName(error);
  }

  try {
    await next();
  } finally {
    let formattedPayload: unknown = payload;
    if (payload !== null) {
      try {
        formattedPayload = JSON.parse(payload);
      } catch {
        // Keep malformed payloads as their original text for diagnosis.
      }
    }

    console.info(JSON.stringify({
      event: "telemetry.ingest",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      contentType: c.req.header("content-type") ?? null,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
      payload: formattedPayload,
      ...(payloadCaptureError ? { payloadCaptureError } : {}),
    }, null, 2));
  }
};
