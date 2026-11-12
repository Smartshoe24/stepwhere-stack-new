import type { PlaceDto, ResolvedAddressDto } from "@stepwhere/types";
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { places } from "../../db/schema";
import {
  autocompleteAddressPlaces,
  autocompleteSchoolPlaces,
  getGoogleAddressPlaceDetails,
  getGoogleSchoolPlaceDetails,
} from "./google-places.client";

function toPlaceDto(place: typeof places.$inferSelect): PlaceDto {
  return {
    id: place.id,
    kind: place.kind,
    provider: place.provider as "google",
    providerPlaceId: place.providerPlaceId,
    label: place.label,
    formattedAddress: place.formattedAddress,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
}

export async function searchSchoolPlaces(query: string, sessionToken?: string | null) {
  return autocompleteSchoolPlaces(query.trim(), sessionToken);
}

export async function searchAddressPlaces(query: string, sessionToken?: string | null) {
  return autocompleteAddressPlaces(query.trim(), sessionToken);
}

export async function resolveAddressPlace(
  providerPlaceId: string,
  sessionToken?: string | null,
): Promise<ResolvedAddressDto> {
  return getGoogleAddressPlaceDetails(providerPlaceId, sessionToken);
}

export async function resolveSchoolPlace(providerPlaceId: string): Promise<PlaceDto> {
  const [existing] = await db
    .select()
    .from(places)
    .where(eq(places.providerPlaceId, providerPlaceId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(places)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(places.id, existing.id))
      .returning();

    return toPlaceDto(updated ?? existing);
  }

  const resolved = await getGoogleSchoolPlaceDetails(providerPlaceId);
  const [created] = await db
    .insert(places)
    .values({
      kind: "school",
      provider: resolved.provider,
      providerPlaceId: resolved.providerPlaceId,
      label: resolved.label,
      formattedAddress: resolved.formattedAddress,
      latitude: resolved.latitude.toFixed(6),
      longitude: resolved.longitude.toFixed(6),
      raw: resolved.raw,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return toPlaceDto(created);
}
