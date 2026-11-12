import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import type { AdminSetupStatusDto } from "@stepwhere/types";
import { eq, sql } from "drizzle-orm";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { accounts, users } from "../../db/schema";
import { auth } from "../../infrastructure/better-auth";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../shared/errors";

/**
 * First-run admin setup (docs/infra/aws-migration-plan.md, section 11.2).
 *
 * While no user with role `admin` exists and ADMIN_SETUP_CODE is configured,
 * the admin panel can set the password for INITIAL_ADMIN_EMAIL once. The
 * account it creates is a normal Better Auth email/password credential, so the
 * existing admin sign-in works unchanged. Once any admin exists the endpoints
 * answer 404 for good.
 */

export const ADMIN_SETUP_MIN_PASSWORD_LENGTH = 12;
// Matches emailAndPassword.maxPasswordLength in better-auth.ts.
export const ADMIN_SETUP_MAX_PASSWORD_LENGTH = 128;

// Transaction-scoped advisory lock key, so two simultaneous setups can't both
// pass the "no admin yet" check.
const ADMIN_SETUP_LOCK_KEY = 0x5374_6570_6164; // "Stepad"

// Failed setup-code attempts. Per client, plus a global cap because
// X-Forwarded-For can be spoofed. Setup is a one-off, so a strict limit costs
// nothing.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_PER_CLIENT = 5;
const RATE_LIMIT_GLOBAL = 20;
const GLOBAL_RATE_LIMIT_KEY = "*";
const failedAttempts = new Map<string, { count: number; resetsAt: number }>();

function setupDisabled() {
  return notFound("NOT_FOUND", "Admin setup is not available.");
}

function isRateLimited(key: string, limit: number, now: number) {
  const entry = failedAttempts.get(key);
  return Boolean(entry && entry.resetsAt > now && entry.count >= limit);
}

function recordFailedAttempt(key: string, now: number) {
  const entry = failedAttempts.get(key);

  if (!entry || entry.resetsAt <= now) {
    failedAttempts.set(key, { count: 1, resetsAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  entry.count += 1;
}

function assertNotRateLimited(clientKey: string) {
  const now = Date.now();

  if (
    isRateLimited(clientKey, RATE_LIMIT_PER_CLIENT, now)
    || isRateLimited(GLOBAL_RATE_LIMIT_KEY, RATE_LIMIT_GLOBAL, now)
  ) {
    throw new AppError(429, "RATE_LIMITED", "Too many setup attempts. Try again later.");
  }
}

function recordFailedSetupCode(clientKey: string) {
  const now = Date.now();
  recordFailedAttempt(clientKey, now);
  recordFailedAttempt(GLOBAL_RATE_LIMIT_KEY, now);
}

/** Test hook: clears the in-memory rate limiter. */
export function resetAdminSetupRateLimits() {
  failedAttempts.clear();
}

/** Constant-time comparison; hashing first hides length differences. */
export function isValidSetupCode(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

async function adminExists(executor: Pick<typeof db, "select"> = db) {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  return Boolean(row);
}

export async function getAdminSetupStatus(): Promise<AdminSetupStatusDto> {
  const email = env.INITIAL_ADMIN_EMAIL;

  if (!env.ADMIN_SETUP_CODE) {
    return { required: false, email };
  }

  return {
    required: !(await adminExists()),
    email,
  };
}

async function hashAdminPassword(password: string) {
  // Use Better Auth's configured hasher so sign-in can verify it.
  const context = await auth.$context;
  return context.password.hash(password);
}

export async function completeAdminSetup(input: {
  password: string;
  setupCode: string;
  clientKey: string;
}) {
  const expectedCode = env.ADMIN_SETUP_CODE;

  if (!expectedCode) {
    throw setupDisabled();
  }

  // Once an admin exists, setup is gone: 404 before anything else, so a closed
  // setup never reveals whether a code is right.
  if (await adminExists()) {
    throw setupDisabled();
  }

  assertNotRateLimited(input.clientKey);

  if (!isValidSetupCode(input.setupCode, expectedCode)) {
    recordFailedSetupCode(input.clientKey);
    console.warn("[admin-setup] rejected setup attempt: invalid setup code");
    throw forbidden("Invalid setup code.");
  }

  if (input.password.length < ADMIN_SETUP_MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${ADMIN_SETUP_MIN_PASSWORD_LENGTH} characters long.`);
  }

  if (input.password.length > ADMIN_SETUP_MAX_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at most ${ADMIN_SETUP_MAX_PASSWORD_LENGTH} characters long.`);
  }

  const email = env.INITIAL_ADMIN_EMAIL;
  // Hash outside the transaction: scrypt is slow and the lock should be short.
  const passwordHash = await hashAdminPassword(input.password);

  const userId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SETUP_LOCK_KEY})`);

    if (await adminExists(tx)) {
      throw setupDisabled();
    }

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw conflict(`A non-admin user with ${email} already exists.`);
    }

    // Same shape the old Better Auth email sign-up produced: an active admin
    // with a placeholder phone number (phone_number is required and unique)
    // and a `credential` account whose accountId is the user id.
    const [user] = await tx
      .insert(users)
      .values({
        name: "Stepwhere Admin",
        email,
        emailVerified: false,
        phoneNumber: `admin:${randomUUID()}`,
        phoneNumberVerified: false,
        role: "admin",
        status: "active",
        onboardingCompleted: true,
      })
      .returning({ id: users.id });

    if (!user) {
      throw new Error("Failed to create the admin user.");
    }

    await tx.insert(accounts).values({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: passwordHash,
    });

    return user.id;
  });

  console.info("[admin-setup] initial admin created", { userId, email });

  return { email };
}
