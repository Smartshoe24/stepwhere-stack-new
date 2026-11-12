import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminMiddleware } from "./admin";
import { isAppError } from "../shared/errors";

const state = vi.hoisted(() => ({
  hasCredentialAccount: true,
}));

vi.mock("../db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (
            state.hasCredentialAccount ? [{ id: "credential-account-id" }] : []
          )),
        })),
      })),
    })),
  },
}));

type MockUser = {
  banned: boolean;
  onboardingCompleted: boolean;
  role: "admin" | "user";
  status: "active" | "suspended";
};

function buildApp(user: MockUser | null) {
  const app = new Hono<{ Variables: { user: MockUser } }>();

  app.onError((error, c) => {
    if (isAppError(error)) {
      return new Response(
        JSON.stringify({ error: { code: error.code, message: error.message } }),
        {
          headers: { "content-type": "application/json" },
          status: error.status,
        },
      );
    }

    throw error;
  });

  app.use("*", async (c, next) => {
    if (user) {
      c.set("user", user);
    }

    await next();
  });
  app.use("*", adminMiddleware);
  app.get("/", (c) => c.json({ ok: true }));

  return app;
}

describe("adminMiddleware", () => {
  beforeEach(() => {
    state.hasCredentialAccount = true;
  });

  it("allows active email platform admins even when mobile onboarding is incomplete", async () => {
    const app = buildApp({
      banned: false,
      onboardingCompleted: false,
      role: "admin",
      status: "active",
    });

    const response = await app.request("/");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects non-admin users", async () => {
    const app = buildApp({
      banned: false,
      onboardingCompleted: true,
      role: "user",
      status: "active",
    });

    const response = await app.request("/");

    expect(response.status).toBe(403);
  });

  it("rejects suspended admins", async () => {
    const app = buildApp({
      banned: false,
      onboardingCompleted: false,
      role: "admin",
      status: "suspended",
    });

    const response = await app.request("/");

    expect(response.status).toBe(403);
  });

  it("rejects banned admins", async () => {
    const app = buildApp({
      banned: true,
      onboardingCompleted: false,
      role: "admin",
      status: "active",
    });

    const response = await app.request("/");

    expect(response.status).toBe(403);
  });

  it("rejects admins without an email credential account", async () => {
    state.hasCredentialAccount = false;
    const app = buildApp({
      banned: false,
      onboardingCompleted: false,
      role: "admin",
      status: "active",
    });

    const response = await app.request("/");

    expect(response.status).toBe(403);
  });
});
