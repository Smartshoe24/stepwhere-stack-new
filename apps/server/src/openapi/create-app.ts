import { OpenAPIHono } from "@hono/zod-openapi";
import type { ZodError } from "zod";

import type { AppBindings } from "../app-types";
import { errorResponse } from "../shared/http";

export function createOpenApiApp() {
  return new OpenAPIHono<AppBindings>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = "flatten" in result.error
          ? (result.error as ZodError).flatten()
          : undefined;

        return errorResponse(c, 400, {
          code: "BAD_REQUEST",
          message: "Request validation failed.",
          details,
        });
      }
    },
  });
}
