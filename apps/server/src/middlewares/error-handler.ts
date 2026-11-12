import type { ErrorHandler, MiddlewareHandler } from "hono";

import { errorResponse } from "../shared/http";
import { AppError, isAppError } from "../shared/errors";
import { getSafeErrorDetails } from "../shared/background-task";
import { isPostgresTimeoutError } from "../shared/database-errors";
import { redactSensitiveRequestPath } from "../shared/request-path";

function requestErrorContext(c: Parameters<ErrorHandler>[1]) {
  const startedAt = c.get("requestStartedAt");

  return {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: redactSensitiveRequestPath(c.req.path),
    durationMs: typeof startedAt === "number" ? Date.now() - startedAt : undefined,
  };
}

function safeRequestErrorDetails(error: unknown) {
  const { message: _message, ...details } = getSafeErrorDetails(error);
  return details;
}

export const appErrorHandler: ErrorHandler = (error, c) => {
  if (isAppError(error)) {
    return errorResponse(c, error.status, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (
    c.req.path === "/v1/telemetry/location"
    && isPostgresTimeoutError(error)
  ) {
    console.error("[telemetry] storage timeout", {
      ...requestErrorContext(c),
      ...safeRequestErrorDetails(error),
    });

    return errorResponse(c, 503, {
      code: "SERVICE_UNAVAILABLE",
      message: "Telemetry storage is temporarily unavailable. Retry later.",
    });
  }

  console.error("Unhandled request error", {
    ...requestErrorContext(c),
    ...safeRequestErrorDetails(error),
  });

  return errorResponse(c, 500, {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error.",
  });
};

export const errorHandlerMiddleware: MiddlewareHandler = async (_, next) => {
  await next();
};

export function toAppError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  return undefined;
}
