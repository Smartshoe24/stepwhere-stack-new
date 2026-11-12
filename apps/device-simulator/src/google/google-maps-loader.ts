import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configuredKey: string | null = null;
let mapsPromise: Promise<google.maps.MapsLibrary> | null = null;
let placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
let routesPromise: Promise<google.maps.RoutesLibrary> | null = null;

function ensureConfigured(apiKey: string) {
  if (!configuredKey) {
    setOptions({ key: apiKey, v: "weekly" });
    configuredKey = apiKey;
    return;
  }

  if (configuredKey !== apiKey) {
    throw new Error("Google Maps key changed. Reload the simulator to apply the new key.");
  }
}

export function loadMapsLibrary(apiKey: string) {
  ensureConfigured(apiKey);

  if (!mapsPromise) {
    mapsPromise = importLibrary("maps") as Promise<google.maps.MapsLibrary>;
  }

  return mapsPromise;
}

export function loadPlacesLibrary(apiKey: string) {
  ensureConfigured(apiKey);

  if (!placesPromise) {
    placesPromise = importLibrary("places") as Promise<google.maps.PlacesLibrary>;
  }

  return placesPromise;
}

export function loadRoutesLibrary(apiKey: string) {
  ensureConfigured(apiKey);

  if (!routesPromise) {
    routesPromise = importLibrary("routes") as Promise<google.maps.RoutesLibrary>;
  }

  return routesPromise;
}
