import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  adminCalls: 0,
  familyMemberCalls: 0,
}));

vi.mock("./middlewares/auth", () => ({
  authMiddleware: vi.fn(async (c: any, next: () => Promise<void>) => {
    c.set("session", {
      id: "session-id",
      userId: "admin-user-id",
      activeOrganizationId: null,
    });
    c.set("user", {
      id: "admin-user-id",
      email: "admin@example.com",
      role: "admin",
      status: "active",
      banned: false,
      onboardingCompleted: false,
    });

    await next();
  }),
}));

vi.mock("./middlewares/admin", () => ({
  adminMiddleware: vi.fn(async (_c: any, next: () => Promise<void>) => {
    state.adminCalls += 1;
    await next();
  }),
}));

vi.mock("./modules/family/family.middleware", () => ({
  familyAdminMiddleware: vi.fn(async (_c: any, next: () => Promise<void>) => {
    await next();
  }),
  familyMemberMiddleware: vi.fn(async (c: any, next: () => Promise<void>) => {
    state.familyMemberCalls += 1;

    c.set("organization", {
      id: "family-id",
      name: "Example Family",
      slug: "example-family",
    });
    c.set("familyMember", {
      id: "member-id",
      role: "admin",
      userId: "admin-user-id",
      organizationId: "family-id",
    });

    await next();
  }),
}));

vi.mock("./modules/admin/admin.routes", async () => {
  const { Hono } = await import("hono");
  const adminRoutes = new Hono();

  adminRoutes.get("/admin/route-order", (c) => c.json({ ok: true }));

  return { adminRoutes };
});

vi.mock("./modules/places/places.routes", async () => {
  const { Hono } = await import("hono");
  const placesRoutes = new Hono();

  placesRoutes.get("/places/schools/autocomplete", (c) => c.json({
    data: [
      {
        provider: "google",
        providerPlaceId: "place-id",
        mainText: "Example School",
        secondaryText: "Example City",
      },
    ],
  }));

  return { placesRoutes };
});

vi.mock("./modules/children/children.routes", async () => {
  const { Hono } = await import("hono");
  const childrenRoutes = new Hono();

  childrenRoutes.post("/children", (c) => c.json({
    data: {
      id: "child-id",
      name: "Example Child",
    },
  }, 201));

  return { childrenRoutes };
});

vi.mock("./modules/admin-setup/admin-setup.service", () => ({
  ADMIN_SETUP_MAX_PASSWORD_LENGTH: 128,
  completeAdminSetup: vi.fn(async () => ({ email: "admin@stepwhere.in" })),
  getAdminSetupStatus: vi.fn(async () => ({ required: true, email: "admin@stepwhere.in" })),
}));

vi.mock("./infrastructure/better-auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
    handler: vi.fn(() => new Response(null, { status: 404 })),
  },
}));

let app: typeof import("./app").app;

describe("admin route ordering", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "3001";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    process.env.AWS_REGION = "ap-south-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key";
    process.env.AWS_S3_STORAGE_BUCKET = "stepwhere-test-storage";
    process.env.DEVICE_INGEST_API_KEY = "test-device-ingest-api-key";
    process.env.DEVICE_PROVISIONING_SECRET = "test-provisioning-secret";

    ({ app } = await import("./app"));
  }, 30_000);

  beforeEach(() => {
    state.adminCalls = 0;
    state.familyMemberCalls = 0;
  });

  it("routes platform admin API requests before family onboarding middleware", async () => {
    const response = await app.request("/v1/admin/route-order");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(state.adminCalls).toBe(1);
    expect(state.familyMemberCalls).toBe(0);
  });

  it("serves the first-run admin setup without auth or admin middleware", async () => {
    const status = await app.request("/v1/admin/setup");

    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toEqual({
      data: { required: true, email: "admin@stepwhere.in" },
    });

    const setup = await app.request("/v1/admin/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery", setupCode: "code" }),
    });

    expect(setup.status).toBe(200);
    expect(state.adminCalls).toBe(0);
    expect(state.familyMemberCalls).toBe(0);
  });

  it("routes school place lookup before admin and family middleware", async () => {
    const response = await app.request("/v1/places/schools/autocomplete?query=school");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          provider: "google",
          providerPlaceId: "place-id",
          mainText: "Example School",
          secondaryText: "Example City",
        },
      ],
    });
    expect(state.adminCalls).toBe(0);
    expect(state.familyMemberCalls).toBe(0);
  });

  it("routes child creation through family middleware and not admin middleware", async () => {
    const response = await app.request("/v1/children", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Example Child",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "child-id",
        name: "Example Child",
      },
    });
    expect(state.adminCalls).toBe(0);
    expect(state.familyMemberCalls).toBe(1);
  });
});
