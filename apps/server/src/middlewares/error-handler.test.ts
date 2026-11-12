import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { badRequest } from "../shared/errors";
import { appErrorHandler } from "./error-handler";

describe("errorHandlerMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns normalized app errors", async () => {
    const app = new Hono();

    app.onError(appErrorHandler);
    app.get("/boom", () => {
      throw badRequest("Nope");
    });

    const response = await app.request("http://localhost/boom");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "BAD_REQUEST",
      message: "Nope",
      details: undefined,
    });
  });

  it.each(["57014", "55P03"])(
    "maps telemetry database timeout %s to a retryable response",
    async (code) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = new Hono();

      app.onError(appErrorHandler);
      app.post("/v1/telemetry/location", () => {
        throw Object.assign(new Error("database internals"), { code });
      });

      const response = await app.request("/v1/telemetry/location", {
        method: "POST",
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: "SERVICE_UNAVAILABLE",
        message: "Telemetry storage is temporarily unavailable. Retry later.",
      });
    },
  );

  it("recognizes a nested PostgreSQL lock timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = new Hono();

    app.onError(appErrorHandler);
    app.post("/v1/telemetry/location", () => {
      throw new Error("query failed", {
        cause: Object.assign(new Error("lock details"), { code: "55P03" }),
      });
    });

    const response = await app.request("/v1/telemetry/location", {
      method: "POST",
    });

    expect(response.status).toBe(503);
  });

  it("keeps unrelated failures generic and hides their details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = new Hono();

    app.onError(appErrorHandler);
    app.post("/v1/telemetry/location", () => {
      throw new Error("sensitive database details");
    });

    const response = await app.request("/v1/telemetry/location", {
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error.",
    });
  });
});
