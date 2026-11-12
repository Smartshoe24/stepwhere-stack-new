import type { MiddlewareHandler } from "hono";

import { redactSensitiveRequestPath } from "../shared/request-path";

const SLOW_REQUEST_THRESHOLD_MS = 5_000;

function requestLogContext(c: Parameters<MiddlewareHandler>[0], startedAt: number) {
  return {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: redactSensitiveRequestPath(c.req.path),
    durationMs: Date.now() - startedAt,
  };
}

export const requestTimingMiddleware: MiddlewareHandler = async (c, next) => {
  const startedAt = Date.now();
  let didLogSlowRequest = false;
  let didFail = false;

  c.set("requestStartedAt", startedAt);

  const slowRequestTimer = setTimeout(() => {
    didLogSlowRequest = true;
    console.warn("[request] request_slow", requestLogContext(c, startedAt));
  }, SLOW_REQUEST_THRESHOLD_MS);
  slowRequestTimer.unref();

  try {
    await next();
  } catch (error) {
    didFail = true;
    throw error;
  } finally {
    clearTimeout(slowRequestTimer);

    if (didLogSlowRequest && !didFail) {
      console.warn("[request] request_completed_after_slow", {
        ...requestLogContext(c, startedAt),
        status: c.res.status,
      });
    }
  }
};
