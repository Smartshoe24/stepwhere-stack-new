import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAppError } from "../../shared/errors";

const envSnapshot = { ...process.env };

function resetRequiredEnv() {
  process.env.NODE_ENV = "test";
  process.env.PORT = "3001";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/postgres";
  process.env.BETTER_AUTH_SECRET = "test-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.DEVICE_PROVISIONING_SECRET = "test-provisioning-secret";
}

async function buildApp(input: {
  authDisabled?: "false" | "true";
  ingestApiKey?: string;
}) {
  vi.resetModules();
  resetRequiredEnv();
  process.env.DEVICE_INGEST_AUTH_DISABLED = input.authDisabled ?? "false";

  if (input.ingestApiKey === undefined) {
    delete process.env.DEVICE_INGEST_API_KEY;
  } else {
    process.env.DEVICE_INGEST_API_KEY = input.ingestApiKey;
  }

  const { deviceIngestAuthMiddleware } = await import(
    "./device-ingest.middleware"
  );
  const app = new Hono();

  app.onError((error, c) => {
    if (isAppError(error)) {
      return new Response(
        JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: error.status,
        },
      );
    }

    throw error;
  });
  app.use("*", deviceIngestAuthMiddleware);
  app.post("/ingest", (c) => c.json({ ok: true }));

  return app;
}

describe("deviceIngestAuthMiddleware", () => {
  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.resetModules();
  });

  it("rejects missing keys by default", async () => {
    const app = await buildApp({ ingestApiKey: "expected-key" });

    const response = await app.request("/ingest", { method: "POST" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: "Device ingest API key is required.",
      },
    });
  });

  it("rejects invalid keys by default", async () => {
    const app = await buildApp({ ingestApiKey: "expected-key" });

    const response = await app.request("/ingest", {
      method: "POST",
      headers: {
        "x-device-ingest-key": "wrong-key",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: "Device ingest API key is invalid.",
      },
    });
  });

  it("allows valid keys by default", async () => {
    const app = await buildApp({ ingestApiKey: "expected-key" });

    const response = await app.request("/ingest", {
      method: "POST",
      headers: {
        "x-device-ingest-key": "expected-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("allows missing keys when device ingest auth is disabled", async () => {
    const app = await buildApp({ authDisabled: "true" });

    const response = await app.request("/ingest", { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("allows invalid keys when device ingest auth is disabled", async () => {
    const app = await buildApp({ authDisabled: "true" });

    const response = await app.request("/ingest", {
      method: "POST",
      headers: {
        "x-device-ingest-key": "wrong-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
