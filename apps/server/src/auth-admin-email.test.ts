import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type MockUser = {
  banned: boolean;
  credentialAccountId: string | null;
  email: string;
  role: "admin" | "user";
  status: "active" | "suspended";
};

const state = vi.hoisted(() => ({
  usersByEmail: new Map<string, MockUser>(),
}));

vi.mock("./db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const query = {
          innerJoin: vi.fn(() => query),
          leftJoin: vi.fn(() => query),
          where: vi.fn(() => {
            return {
              limit: vi.fn(async () => {
                const firstUser = [...state.usersByEmail.values()][0];
                return firstUser ? [firstUser] : [];
              }),
            };
          }),
        };

        return query;
      }),
    })),
  },
}));

let app: typeof import("./app").app;

describe("admin email/password auth controls", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.PORT = "3001";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    process.env.ADMIN_AUTH_ALLOWED_ORIGINS = "https://panel.stepwhere.in";
    process.env.AWS_REGION = "ap-south-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key";
    process.env.AWS_S3_STORAGE_BUCKET = "stepwhere-test-storage";
    process.env.DEVICE_INGEST_API_KEY = "test-device-ingest-api-key";
    process.env.DEVICE_PROVISIONING_SECRET = "test-provisioning-secret";

    ({ app } = await import("./app"));
  }, 30_000);

  beforeEach(() => {
    state.usersByEmail.clear();
  });

  it("rejects email sign-up even while no admin exists", async () => {
    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://panel.stepwhere.in",
      },
      body: JSON.stringify({
        name: "Admin User",
        email: "admin@example.com",
        password: "super-secret-password",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADMIN_SIGNUP_DISABLED",
    });
  });

  it("rejects non-admin email/password sign-in before Better Auth verifies the password", async () => {
    state.usersByEmail.set("user@example.com", {
      banned: false,
      credentialAccountId: "credential-account-id",
      email: "user@example.com",
      role: "user",
      status: "active",
    });

    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://panel.stepwhere.in",
      },
      body: JSON.stringify({
        email: "user@example.com",
        password: "super-secret-password",
      }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects credential-less phone admins from email/password sign-in", async () => {
    state.usersByEmail.set("admin@example.com", {
      banned: false,
      credentialAccountId: null,
      email: "admin@example.com",
      role: "admin",
      status: "active",
    });

    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://panel.stepwhere.in",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "super-secret-password",
      }),
    });

    expect(response.status).toBe(401);
  });
});
