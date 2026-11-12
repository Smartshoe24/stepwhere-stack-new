import { env } from "../../config/env";
import { badRequest } from "../../shared/errors";

type GoogleAutocompleteResponse = {
  predictions?: Array<{
    place_id?: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
    description?: string;
  }>;
};

type GooglePlaceDetailsResponse = {
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  };
};

function requirePlacesApiKey() {
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw badRequest("Place search is not configured.");
  }

  return env.GOOGLE_PLACES_API_KEY;
}

async function fetchGooglePlaces<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google Places request failed with status ${response.status}.`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function autocompleteSchoolPlaces(query: string, sessionToken?: string | null) {
  const apiKey = requirePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "school");
  url.searchParams.set("components", "country:in");
  url.searchParams.set("key", apiKey);

  if (sessionToken) {
    url.searchParams.set("sessiontoken", sessionToken);
  }

  const payload = await fetchGooglePlaces<GoogleAutocompleteResponse>(url);

  return (payload.predictions ?? [])
    .filter((prediction) => prediction.place_id)
    .map((prediction) => ({
      provider: "google" as const,
      providerPlaceId: prediction.place_id as string,
      mainText: prediction.structured_formatting?.main_text
        ?? prediction.description
        ?? "School",
      secondaryText: prediction.structured_formatting?.secondary_text ?? null,
    }));
}

export async function autocompleteAddressPlaces(query: string, sessionToken?: string | null) {
  const apiKey = requirePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:in");
  url.searchParams.set("key", apiKey);

  if (sessionToken) {
    url.searchParams.set("sessiontoken", sessionToken);
  }

  const payload = await fetchGooglePlaces<GoogleAutocompleteResponse>(url);

  return (payload.predictions ?? [])
    .filter((prediction) => prediction.place_id)
    .map((prediction) => ({
      provider: "google" as const,
      providerPlaceId: prediction.place_id as string,
      mainText: prediction.structured_formatting?.main_text
        ?? prediction.description
        ?? "Address",
      secondaryText: prediction.structured_formatting?.secondary_text ?? null,
    }));
}

export async function getGoogleAddressPlaceDetails(
  providerPlaceId: string,
  sessionToken?: string | null,
) {
  const apiKey = requirePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", providerPlaceId);
  url.searchParams.set("fields", "place_id,formatted_address,geometry");
  url.searchParams.set("key", apiKey);

  if (sessionToken) {
    url.searchParams.set("sessiontoken", sessionToken);
  }

  const payload = await fetchGooglePlaces<GooglePlaceDetailsResponse>(url);
  const result = payload.result;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;

  if (!result?.place_id || !result.formatted_address || latitude == null || longitude == null) {
    throw badRequest("Unable to resolve the selected address.");
  }

  return {
    provider: "google" as const,
    providerPlaceId: result.place_id,
    formattedAddress: result.formatted_address,
    latitude,
    longitude,
  };
}

export async function getGoogleSchoolPlaceDetails(providerPlaceId: string) {
  const apiKey = requirePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", providerPlaceId);
  url.searchParams.set("fields", "place_id,name,formatted_address,geometry");
  url.searchParams.set("key", apiKey);

  const payload = await fetchGooglePlaces<GooglePlaceDetailsResponse>(url);
  const result = payload.result;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;

  if (!result?.place_id || !result.name || latitude == null || longitude == null) {
    throw badRequest("Unable to resolve the selected school.");
  }

  return {
    provider: "google" as const,
    providerPlaceId: result.place_id,
    label: result.name,
    formattedAddress: result.formatted_address ?? null,
    latitude,
    longitude,
    raw: payload as Record<string, unknown>,
  };
}
