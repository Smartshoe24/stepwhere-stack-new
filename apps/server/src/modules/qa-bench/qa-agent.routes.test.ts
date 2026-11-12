import { describe, expect, it, vi } from "vitest";


const state = vi.hoisted(() => ({ updates: 0 }));

vi.mock("../../db/client", async () => {
  const { queryResult } = await import("../../test/drizzle-chain-mock");

  return {
    db: {
      update: vi.fn(() => {
        state.updates += 1;
        return queryResult([]);
      }),
      select: vi.fn(() => queryResult([])),
    },
  };
});

describe("qa agent routes", () => {
  async function createApp() {
    const { createOpenApiApp } = await import("../../openapi/create-app");
    const { appErrorHandler } = await import("../../middlewares/error-handler");
    const { qaAgentRoutes } = await import("./qa-agent.routes");
    const app = createOpenApiApp();

    app.onError(appErrorHandler);
    app.route("/", qaAgentRoutes);

    return app;
  }

  const pair = (app: Awaited<ReturnType<typeof createApp>>, body: unknown, ip = "203.0.113.7") =>
    app.request("/qa/agent/pair", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });

  const input = { code: "ABCD-EFGH", hostname: "bench-pc", platform: "win32", agentVersion: "0.1.0" };

  it("rejects an unknown or expired pairing code", async () => {
    const app = await createApp();
    const response = await pair(app, input);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      message: "Pairing code is invalid or has expired.",
    });
    expect(state.updates).toBe(1);
  });

  it("validates the pairing body", async () => {
    const app = await createApp();

    expect((await pair(app, { ...input, code: "" })).status).toBe(400);
    expect((await pair(app, { ...input, hostname: "h".repeat(256) })).status).toBe(400);
  });

  it("rate limits repeated failures from one address", async () => {
    const app = await createApp();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push((await pair(app, input, "198.51.100.9")).status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses[11]).toBe(429);
  });

  it("requires a bearer token before upgrading the websocket", async () => {
    const app = await createApp();

    expect((await app.request("/qa/agent/ws")).status).toBe(401);
    expect((await app.request("/qa/agent/ws", { headers: { authorization: "Bearer unknown-token" } })).status).toBe(401);
  });
});

