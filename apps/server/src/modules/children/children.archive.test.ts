import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryResult } from "../../test/drizzle-chain-mock";

const NOW = new Date("2026-09-30T10:00:00.000Z");

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  txResults: [] as unknown[],
  selectResults: [] as unknown[],
  revoke: vi.fn(),
  endShares: vi.fn(),
}));

vi.mock("../../db/client", () => {
  const tx = {
    select: vi.fn(() => queryResult(mocks.txResults.shift() ?? [])),
    update: vi.fn(() => queryResult(mocks.txResults.shift() ?? [])),
  };
  return {
    db: {
      select: vi.fn(() => queryResult(mocks.selectResults.shift() ?? [])),
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        const result = await fn(tx);
        mocks.order.push("commit");
        return result;
      }),
    },
  };
});
vi.mock("../plans/plans.service", () => ({
  getActiveSubscriptionForChild: vi.fn(async () => null),
}));
vi.mock("../shares/share-revocation", () => ({
  revokeActiveShareLinksForChildren: mocks.revoke,
}));
vi.mock("../shares/share-realtime.service", () => ({
  publicShareRealtimeRegistry: { endShares: mocks.endShares },
}));

import { archiveChildForOrganization } from "./children.service";

describe("archiveChildForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order = [];
    mocks.txResults = [];
    mocks.selectResults = [];
    mocks.revoke.mockImplementation(async () => {
      mocks.order.push("revoke");
      return ["share-1"];
    });
    mocks.endShares.mockImplementation(async () => {
      mocks.order.push("endShares");
    });
  });

  it("revokes the child's live links in the transaction and closes viewers after commit", async () => {
    // getChildForOrganization lookup
    mocks.selectResults.push([{
      child: {
        id: "child-1",
        parentUserId: "user-1",
        organizationId: "org-1",
        name: "Aarav",
        avatarUrl: null,
        schoolName: null,
        schoolPlaceId: null,
        gender: null,
        dateOfBirth: null,
        creationIdempotencyKey: null,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      },
      snapshot: null,
      device: null,
    }]);
    // tx: active binding select, archive update, unbind update (no binding)
    mocks.txResults.push([], [], []);

    const result = await archiveChildForOrganization("org-1", "child-1");

    expect(result).toEqual({ id: "child-1", archived: true, deviceHardwareIdentifier: null });
    expect(mocks.revoke).toHaveBeenCalledWith(expect.anything(), ["child-1"], expect.any(Date));
    expect(mocks.endShares).toHaveBeenCalledWith(["share-1"], "stopped");
    expect(mocks.order).toEqual(["revoke", "commit", "endShares"]);
  });
});
