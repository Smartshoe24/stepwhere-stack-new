import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppBindings } from "../app-types";
import { appErrorHandler } from "./error-handler";
import { requestIdMiddleware } from "./request-id";
import { requestTimingMiddleware } from "./request-timing";

function createTestApp() {
  const app = new Hono<AppBindings>();
  app.use("*", requestIdMiddleware);
  app.use("*", requestTimingMiddleware);
  app.onError(appErrorHandler);
  return app;
}

describe("requestTimingMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not log fast requests and clears its timer", async () => {
    const app = createTestApp();
    app.get("/fast", (c) => c.json({ ok: true }));

    const response = await app.request("/fast");

    expect(response.status).toBe(200);
    expect(console.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs a pending request once and logs its eventual completion", async () => {
    let releaseRequest!: () => void;
    const pending = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const app = createTestApp();
    app.get("/slow", async (c) => {
      await pending;
      return c.json({ ok: true });
    });

    const responsePromise = app.request("/slow?secret=ignored", {
      headers: { "x-request-id": "slow-request-id" },
    });
    await vi.advanceTimersByTimeAsync(5_001);

    expect(console.warn).toHaveBeenCalledWith(
      "[request] request_slow",
      expect.objectContaining({
        requestId: "slow-request-id",
        method: "GET",
        path: "/slow",
      }),
    );

    releaseRequest();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(
      "[request] request_completed_after_slow",
      expect.objectContaining({
        requestId: "slow-request-id",
        path: "/slow",
        status: 200,
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its timer after a failed request", async () => {
    const app = createTestApp();
    app.get("/failure", () => {
      throw new Error("boom");
    });

    const response = await app.request("/failure");

    expect(response.status).toBe(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("correlates a slow failed request through the error log", async () => {
    let releaseRequest!: () => void;
    const pending = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const app = createTestApp();
    app.get("/slow-failure", async () => {
      await pending;
      throw new Error("boom");
    });

    const responsePromise = app.request("/slow-failure?secret=ignored", {
      headers: { "x-request-id": "slow-failure-id" },
    });
    await vi.advanceTimersByTimeAsync(5_001);
    releaseRequest();

    const response = await responsePromise;

    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith(
      "Unhandled request error",
      expect.objectContaining({
        requestId: "slow-failure-id",
        method: "GET",
        path: "/slow-failure",
      }),
    );
    expect(console.warn).toHaveBeenCalledWith(
      "[request] request_completed_after_slow",
      expect.objectContaining({
        requestId: "slow-failure-id",
        path: "/slow-failure",
        status: 500,
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
