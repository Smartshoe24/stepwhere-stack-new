import { describe, expect, it } from "vitest";

import {
  FALLBACK_TIMEZONE,
  resolveChildTimezone,
  resolveTimezoneFromCoordinate,
} from "./device-timezone";

describe("resolveTimezoneFromCoordinate", () => {
  it("resolves real coordinates to IANA zones", () => {
    expect(resolveTimezoneFromCoordinate(28.6139, 77.209)).toBe("Asia/Kolkata");
    expect(resolveTimezoneFromCoordinate(40.7128, -74.006)).toBe("America/New_York");
    expect(resolveTimezoneFromCoordinate(51.5074, -0.1278)).toBe("Europe/London");
  });

  it("accepts numeric strings, which is how coordinates arrive from the db", () => {
    expect(resolveTimezoneFromCoordinate("28.613900", "77.209000")).toBe("Asia/Kolkata");
  });

  it("rejects the (0,0) no-fix sentinel", () => {
    expect(resolveTimezoneFromCoordinate(0, 0)).toBeNull();
  });

  it("rejects missing or unusable values", () => {
    expect(resolveTimezoneFromCoordinate(null, 77.209)).toBeNull();
    expect(resolveTimezoneFromCoordinate(28.6139, null)).toBeNull();
    expect(resolveTimezoneFromCoordinate(undefined, undefined)).toBeNull();
    expect(resolveTimezoneFromCoordinate("abc", "def")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(resolveTimezoneFromCoordinate(91, 0)).toBeNull();
    expect(resolveTimezoneFromCoordinate(0, 181)).toBeNull();
  });
});

describe("resolveChildTimezone", () => {
  it("prefers a fresh fix", () => {
    expect(resolveChildTimezone({
      latitude: 28.6139,
      longitude: 77.209,
      storedTimezone: "Europe/London",
    })).toBe("Asia/Kolkata");
  });

  it("falls back to the stored zone when there is no fix", () => {
    expect(resolveChildTimezone({
      latitude: null,
      longitude: null,
      storedTimezone: "Europe/London",
    })).toBe("Europe/London");
  });

  it("always resolves something so a local date can be computed", () => {
    expect(resolveChildTimezone({
      latitude: null,
      longitude: null,
      storedTimezone: null,
    })).toBe(FALLBACK_TIMEZONE);
  });
});
