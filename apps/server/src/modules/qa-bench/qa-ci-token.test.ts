import { describe, expect, it } from "vitest";

import { ciTokenMatches } from "./qa-bench.helpers";

describe("ciTokenMatches", () => {
  const token = "a".repeat(48);

  it("accepts only the exact token", () => {
    expect(ciTokenMatches(token, token)).toBe(true);
    expect(ciTokenMatches(`${token}b`, token)).toBe(false);
    expect(ciTokenMatches("b".repeat(48), token)).toBe(false);
  });

  it("refuses when either side is missing", () => {
    expect(ciTokenMatches(undefined, token)).toBe(false);
    expect(ciTokenMatches(token, undefined)).toBe(false);
    expect(ciTokenMatches("", "")).toBe(false);
  });
});
