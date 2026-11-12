import type { CellularTelemetryInput, WifiTelemetryInput } from "@stepwhere/types";

import { env } from "../../config/env";
import { getEligibleWifiAccessPoints } from "./wifi-geolocation";

const GOOGLE_GEOLOCATION_ENDPOINT = "https://www.googleapis.com/geolocation/v1/geolocate";
const GOOGLE_GEOLOCATION_TIMEOUT_MS = 3_000;

type GoogleGeolocationResponse = {
  location?: {
    lat?: number;
    lng?: number;
  };
  accuracy?: number;
};

export type CellGeolocationResult = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export class GoogleGeolocationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "GoogleGeolocationRequestError";
  }
}

export function buildGoogleGeolocationRequest(
  cellular: CellularTelemetryInput | null | undefined,
  wifi?: WifiTelemetryInput | null,
) {
  const servingTower = cellular?.towers.find((tower) => tower.role === "serving");
  const accessPoints = getEligibleWifiAccessPoints(wifi);

  // Keep a single eligible BSSID with cell data for the bench comparison.
  // Inclusion does not guarantee Google uses it; Wi-Fi-only needs at least two.
  return {
    considerIp: false,
    ...(servingTower && cellular ? {
      homeMobileCountryCode: servingTower.mobileCountryCode,
      homeMobileNetworkCode: servingTower.mobileNetworkCode,
      radioType: cellular.radioType,
      cellTowers: cellular.towers.map((tower) => ({
        cellId: tower.cellId,
        locationAreaCode: tower.trackingAreaCode,
        mobileCountryCode: tower.mobileCountryCode,
        mobileNetworkCode: tower.mobileNetworkCode,
        age: 0,
        ...(tower.rsrpDbm != null || tower.rxDbm != null
          ? { signalStrength: tower.rsrpDbm ?? tower.rxDbm! }
          : {}),
      })),
    } : {}),
    ...(accessPoints.length >= (servingTower ? 1 : 2) ? {
      wifiAccessPoints: accessPoints.map((point) => ({
        macAddress: point.macAddress,
        signalStrength: point.signalStrengthDbm,
        channel: point.channel,
        age: point.ageMs,
      })),
    } : {}),
  };
}

export async function locateFromCellTowers(
  cellular: CellularTelemetryInput | null | undefined,
  wifi?: WifiTelemetryInput | null,
): Promise<CellGeolocationResult> {
  if (!env.CELL_GEOLOCATION_ENABLED || !env.GOOGLE_GEOLOCATION_API_KEY) {
    throw new GoogleGeolocationRequestError(
      "Network geolocation is disabled.",
      null,
      false,
    );
  }

  const request = buildGoogleGeolocationRequest(cellular, wifi);
  if (!("cellTowers" in request) && !("wifiAccessPoints" in request)) {
    throw new GoogleGeolocationRequestError("No eligible network observations.", null, false);
  }
  const startedAt = Date.now();
  if (env.NODE_ENV === "development") {
    console.info("[network-geolocation] request", JSON.stringify(request, null, 2));
  }
  const url = new URL(GOOGLE_GEOLOCATION_ENDPOINT);
  url.searchParams.set("key", env.GOOGLE_GEOLOCATION_API_KEY);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_GEOLOCATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GoogleGeolocationRequestError(
        `Google Geolocation API request failed with status ${response.status}.`,
        response.status,
        response.status === 429 || response.status >= 500,
      );
    }

    const payload = await response.json() as GoogleGeolocationResponse;
    const latitude = payload.location?.lat;
    const longitude = payload.location?.lng;
    const accuracyMeters = payload.accuracy;

    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || !Number.isFinite(accuracyMeters)
      || latitude! < -90
      || latitude! > 90
      || longitude! < -180
      || longitude! > 180
      || accuracyMeters! < 0
    ) {
      throw new GoogleGeolocationRequestError(
        "Google Geolocation API returned an invalid location.",
        response.status,
        false,
      );
    }

    const result = {
      latitude: latitude!,
      longitude: longitude!,
      accuracyMeters: accuracyMeters!,
    };
    if (env.NODE_ENV === "development") {
      console.info("[network-geolocation] result", { ...result, durationMs: Date.now() - startedAt });
    }
    return result;
  } catch (error) {
    if (env.NODE_ENV === "development") {
      console.warn("[network-geolocation] failure", {
        status: error instanceof GoogleGeolocationRequestError ? error.status : null,
        durationMs: Date.now() - startedAt,
      });
    }
    if (error instanceof GoogleGeolocationRequestError) {
      throw error;
    }

    throw new GoogleGeolocationRequestError(
      "Google Geolocation API connection failed or timed out.",
      null,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}
