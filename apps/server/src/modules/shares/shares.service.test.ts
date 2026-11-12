import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryResult } from "../../test/drizzle-chain-mock";

const dbMocks = vi.hoisted(() => ({
  results: [] as unknown[],
  selectCalls: 0,
}));
const childMocks = vi.hoisted(() => ({
  getChildForOrganization: vi.fn(),
}));
const revocationMocks = vi.hoisted(() => ({
  expireShareLinkIfNeeded: vi.fn(async () => undefined),
}));

function next() {
  return queryResult(dbMocks.results.shift() ?? []);
}

vi.mock("../../db/client", () => ({
  db: {
    select: vi.fn(() => {
      dbMocks.selectCalls += 1;
      return next();
    }),
    update: vi.fn(() => next()),
    transaction: vi.fn(),
  },
}));
vi.mock("../children/children.service", () => childMocks);
vi.mock("./share-revocation", () => revocationMocks);

import {
  createShareLink,
  getPublicShareResponseByRawToken,
  getPublicShareSocketContext,
  revokeShareLink,
} from "./shares.service";

const NOW = new Date("2026-09-30T10:00:00.000Z");

function childRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    parentUserId: "user-1",
    organizationId: "org-1",
    name: "Aarav Anand",
    avatarUrl: null,
    schoolName: null,
    schoolPlaceId: null,
    gender: null,
    dateOfBirth: null,
    creationIdempotencyKey: null,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function shareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-1",
    childId: "child-1",
    tokenHash: "hash",
    startsAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    status: "active",
    revokedAt: null,
    createdByUserId: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    childId: "child-1",
    lastSeenAt: new Date(NOW.getTime() - 30_000),
    lastDeviceState: "active",
    lastGpsConnected: false,
    lastGpsFixAt: new Date(NOW.getTime() - 20 * 60_000),
    status: "safe",
    statusLabel: "Online",
    lastLatitude: "18.5204",
    lastLongitude: "73.8567",
    lastLocationSource: "cell",
    lastLocationAccuracyMeters: "850",
    lastLocationAt: new Date(NOW.getTime() - 30_000),
    lastLocationLabel: null,
    ...overrides,
  };
}

function deviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "device-1",
    hardwareIdentifier: "SHOE-1",
    displayName: null,
    platform: "embedded",
    status: "active",
    lastSeenAt: NOW,
    ...overrides,
  };
}

describe("shares.service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    dbMocks.results = [];
    dbMocks.selectCalls = 0;
    vi.clearAllMocks();
  });

  it("refuses to create a link for an archived child", async () => {
    childMocks.getChildForOrganization.mockResolvedValue({ lifecycleStatus: "archived" });

    await expect(createShareLink({
      childId: "child-1",
      create: { durationMinutes: 60 },
      organizationId: "org-1",
      userId: "user-1",
    })).rejects.toMatchObject({ status: 409 });
  });

  it("treats a still-active link for an archived child as unavailable", async () => {
    dbMocks.results.push([{
      share: shareRow(),
      child: childRow({ status: "archived" }),
      snapshot: snapshotRow(),
      device: null,
    }]);

    await expect(getPublicShareResponseByRawToken("v1.share-1.sig"))
      .rejects.toMatchObject({ status: 410, code: "SHARE_LINK_UNAVAILABLE" });
  });

  it("maps the snapshot with the same device-aware gpsState as socket pushes", async () => {
    dbMocks.results.push([{
      share: shareRow(),
      child: childRow(),
      snapshot: snapshotRow({ lastGpsConnected: true, lastLocationSource: "gps" }),
      device: deviceRow({ status: "blocked" }),
    }]);

    const response = await getPublicShareResponseByRawToken("v1.share-1.sig");

    // A blocked device reads as offline; the old snapshot path said "connected".
    expect(response.child.gpsState).toBe("offline");
    expect(response.child.childName).toBe("Aarav");
  });

  it("passes cell estimates through with their accuracy", async () => {
    dbMocks.results.push([{
      share: shareRow(),
      child: childRow(),
      snapshot: snapshotRow(),
      device: deviceRow(),
    }]);

    const response = await getPublicShareResponseByRawToken("v1.share-1.sig");

    expect(response.child.resolvedPosition).toEqual({
      latitude: 18.5204,
      longitude: 73.8567,
      source: "cell",
      accuracyMeters: 850,
      observedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    });
    expect(response.child.gpsState).toBe("acquiring");
  });

  it("builds the socket context and initial snapshot from a single lookup", async () => {
    dbMocks.results.push([{
      share: shareRow(),
      child: childRow(),
      snapshot: snapshotRow(),
      device: deviceRow(),
    }]);

    const context = await getPublicShareSocketContext("v1.share-1.sig");

    expect(dbMocks.selectCalls).toBe(1);
    expect(context).toMatchObject({
      shareId: "share-1",
      childId: "child-1",
      snapshot: { status: "active", child: { childName: "Aarav" } },
    });
  });

  describe("revokeShareLink", () => {
    beforeEach(() => {
      childMocks.getChildForOrganization.mockResolvedValue({ lifecycleStatus: "active" });
    });

    it("reports an already-expired link as expired instead of revoked", async () => {
      dbMocks.results.push(
        [],
        [shareRow({ status: "expired", updatedAt: new Date(NOW.getTime() - 5_000) })],
      );

      const result = await revokeShareLink({ childId: "child-1", organizationId: "org-1", shareId: "share-1" });

      expect(result).toEqual({
        didRevoke: false,
        share: { id: "share-1", revokedAt: null, status: "expired" },
      });
    });

    it("marks a lapsed-but-active link expired and reports it as such", async () => {
      dbMocks.results.push(
        [],
        [shareRow({ expiresAt: new Date(NOW.getTime() - 1_000) })],
      );

      const result = await revokeShareLink({ childId: "child-1", organizationId: "org-1", shareId: "share-1" });

      expect(result.share.status).toBe("expired");
      expect(revocationMocks.expireShareLinkIfNeeded).toHaveBeenCalledWith("share-1");
    });

    it("keeps the original timestamp for a link that was already revoked", async () => {
      const revokedAt = new Date(NOW.getTime() - 10_000);
      dbMocks.results.push([], [shareRow({ status: "revoked", revokedAt })]);

      const result = await revokeShareLink({ childId: "child-1", organizationId: "org-1", shareId: "share-1" });

      expect(result).toEqual({
        didRevoke: false,
        share: { id: "share-1", revokedAt: revokedAt.toISOString(), status: "revoked" },
      });
    });

    it("revokes a live link", async () => {
      dbMocks.results.push([shareRow({ status: "revoked" })]);

      const result = await revokeShareLink({ childId: "child-1", organizationId: "org-1", shareId: "share-1" });

      expect(result).toEqual({
        didRevoke: true,
        share: { id: "share-1", revokedAt: NOW.toISOString(), status: "revoked" },
      });
    });
  });
});
