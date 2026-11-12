import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../config/env";
import {
  childDeviceBindings,
  deviceActivations,
  deviceCoverageIntervals,
  deviceOwnerships,
  familySubscriptions,
} from "../../db/schema";
import { AppError } from "../../shared/errors";

// Rows each table returns, consumed in query order. Anything not queued
// returns no rows.
const queuedRows = new Map<unknown, unknown[][]>();
const inserts: Array<{ table: unknown; values: unknown; onConflictUpdate?: unknown }> = [];
const selectedTables: unknown[] = [];

function queue(table: unknown, ...results: unknown[][]) {
  queuedRows.set(table, [...(queuedRows.get(table) ?? []), ...results]);
}

function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["where", "limit", "innerJoin", "leftJoin", "orderBy", "for"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

const fakeTx = {
  execute: vi.fn(async () => []),
  select: vi.fn(() => ({
    from: (table: unknown) => {
      selectedTables.push(table);
      return query(queuedRows.get(table)?.shift() ?? []);
    },
  })),
  insert: vi.fn((table: unknown) => ({
    values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const record: { table: unknown; values: unknown; onConflictUpdate?: unknown } = { table, values };
      inserts.push(record);
      const result: Record<string, unknown> = {
        onConflictDoNothing: () => result,
        onConflictDoUpdate: (config: unknown) => {
          record.onConflictUpdate = config;
          return result;
        },
        returning: async () => (Array.isArray(values) ? values : [values]),
      };
      result.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(undefined).then(resolve, reject);
      return result;
    },
  })),
  update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
};

vi.mock("../../db/client", () => ({
  db: {
    select: (...args: unknown[]) => fakeTx.select(...(args as [])),
    execute: (...args: unknown[]) => fakeTx.execute(...(args as [])),
    transaction: async (callback: (tx: typeof fakeTx) => unknown) => callback(fakeTx),
  },
}));

const { billingEnforced, childHasCoverage, requireChildCoverage } = await import("./billing-coverage.service");
const { claimDevice } = await import("./billing-ownership.service");
const { releaseOwnedDevice } = await import("./billing-admin.service");
const { PLAY_REVIEW_COVERAGE_GRANT_KEY, provisionPlayReviewDeviceBilling } = await import(
  "../play-review/play-review-billing.service"
);

const FAMILY = "11111111-1111-4111-8111-111111111111";
const OTHER_FAMILY = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  queuedRows.clear();
  inserts.length = 0;
  selectedTables.length = 0;
  vi.clearAllMocks();
  env.BILLING_ENFORCEMENT_ENABLED = false;
  env.BILLING_PILOT_ORGANIZATION_IDS = [];
  env.BILLING_DEVICE_OWNERSHIP_ENABLED = true;
});

function insertsInto(table: unknown) {
  return inserts.filter((insert) => insert.table === table);
}

describe("billingEnforced", () => {
  it("is off by default", () => {
    expect(billingEnforced(FAMILY)).toBe(false);
  });

  it("turns on for every family with the global flag", () => {
    env.BILLING_ENFORCEMENT_ENABLED = true;
    expect(billingEnforced(FAMILY)).toBe(true);
    expect(billingEnforced(OTHER_FAMILY)).toBe(true);
  });

  it("turns on only for pilot families", () => {
    env.BILLING_PILOT_ORGANIZATION_IDS = [FAMILY];
    expect(billingEnforced(FAMILY)).toBe(true);
    expect(billingEnforced(OTHER_FAMILY)).toBe(false);
  });
});

describe("coverage gates", () => {
  it("never touches the database while enforcement is off", async () => {
    await expect(childHasCoverage(FAMILY, CHILD)).resolves.toBe(true);
    await expect(requireChildCoverage(FAMILY, CHILD)).resolves.toBeUndefined();
    expect(selectedTables).toEqual([]);
  });

  it("rejects an uncovered child with 403 SUBSCRIPTION_REQUIRED", async () => {
    env.BILLING_ENFORCEMENT_ENABLED = true;
    queue(childDeviceBindings, [{ deviceId: DEVICE }]);
    queue(deviceCoverageIntervals, []);

    const error = await requireChildCoverage(FAMILY, CHILD).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 403, code: "SUBSCRIPTION_REQUIRED" });
  });

  it("treats a child without a bound shoe as uncovered", async () => {
    env.BILLING_ENFORCEMENT_ENABLED = true;
    queue(childDeviceBindings, []);

    await expect(childHasCoverage(FAMILY, CHILD)).resolves.toBe(false);
  });

  it("lets a covered child through", async () => {
    env.BILLING_ENFORCEMENT_ENABLED = true;
    queue(childDeviceBindings, [{ deviceId: DEVICE }]);
    queue(deviceCoverageIntervals, [{ id: "grant" }]);

    await expect(requireChildCoverage(FAMILY, CHILD)).resolves.toBeUndefined();
  });
});

describe("claimDevice", () => {
  it("records the family's claim and starts the trial on first bind", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    await claimDevice(fakeTx as never, DEVICE, FAMILY, USER, now);

    expect(insertsInto(deviceOwnerships)).toHaveLength(1);
    expect(insertsInto(deviceOwnerships)[0].values).toMatchObject({ deviceId: DEVICE, organizationId: FAMILY, claimedByUserId: USER });
    const grants = insertsInto(deviceCoverageIntervals)[0].values as Array<{ source: string; endsAt: Date }>;
    expect(grants.map((grant) => grant.source)).toEqual(["trial", "grace"]);
    expect(grants[0].endsAt.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("refuses a shoe owned by another family with 409 DEVICE_BOUND_ELSEWHERE", async () => {
    queue(deviceOwnerships, [{ deviceId: DEVICE, organizationId: OTHER_FAMILY, releasedAt: null }]);

    const error = await claimDevice(fakeTx as never, DEVICE, FAMILY, USER).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 409, code: "DEVICE_BOUND_ELSEWHERE" });
    expect(inserts).toEqual([]);
  });

  it("records no claim and raises no 409 when ownership is switched off", async () => {
    env.BILLING_DEVICE_OWNERSHIP_ENABLED = false;
    queue(deviceOwnerships, [{ deviceId: DEVICE, organizationId: OTHER_FAMILY, releasedAt: null }]);

    await expect(claimDevice(fakeTx as never, DEVICE, FAMILY, USER)).resolves.toBeUndefined();
    expect(insertsInto(deviceOwnerships)).toEqual([]);
    expect(selectedTables).not.toContain(deviceOwnerships);
  });
});

describe("releaseOwnedDevice", () => {
  const owner = { id: "ownership-1", deviceId: DEVICE, organizationId: FAMILY, releasedAt: null };

  it("refuses while the shoe is still bound to a child", async () => {
    queue(deviceOwnerships, [owner], [owner]);
    queue(familySubscriptions, []);
    queue(childDeviceBindings, [{ childId: CHILD, deviceId: DEVICE }]);

    const error = await releaseOwnedDevice(USER, DEVICE, "Returned shoe, moving on").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 409 });
    expect((error as Error).message).toMatch(/still bound to a child/);
  });

  it("releases an unbound shoe and records it in the audit log", async () => {
    queue(deviceOwnerships, [owner], [owner]);
    queue(familySubscriptions, [], []);
    queue(childDeviceBindings, []);

    await expect(releaseOwnedDevice(USER, DEVICE, "Returned shoe, moving on")).resolves.toEqual({ deviceId: DEVICE, released: true });
    expect(fakeTx.update).toHaveBeenCalled();
    expect(inserts.some((insert) => (insert.values as { action?: string }).action === "release_device_ownership")).toBe(true);
  });
});

describe("provisionPlayReviewDeviceBilling", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");

  it("claims the shoe and grants support coverage spanning the seeded history", async () => {
    const window = await provisionPlayReviewDeviceBilling(fakeTx as never, {
      deviceId: DEVICE,
      organizationId: FAMILY,
      userId: USER,
      now,
    });

    expect(insertsInto(deviceOwnerships)).toHaveLength(1);
    const support = insertsInto(deviceCoverageIntervals).find(
      (insert) => (insert.values as { source?: string }).source === "support",
    );
    expect(support?.values).toMatchObject({
      deviceId: DEVICE,
      organizationId: FAMILY,
      grantKey: PLAY_REVIEW_COVERAGE_GRANT_KEY,
      startsAt: new Date("2026-10-24T00:00:00.000Z"),
      endsAt: new Date("2036-11-01T00:00:00.000Z"),
    });
    expect(window.startsAt.getTime()).toBeLessThan(now.getTime() - 7 * 86_400_000);
  });

  it("upserts the same grant when run again", async () => {
    queue(deviceOwnerships, [], [{ deviceId: DEVICE, organizationId: FAMILY, releasedAt: null }]);
    queue(deviceActivations, [{ deviceId: DEVICE, trialEndsAt: now, trialConvertedAt: null }]);

    await provisionPlayReviewDeviceBilling(fakeTx as never, { deviceId: DEVICE, organizationId: FAMILY, userId: USER, now });

    expect(insertsInto(deviceOwnerships)).toEqual([]);
    const support = insertsInto(deviceCoverageIntervals).find(
      (insert) => (insert.values as { source?: string }).source === "support",
    );
    expect(support?.onConflictUpdate).toMatchObject({
      target: [deviceCoverageIntervals.deviceId, deviceCoverageIntervals.grantKey, deviceCoverageIntervals.source],
      set: { revokedAt: null },
    });
  });
});
