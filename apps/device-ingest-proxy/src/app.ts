import { randomUUID } from "node:crypto";

import { Hono } from "hono";

// Prod reaches the API by its Docker service name; the local stack overrides it.
const UPSTREAM_LOCATION_URL =
  process.env.UPSTREAM_LOCATION_URL ?? "http://server:8223/v1/telemetry/location";
const UPSTREAM_TIMEOUT_MS = 15_000;

type ErrorRecord = Record<string, unknown>;

function getSafeErrorCode(error: unknown) {
  let current = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as ErrorRecord;

    if (typeof record.code === "string") {
      return record.code;
    }

    current = record.cause;
  }

  return undefined;
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "stepwhere-device-ingest-proxy",
  });
});

app.post("/location", async (c) => {
  const startedAt = Date.now();
  const requestId = c.req.header("x-request-id")?.trim() || randomUUID();
  const contentType = c.req.header("content-type") ?? "";

  c.header("x-request-id", requestId);

  if (!contentType.toLowerCase().includes("application/json")) {
    console.info("[device-ingest-proxy] request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      upstream: UPSTREAM_LOCATION_URL,
      durationMs: Date.now() - startedAt,
      result: "bad_request",
      status: 400,
    });

    return c.json({
      code: "BAD_REQUEST",
      message: "Content-Type must be application/json.",
    }, 400);
  }

  const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(UPSTREAM_LOCATION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: await c.req.text(),
      signal,
    });
    const responseBody = await upstreamResponse.arrayBuffer();

    console.info("[device-ingest-proxy] request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      upstream: UPSTREAM_LOCATION_URL,
      durationMs: Date.now() - startedAt,
      result: "upstream_response",
      status: upstreamResponse.status,
    });

    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        "content-type":
          upstreamResponse.headers.get("content-type") ?? "application/json",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    const didTimeout = signal.aborted
      || (error instanceof Error && error.name === "TimeoutError");
    const status = didTimeout ? 504 : 502;
    const result = didTimeout ? "upstream_timeout" : "upstream_unavailable";

    console.error("[device-ingest-proxy] upstream request failed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      upstream: UPSTREAM_LOCATION_URL,
      durationMs: Date.now() - startedAt,
      errorName: getErrorName(error),
      errorCode: getSafeErrorCode(error),
      result,
      status,
    });

    return c.json({
      code: didTimeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      message: didTimeout
        ? "Stepwhere API did not respond within 15 seconds."
        : "Stepwhere API is unavailable.",
    }, status);
  }
});
