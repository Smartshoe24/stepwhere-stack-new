import { describe, expect, it } from "vitest";

import {
  hasNetworkObservationChanged,
  NETWORK_CHANGE_MIN_INTERVAL_MS,
  nextRecentCells,
  servingCellKey,
  shouldLookupForChangedNetwork,
  wifiLookupKeys,
} from "./cell-geolocation";

const cell = (cellId: number) => ({
  radioType: "lte" as const,
  duplexMode: "fdd" as const,
  towers: [{
    role: "serving" as const,
    mobileCountryCode: 404,
    mobileNetworkCode: 70,
    trackingAreaCode: 1660,
    cellId,
  }],
});

const ap = (n: number, dbm = -60) => ({
  macAddress: `A0:00:00:00:00:${n.toString(16).padStart(2, "0").toUpperCase()}`,
  signalStrengthDbm: dbm,
  channel: 6,
  ageMs: 0,
});
const wifi = (...ids: number[]) => ({ accessPoints: ids.map((id) => ap(id)) });

describe("network observation change", () => {
  it("keys the serving cell and keeps recent cells newest first, without duplicates", () => {
    expect(servingCellKey(cell(133145099))).toBe("404-70-1660-133145099");
    expect(nextRecentCells(["a", "b", "c", "d"], "c")).toEqual(["c", "a", "b", "d"]);
    expect(nextRecentCells(["a", "b", "c", "d"], "e")).toEqual(["e", "a", "b", "c"]);
    expect(nextRecentCells(null, null)).toEqual([]);
  });

  it("does not count a return to a recently used tower as a move", () => {
    const recentCells = ["404-70-1660-235545089", "404-70-1660-133145099"];
    expect(hasNetworkObservationChanged({ recentCells, lastWifi: [], cellular: cell(133145099), wifi: null }))
      .toBe(false);
    expect(hasNetworkObservationChanged({ recentCells, lastWifi: [], cellular: cell(235545120), wifi: null }))
      .toBe(true);
  });

  it("needs at least two usable access points and less than half in common", () => {
    const lastWifi = wifiLookupKeys(wifi(1, 2, 3, 4));
    const recentCells = [servingCellKey(cell(1))!];
    const changed = (w: ReturnType<typeof wifi> | null) =>
      hasNetworkObservationChanged({ recentCells, lastWifi, cellular: cell(1), wifi: w });

    expect(changed(null)).toBe(false);                 // failed scan
    expect(changed(wifi(9))).toBe(false);               // one AP is not usable
    expect(changed(wifi(1, 2, 3, 9))).toBe(false);      // 3 of 4 in common
    expect(changed(wifi(1, 2, 8, 9))).toBe(false);      // exactly half
    expect(changed(wifi(1, 7, 8, 9))).toBe(true);       // 1 of 4
    expect(hasNetworkObservationChanged({ recentCells, lastWifi: [], cellular: cell(1), wifi: wifi(5, 6) }))
      .toBe(true);                                      // Wi-Fi appeared
  });

  it("brings the lookup forward only 30 s after the last one and only when not already due", () => {
    const last = new Date("2026-11-15T10:00:00.000Z");
    const at = (ms: number) => new Date(last.getTime() + ms);
    const scheduled = at(7 * 60_000);

    expect(shouldLookupForChangedNetwork({ lastLookupAt: last, nextLookupAt: scheduled, observedAt: at(10_000), changed: true }))
      .toBe(false);
    expect(shouldLookupForChangedNetwork({
      lastLookupAt: last, nextLookupAt: scheduled, observedAt: at(NETWORK_CHANGE_MIN_INTERVAL_MS), changed: true,
    })).toBe(true);
    expect(shouldLookupForChangedNetwork({ lastLookupAt: last, nextLookupAt: scheduled, observedAt: at(60_000), changed: false }))
      .toBe(false);
    // No lookup yet in this outage: the 2-minute first lookup stays in charge.
    expect(shouldLookupForChangedNetwork({ lastLookupAt: null, nextLookupAt: scheduled, observedAt: at(60_000), changed: true }))
      .toBe(false);
    expect(shouldLookupForChangedNetwork({ lastLookupAt: last, nextLookupAt: at(30_000), observedAt: at(60_000), changed: true }))
      .toBe(false);
  });
});
