import { verifyPassword } from "better-auth/crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  [key: string]: unknown;
};

type StoredAccount = {
  userId: string;
  providerId: string;
  accountId: string;
  password: string | null;
};

/**
 * In-memory stand-in for the parts of Drizzle the setup service uses. It keeps
 * real transaction semantics that matter here: writes only land on commit, and
 * `pg_advisory_xact_lock` serializes transactions until they finish.
 */
const store = vi.hoisted(() => ({
  users: [] as StoredUser[],
  accounts: [] as StoredAccount[],
  advisoryLockCalls: 0,
  lockTail: Promise.resolve() as Promise<void>,
}));

vi.mock("../../db/client", async () => {
  const { users } = await import("../../db/schema");
  const dialect = new PgDialect();

  function filterUsers(rows: StoredUser[], condition: unknown) {
    const { sql: text, params } = dialect.sqlToQuery(condition as never);

    if (text.includes("\"role\"")) {
      return rows.filter((row) => row.role === params[0]);
    }

    if (text.includes("\"email\"")) {
      return rows.filter((row) => row.email === params[0]);
    }

    throw new Error(`Unexpected users filter: ${text}`);
  }

  function createExecutor(view: () => StoredUser[], pending?: { users: StoredUser[]; accounts: StoredAccount[] }) {
    return {
      select: () => ({
        from: (table: unknown) => {
          if (table !== users) {
            throw new Error("Unexpected table in select");
          }

          return {
            where: (condition: unknown) => ({
              limit: async (count: number) => filterUsers(view(), condition)
                .slice(0, count)
                .map((row) => ({ id: row.id })),
            }),
          };
        },
      }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          if (!pending) {
            throw new Error("Inserts must run in a transaction");
          }

          if (table === users) {
            const row = { id: `user-${store.users.length + pending.users.length + 1}`, ...values } as StoredUser;
            pending.users.push(row);
            return { returning: async () => [{ id: row.id }] };
          }

          pending.accounts.push(values as StoredAccount);
          return Promise.resolve();
        },
      }),
    };
  }

  return {
    db: {
      ...createExecutor(() => store.users),
      transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
        const pending = { users: [] as StoredUser[], accounts: [] as StoredAccount[] };
        let releaseLock: (() => void) | null = null;

        const tx = {
          ...createExecutor(() => [...store.users, ...pending.users], pending),
          execute: async (query: unknown) => {
            const { sql: text } = dialect.sqlToQuery(query as never);
            if (!text.includes("pg_advisory_xact_lock")) {
              throw new Error(`Unexpected execute: ${text}`);
            }

            store.advisoryLockCalls += 1;
            const previous = store.lockTail;
            store.lockTail = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await previous;
          },
        };

        try {
          const result = await work(tx);
          store.users.push(...pending.users);
          store.accounts.push(...pending.accounts);
          return result;
        } finally {
          (releaseLock as (() => void) | null)?.();
        }
      },
    },
  };
});

vi.mock("../../infrastructure/better-auth", async () => {
  const { hashPassword } = await import("better-auth/crypto");
  return {
    auth: {
      $context: Promise.resolve({ password: { hash: hashPassword } }),
    },
  };
});

const { env } = await import("../../config/env");
const { appErrorHandler } = await import("../../middlewares/error-handler");
const { createOpenApiApp } = await import("../../openapi/create-app");
const { adminSetupRoutes } = await import("./admin-setup.routes");
const { isValidSetupCode, resetAdminSetupRateLimits } = await import("./admin-setup.service");

const SETUP_CODE = "test-setup-code-0123456789abcdef";
const PASSWORD = "correct horse battery";

const app = createOpenApiApp();
app.onError(appErrorHandler);
app.route("/v1", adminSetupRoutes);

function getStatus() {
  return app.request("/v1/admin/setup");
}

function postSetup(body: Record<string, unknown>, clientIp = "203.0.113.10") {
  return app.request("/v1/admin/setup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
    },
    body: JSON.stringify(body),
  });
}

describe("first-run admin setup", () => {
  const originalCode = env.ADMIN_SETUP_CODE;
  const originalEmail = env.INITIAL_ADMIN_EMAIL;

  beforeEach(() => {
    store.users = [];
    store.accounts = [];
    store.advisoryLockCalls = 0;
    store.lockTail = Promise.resolve();
    env.ADMIN_SETUP_CODE = SETUP_CODE;
    env.INITIAL_ADMIN_EMAIL = "admin@stepwhere.in";
    resetAdminSetupRateLimits();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    env.ADMIN_SETUP_CODE = originalCode;
    env.INITIAL_ADMIN_EMAIL = originalEmail;
    vi.restoreAllMocks();
  });

  describe("GET /v1/admin/setup", () => {
    it("is required on an empty database", async () => {
      const response = await getStatus();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        data: { required: true, email: "admin@stepwhere.in" },
      });
    });

    it("stays required when only regular users exist", async () => {
      store.users.push({ id: "u1", email: "parent@example.com", role: "user" });

      await expect((await getStatus()).json()).resolves.toEqual({
        data: { required: true, email: "admin@stepwhere.in" },
      });
    });

    it("is not required once any admin exists", async () => {
      store.users.push({ id: "u1", email: "someone@example.com", role: "admin" });

      await expect((await getStatus()).json()).resolves.toEqual({
        data: { required: false, email: "admin@stepwhere.in" },
      });
    });

    it("is not required when ADMIN_SETUP_CODE is unset", async () => {
      env.ADMIN_SETUP_CODE = undefined;

      await expect((await getStatus()).json()).resolves.toEqual({
        data: { required: false, email: "admin@stepwhere.in" },
      });
    });

    it("reports INITIAL_ADMIN_EMAIL", async () => {
      env.INITIAL_ADMIN_EMAIL = "ops@stepwhere.in";

      await expect((await getStatus()).json()).resolves.toMatchObject({
        data: { email: "ops@stepwhere.in" },
      });
    });
  });

  describe("POST /v1/admin/setup", () => {
    it("creates the admin with a Better Auth credential account, then answers 404", async () => {
      const response = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: { email: "admin@stepwhere.in" },
      });

      expect(store.users).toHaveLength(1);
      const [user] = store.users;
      expect(user).toMatchObject({
        email: "admin@stepwhere.in",
        role: "admin",
        status: "active",
        onboardingCompleted: true,
      });
      expect(String(user!.phoneNumber)).toMatch(/^admin:/);

      expect(store.accounts).toHaveLength(1);
      const [account] = store.accounts;
      expect(account).toMatchObject({
        userId: user!.id,
        providerId: "credential",
        accountId: user!.id,
      });
      expect(account!.password).not.toBe(PASSWORD);
      await expect(verifyPassword({ hash: account!.password!, password: PASSWORD })).resolves.toBe(true);
      expect(store.advisoryLockCalls).toBe(1);

      const again = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE });
      expect(again.status).toBe(404);
      expect((await getStatus()).status).toBe(200);
      await expect((await getStatus()).json()).resolves.toMatchObject({ data: { required: false } });
      expect(store.users).toHaveLength(1);
    });

    it("answers 404 when an admin already exists, even with a wrong code", async () => {
      store.users.push({ id: "u1", email: "someone@example.com", role: "admin" });

      const response = await postSetup({ password: PASSWORD, setupCode: "wrong" });

      expect(response.status).toBe(404);
      expect(store.advisoryLockCalls).toBe(0);
    });

    it("rejects a wrong setup code", async () => {
      const response = await postSetup({ password: PASSWORD, setupCode: `${SETUP_CODE}x` });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
      expect(store.users).toHaveLength(0);
    });

    it("is disabled (404) when ADMIN_SETUP_CODE is unset", async () => {
      env.ADMIN_SETUP_CODE = undefined;

      const response = await postSetup({ password: PASSWORD, setupCode: "" });

      expect(response.status).toBe(404);
      expect(store.users).toHaveLength(0);
    });

    it("rejects passwords shorter than 12 characters", async () => {
      const response = await postSetup({ password: "elevenchars", setupCode: SETUP_CODE });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        message: "Password must be at least 12 characters long.",
      });
      expect(store.users).toHaveLength(0);
    });

    it("accepts a password of exactly 12 characters", async () => {
      const response = await postSetup({ password: "twelve-chars", setupCode: SETUP_CODE });

      expect(response.status).toBe(200);
    });

    it("refuses to take over an existing non-admin user with the same email", async () => {
      store.users.push({ id: "u1", email: "admin@stepwhere.in", role: "user" });

      const response = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE });

      expect(response.status).toBe(409);
      expect(store.accounts).toHaveLength(0);
    });

    it("lets exactly one of several concurrent attempts succeed", async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          postSetup({ password: `${PASSWORD} ${index}`, setupCode: SETUP_CODE }, `198.51.100.${index}`)),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 404, 404, 404, 404]);
      expect(store.users.filter((user) => user.role === "admin")).toHaveLength(1);
      expect(store.accounts).toHaveLength(1);
      // Every attempt passed the pre-check and was settled under the lock.
      expect(store.advisoryLockCalls).toBe(5);
    });

    it("rate limits repeated wrong codes per client", async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await postSetup({ password: PASSWORD, setupCode: "wrong" })).status).toBe(403);
      }

      const limited = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE });
      expect(limited.status).toBe(429);
      expect(store.users).toHaveLength(0);

      // Another client is still allowed.
      const other = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE }, "203.0.113.99");
      expect(other.status).toBe(200);
    });

    it("caps wrong codes globally across spoofed client addresses", async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await postSetup({ password: PASSWORD, setupCode: "wrong" }, `192.0.2.${attempt}`);
      }

      const limited = await postSetup({ password: PASSWORD, setupCode: SETUP_CODE }, "192.0.2.200");
      expect(limited.status).toBe(429);
    });
  });

  describe("isValidSetupCode", () => {
    it("matches only the exact code", () => {
      expect(isValidSetupCode(SETUP_CODE, SETUP_CODE)).toBe(true);
      expect(isValidSetupCode("", SETUP_CODE)).toBe(false);
      expect(isValidSetupCode(SETUP_CODE.slice(0, -1), SETUP_CODE)).toBe(false);
      expect(isValidSetupCode(`${SETUP_CODE} `, SETUP_CODE)).toBe(false);
    });
  });
});
