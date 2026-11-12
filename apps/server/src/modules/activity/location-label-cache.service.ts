import { addDays } from "date-fns";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { activityLocationLabelCache } from "../../db/schema";
import { reverseGeocodeCoordinate } from "./google-geocoding.client";
import { GEOCODING_CACHE } from "./activity.constants";

function roundCoordinate(value: number) {
  return Number(value.toFixed(GEOCODING_CACHE.coordinatePrecision)).toFixed(GEOCODING_CACHE.coordinatePrecision);
}

export async function resolveActivityLocationLabel(input: {
  latitude: number | null;
  longitude: number | null;
}) {
  if (input.latitude === null || input.longitude === null) {
    return "Most active area";
  }

  const roundedLatitude = roundCoordinate(input.latitude);
  const roundedLongitude = roundCoordinate(input.longitude);
  const now = new Date();
  const [cached] = await db
    .select()
    .from(activityLocationLabelCache)
    .where(and(
      eq(activityLocationLabelCache.provider, "google"),
      eq(activityLocationLabelCache.roundedLatitude, roundedLatitude),
      eq(activityLocationLabelCache.roundedLongitude, roundedLongitude),
      gt(activityLocationLabelCache.expiresAt, now),
    ))
    .limit(1);

  if (cached) {
    await db
      .update(activityLocationLabelCache)
      .set({
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(activityLocationLabelCache.id, cached.id));

    return cached.displayLabel;
  }

  try {
    const result = await reverseGeocodeCoordinate(input.latitude, input.longitude);
    const expiresAt = addDays(now, GEOCODING_CACHE.ttlDays);

    await db
      .insert(activityLocationLabelCache)
      .values({
        roundedLatitude,
        roundedLongitude,
        provider: "google",
        displayLabel: result.displayLabel,
        formattedAddress: result.formattedAddress,
        expiresAt,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          activityLocationLabelCache.provider,
          activityLocationLabelCache.roundedLatitude,
          activityLocationLabelCache.roundedLongitude,
        ],
        set: {
          displayLabel: result.displayLabel,
          formattedAddress: result.formattedAddress,
          expiresAt,
          lastUsedAt: now,
          updatedAt: now,
        },
      });

    return result.displayLabel;
  } catch (error) {
    console.warn("[activity-location-cache] reverse geocode failed", error);
    return "Most active area";
  }
}
