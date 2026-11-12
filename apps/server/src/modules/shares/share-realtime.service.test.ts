import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./share-revocation", () => ({
  expireShareLinkIfNeeded: vi.fn(async () => undefined),
}));

import { expireShareLinkIfNeeded } from "./share-revocation";
import { publicShareRealtimeRegistry } from "./share-realtime.service";

describe("publicShareRealtimeRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("broadcasts updates only to registered child connections", async () => {
    const messages: string[] = [];
    const ws = {
      readyState: 1 as const,
      send: (message: string) => {
        messages.push(message);
      },
      close: vi.fn(),
    };

    publicShareRealtimeRegistry.add({
      shareId: "share-1",
      childId: "child-1",
      expiresAt: new Date(Date.now() + 60_000),
      socket: ws as never,
    });

    const stats = await publicShareRealtimeRegistry.broadcastChildUpdate("child-1", {
      childName: "Aarav",
      initials: "AA",
      avatarUrl: null,
      latitude: 18.5204,
      longitude: 73.8567,
      resolvedPosition: {
        latitude: 18.5204,
        longitude: 73.8567,
        source: "gps",
        accuracyMeters: 5,
        observedAt: "2026-06-09T18:00:00.000Z",
      },
      telemetryState: "active",
      gpsState: "connected",
      statusLabel: "Online",
      lastUpdatedAt: new Date().toISOString(),
    });

    publicShareRealtimeRegistry.remove(ws as never);

    expect(stats).toEqual({
      childId: "child-1",
      connected: 1,
      sent: 1,
      skipped: 0,
    });
    expect(JSON.parse(messages[0])).toEqual({
      type: "share.child.updated",
      data: expect.objectContaining({
        childName: "Aarav",
      }),
    });
  });

  it("expires sockets and prevents delivery after expiry", async () => {
    const messages: string[] = [];
    const ws = {
      readyState: 1 as const,
      send: (message: string) => {
        messages.push(message);
      },
      close: vi.fn(),
    };

    publicShareRealtimeRegistry.add({
      shareId: "share-2",
      childId: "child-2",
      expiresAt: new Date(Date.now() + 1_000),
      socket: ws as never,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const stats = await publicShareRealtimeRegistry.broadcastChildUpdate("child-2", {
      childName: "Mia",
      initials: "M",
      avatarUrl: null,
      latitude: null,
      longitude: null,
      resolvedPosition: null,
      telemetryState: "connecting",
      gpsState: "offline",
      statusLabel: "Connecting",
      lastUpdatedAt: null,
    });

    expect(stats).toEqual({
      childId: "child-2",
      connected: 0,
      sent: 0,
      skipped: 0,
    });
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({
      type: "share.ended",
      data: {
        endedAt: expect.any(String),
        reason: "expired",
      },
    });
    expect(ws.close).toHaveBeenCalled();
    expect(expireShareLinkIfNeeded).toHaveBeenCalledWith("share-2");
  });

  it("closes every viewer of the given shares with share.ended", async () => {
    const sockets = ["share-a", "share-a", "share-b"].map((shareId) => {
      const messages: string[] = [];
      const ws = {
        readyState: 1 as const,
        send: (message: string) => {
          messages.push(message);
        },
        close: vi.fn(),
      };
      publicShareRealtimeRegistry.add({
        shareId,
        childId: `child-${shareId}`,
        expiresAt: new Date(Date.now() + 60_000),
        socket: ws as never,
      });
      return { messages, ws };
    });

    await publicShareRealtimeRegistry.endShares(["share-a", "share-b", "share-missing"], "stopped");

    for (const { messages, ws } of sockets) {
      expect(messages.map((message) => JSON.parse(message))).toEqual([{
        type: "share.ended",
        data: { endedAt: expect.any(String), reason: "stopped" },
      }]);
      expect(ws.close).toHaveBeenCalledWith(4002, "share-stopped");
    }

    const stats = await publicShareRealtimeRegistry.broadcastChildUpdate("child-share-a", {
      childName: "Aarav",
      initials: "AA",
      avatarUrl: null,
      latitude: null,
      longitude: null,
      resolvedPosition: null,
      telemetryState: "active",
      gpsState: "connected",
      statusLabel: "Online",
      lastUpdatedAt: null,
    });
    expect(stats.connected).toBe(0);
    expect(expireShareLinkIfNeeded).not.toHaveBeenCalled();
  });
});
