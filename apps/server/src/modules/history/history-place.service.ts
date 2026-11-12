import { and, desc, eq, gt, inArray } from "drizzle-orm";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { children, historyEnrichmentJobs, historyEvents, places } from "../../db/schema";
import { reverseGeocodeCoordinate } from "../activity/google-geocoding.client";
import { distanceMeters } from "./history-path";
import { GOOGLE_CONTENT_CACHE_DAYS, PLACE_EXACT_DISTANCE_METERS, PLACE_NEAR_DISTANCE_METERS } from "./history.constants";

export type ResolvedHistoryPlace = {
  placeProvider: string | null;
  providerPlaceId: string | null;
  placeMatchType: "saved" | "exact" | "near" | "address" | "pending" | "unavailable";
  placeDistanceMeters: number | null;
  placeLabel: string;
  formattedAddress: string | null;
  placeEnrichmentStatus: "pending" | "completed" | "unavailable";
};

export async function resolveInitialHistoryPlace(input: {
  childId: string;
  latitude: number;
  longitude: number;
}): Promise<ResolvedHistoryPlace> {
  const [row] = await db
    .select({
      organizationId: children.organizationId,
      place: places,
    })
    .from(children)
    .leftJoin(places, eq(places.id, children.schoolPlaceId))
    .where(eq(children.id, input.childId))
    .limit(1);

  if (row?.place) {
    const distance = distanceMeters(input, {
      latitude: Number(row.place.latitude),
      longitude: Number(row.place.longitude),
    });

    if (distance <= PLACE_NEAR_DISTANCE_METERS) {
      return {
        placeProvider: row.place.provider,
        providerPlaceId: row.place.providerPlaceId,
        placeMatchType: "saved",
        placeDistanceMeters: Math.round(distance),
        placeLabel: row.place.label,
        formattedAddress: row.place.formattedAddress,
        placeEnrichmentStatus: "completed",
      };
    }
  }

  if (row?.organizationId) {
    const reusable = await findReusableHistoryPlaceResolution({
      organizationId: row.organizationId,
      latitude: input.latitude,
      longitude: input.longitude,
    });

    if (reusable) {
      return reusable;
    }
  }

  return {
    placeProvider: null,
    providerPlaceId: null,
    placeMatchType: "pending",
    placeDistanceMeters: null,
    placeLabel: "Pinned location",
    formattedAddress: null,
    placeEnrichmentStatus: "pending",
  };
}

export async function findReusableHistoryPlaceResolution(input: {
  organizationId: string;
  latitude: number;
  longitude: number;
}): Promise<ResolvedHistoryPlace | null> {
  const rows = await db
    .select()
    .from(historyEvents)
    .where(and(
      eq(historyEvents.organizationId, input.organizationId),
      eq(historyEvents.kind, "stay"),
      eq(historyEvents.placeEnrichmentStatus, "completed"),
      gt(historyEvents.placeContentExpiresAt, new Date()),
    ))
    .orderBy(desc(historyEvents.placeContentFetchedAt))
    .limit(100);
  const reusable = rows.find(event => {
    if (
      event.representativeLatitude == null
      || event.representativeLongitude == null
      || !event.placeLabel
    ) {
      return false;
    }

    const threshold = event.placeMatchType === "near"
      ? PLACE_NEAR_DISTANCE_METERS
      : PLACE_EXACT_DISTANCE_METERS;

    return distanceMeters(input, {
      latitude: Number(event.representativeLatitude),
      longitude: Number(event.representativeLongitude),
    }) <= threshold;
  });

  if (!reusable?.placeLabel) {
    return null;
  }

  return {
    placeProvider: reusable.placeProvider,
    providerPlaceId: reusable.providerPlaceId,
    placeMatchType: reusable.placeMatchType ?? "pending",
    placeDistanceMeters: reusable.placeDistanceMeters,
    placeLabel: reusable.placeLabel,
    formattedAddress: reusable.formattedAddress,
    placeEnrichmentStatus: "completed",
  };
}

export async function enrichHistoryPlace(historyEventId: string) {
  const [event] = await db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.id, historyEventId))
    .limit(1);

  if (!event || event.kind !== "stay" || event.representativeLatitude == null || event.representativeLongitude == null) {
    return { status: "rejected" as const, error: "History event is not a stay with coordinates." };
  }

  const latitude = Number(event.representativeLatitude);
  const longitude = Number(event.representativeLongitude);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GOOGLE_CONTENT_CACHE_DAYS * 24 * 60 * 60 * 1000);

  if (!env.GOOGLE_PLACES_API_KEY && !env.GOOGLE_GEOCODING_API_KEY) {
    return {
      status: "failed" as const,
      error: "Google place enrichment is not configured.",
    };
  }

  try {
    const nearby = await searchNearbyPlace(latitude, longitude);

    if (nearby) {
      await db
        .update(historyEvents)
        .set({
          placeProvider: "google",
          providerPlaceId: nearby.providerPlaceId,
          placeMatchType: nearby.distanceMeters <= PLACE_EXACT_DISTANCE_METERS ? "exact" : "near",
          placeDistanceMeters: Math.round(nearby.distanceMeters),
          placeLabel: nearby.distanceMeters <= PLACE_EXACT_DISTANCE_METERS ? nearby.label : `Near ${nearby.label}`,
          formattedAddress: nearby.formattedAddress,
          placeContentFetchedAt: now,
          placeContentExpiresAt: expiresAt,
          placeEnrichmentStatus: "completed",
          updatedAt: now,
        })
        .where(eq(historyEvents.id, historyEventId));

      return { status: "completed" as const };
    }

    const reverse = await reverseGeocodeCoordinate(latitude, longitude);
    await db
      .update(historyEvents)
      .set({
        placeProvider: env.GOOGLE_GEOCODING_API_KEY ? "google" : null,
        placeMatchType: reverse.formattedAddress ? "address" : "unavailable",
        placeLabel: reverse.formattedAddress ? reverse.displayLabel : null,
        formattedAddress: reverse.formattedAddress,
        placeContentFetchedAt: reverse.formattedAddress ? now : null,
        placeContentExpiresAt: reverse.formattedAddress ? expiresAt : null,
        placeEnrichmentStatus: reverse.formattedAddress ? "completed" : "unavailable",
        updatedAt: now,
      })
      .where(eq(historyEvents.id, historyEventId));

    return { status: "completed" as const };
  } catch (error) {
    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Place enrichment failed.",
    };
  }
}

export async function queueExpiredHistoryPlaceRefresh(historyEventIds: string[]) {
  if (historyEventIds.length === 0) {
    return;
  }

  const now = new Date();
  await db.transaction(async tx => {
    await tx
      .update(historyEvents)
      .set({
        placeMatchType: "pending",
        placeDistanceMeters: null,
        placeLabel: "Pinned location",
        formattedAddress: null,
        placeContentFetchedAt: null,
        placeContentExpiresAt: null,
        placeEnrichmentStatus: "pending",
        updatedAt: now,
      })
      .where(inArray(historyEvents.id, historyEventIds));

    for (const historyEventId of historyEventIds) {
      await tx
        .insert(historyEnrichmentJobs)
        .values({
          historyEventId,
          type: "place",
          status: "pending",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [historyEnrichmentJobs.historyEventId, historyEnrichmentJobs.type],
          set: {
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: now,
            lastError: null,
            leaseExpiresAt: null,
            updatedAt: now,
          },
        });
    }
  });
}

async function searchNearbyPlace(latitude: number, longitude: number) {
  if (!env.GOOGLE_PLACES_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GOOGLE_PLACES_API_KEY,
        "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types",
      },
      body: JSON.stringify({
        maxResultCount: 5,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: PLACE_NEAR_DISTANCE_METERS,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Places Nearby Search failed with status ${response.status}.`);
    }

    const payload = await response.json() as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }>;
    };
    const candidates = (payload.places ?? [])
      .map((place) => {
        if (!place.id || !place.displayName?.text || place.location?.latitude == null || place.location.longitude == null) {
          return null;
        }

        return {
          providerPlaceId: place.id,
          label: place.displayName.text,
          formattedAddress: place.formattedAddress ?? null,
          distanceMeters: distanceMeters({ latitude, longitude }, {
            latitude: place.location.latitude,
            longitude: place.location.longitude,
          }),
        };
      })
      .filter((place): place is NonNullable<typeof place> => place !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return candidates[0] ?? null;
  } finally {
    clearTimeout(timeout);
  }
}
