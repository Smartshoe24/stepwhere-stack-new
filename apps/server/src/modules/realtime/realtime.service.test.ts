import { describe, expect, it } from "vitest";

import { realtimeRegistry } from "./realtime.service";

describe("realtimeRegistry", () => {
  it("broadcasts only to registered parent connections", () => {
    const messages: string[] = [];
    const ws = {
      readyState: 1 as const,
      send: (message: string) => {
        messages.push(message);
      },
    };

    realtimeRegistry.add("parent-1", ws as never);
    const stats = realtimeRegistry.broadcast("parent-1", {
      type: "child.updated",
      data: { child: { id: "child-1" } } as never,
    });
    realtimeRegistry.remove("parent-1", ws as never);

    expect(stats).toEqual({
      organizationId: "parent-1",
      eventType: "child.updated",
      connected: 1,
      sent: 1,
      skipped: 0,
    });
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0])).toEqual({
      type: "child.updated",
      data: { child: { id: "child-1" } },
    });
  });

  it("prunes closed connections while broadcasting", () => {
    const messages: string[] = [];
    const closedSocket = {
      readyState: 3 as const,
      send: () => {
        throw new Error("closed socket should not send");
      },
    };
    const openSocket = {
      readyState: 1 as const,
      send: (message: string) => {
        messages.push(message);
      },
    };

    realtimeRegistry.add("parent-2", closedSocket as never);
    realtimeRegistry.add("parent-2", openSocket as never);

    const stats = realtimeRegistry.broadcast("parent-2", {
      type: "overview.snapshot",
      data: {
        children: [],
        generatedAt: new Date().toISOString(),
        selectedChildId: null,
      },
    });

    expect(stats).toEqual({
      organizationId: "parent-2",
      eventType: "overview.snapshot",
      connected: 2,
      sent: 1,
      skipped: 1,
    });
    expect(messages).toHaveLength(1);

    realtimeRegistry.remove("parent-2", openSocket as never);
  });
});
