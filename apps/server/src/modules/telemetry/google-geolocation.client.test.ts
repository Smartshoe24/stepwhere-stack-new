import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: {
    CELL_GEOLOCATION_ENABLED: true,
    GOOGLE_GEOLOCATION_API_KEY: "test-key",
  },
}));

import {
  buildGoogleGeolocationRequest,
  GoogleGeolocationRequestError,
  locateFromCellTowers,
} from "./google-geolocation.client";

const cellular = {
  radioType: "lte" as const,
  duplexMode: "fdd" as const,
  towers: [
    {
      role: "serving" as const,
      mobileCountryCode: 404,
      mobileNetworkCode: 70,
      trackingAreaCode: 1660,
      cellId: 232_213_794,
      rsrpDbm: -97,
    },
  ],
};

describe("Google geolocation request mapping", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps serving and neighboring LTE towers without IP fallback", () => {
    expect(buildGoogleGeolocationRequest({
      radioType: "lte",
      duplexMode: "fdd",
      towers: [
        {
          role: "serving",
          mobileCountryCode: 404,
          mobileNetworkCode: 70,
          trackingAreaCode: 1660,
          cellId: 232_213_794,
          rsrpDbm: -97,
        },
        {
          role: "neighbor",
          mobileCountryCode: 404,
          mobileNetworkCode: 70,
          trackingAreaCode: 1660,
          cellId: 232_213_795,
          rxDbm: -89,
        },
      ],
    })).toEqual({
      homeMobileCountryCode: 404,
      homeMobileNetworkCode: 70,
      radioType: "lte",
      considerIp: false,
      cellTowers: [
        {
          cellId: 232_213_794,
          locationAreaCode: 1660,
          mobileCountryCode: 404,
          mobileNetworkCode: 70,
          age: 0,
          signalStrength: -97,
        },
        {
          cellId: 232_213_795,
          locationAreaCode: 1660,
          mobileCountryCode: 404,
          mobileNetworkCode: 70,
          age: 0,
          signalStrength: -89,
        },
      ],
    });
  });

  it("returns the response center and accuracy radius", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      location: { lat: 26.8899185, lng: 75.7769314 },
      accuracy: 111.264,
    }), { status: 200 }));

    await expect(locateFromCellTowers(cellular)).resolves.toEqual({
      latitude: 26.8899185,
      longitude: 75.7769314,
      accuracyMeters: 111.264,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("key=test-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({ considerIp: false });
  });

  it("classifies NOT_FOUND as a non-transient provider error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: { message: "Not Found" },
    }), { status: 404 }));

    await expect(locateFromCellTowers(cellular)).rejects.toMatchObject({
      name: "GoogleGeolocationRequestError",
      status: 404,
      transient: false,
    } satisfies Partial<GoogleGeolocationRequestError>);
  });
});
