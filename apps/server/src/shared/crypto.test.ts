import { describe, expect, it } from "vitest";

import { generateOpaqueToken, sha256 } from "./crypto";

describe("crypto helpers", () => {
  it("generates a non-empty opaque token", () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(10);
  });

  it("hashes deterministically", () => {
    expect(sha256("stepwhere")).toBe(sha256("stepwhere"));
    expect(sha256("stepwhere")).not.toBe(sha256("something-else"));
  });
});
