import { describe, expect, it } from "vitest";

import { buildRealtimeAuthHeaders } from "./realtime-auth";

describe("buildRealtimeAuthHeaders", () => {
  it("adds bearer authorization from query token when needed", () => {
    const headers = buildRealtimeAuthHeaders(new Headers(), "token-123");

    expect(headers.get("authorization")).toBe("Bearer token-123");
  });

  it("preserves an existing authorization header", () => {
    const headers = buildRealtimeAuthHeaders(new Headers({
      authorization: "Bearer existing-token",
    }), "token-123");

    expect(headers.get("authorization")).toBe("Bearer existing-token");
  });
});
