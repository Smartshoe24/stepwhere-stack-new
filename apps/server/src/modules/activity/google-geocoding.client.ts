import { env } from "../../config/env";

type GeocodingResponse = {
  results?: GeocodingResultEntry[];
  status?: string;
};

type GeocodingResultEntry = {
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  formatted_address?: string;
};

export type ReverseGeocodeResult = {
  displayLabel: string;
  formattedAddress: string | null;
};

const DISPLAY_COMPONENT_TYPES = [
  "point_of_interest",
  "premise",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "locality",
];

function extractDisplayLabel(result: GeocodingResultEntry | undefined) {
  const components = result?.address_components ?? [];

  for (const type of DISPLAY_COMPONENT_TYPES) {
    const component = components.find((entry) => entry.types?.includes(type));

    if (component?.long_name) {
      return component.long_name;
    }
  }

  if (result?.formatted_address) {
    const firstSegment = result.formatted_address.split(",")[0]?.trim();

    if (firstSegment) {
      return firstSegment;
    }
  }

  return "Most active area";
}

export async function reverseGeocodeCoordinate(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
  if (!env.GOOGLE_GEOCODING_API_KEY) {
    return {
      displayLabel: "Most active area",
      formattedAddress: null,
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", env.GOOGLE_GEOCODING_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google geocoding failed with status ${response.status}.`);
    }

    const payload = await response.json() as GeocodingResponse;
    const firstResult = payload.results?.[0];

    if (!firstResult) {
      return {
        displayLabel: "Most active area",
        formattedAddress: null,
      };
    }

    return {
      displayLabel: extractDisplayLabel(firstResult),
      formattedAddress: firstResult.formatted_address ?? null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
