import { eq, sql } from "drizzle-orm";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { historyEvents, historyRouteGeometryCache } from "../../db/schema";
import { GoogleRoadsRequestError, googleRoadsClient } from "../telemetry/google-roads.client";
import { ROAD_GEOMETRY_CACHE_DAYS } from "./history.constants";
import { calculateDistanceMeters, distanceMeters } from "./history-path";

export function isHistoryRoadSnappingEnabled() {
  return env.HISTORY_ROAD_SNAPPING_ENABLED && Boolean(env.GOOGLE_ROADS_API_KEY);
}

export async function cleanupExpiredHistoryRoadGeometry(limit = 500) {
  const now = new Date();
  await db.execute(sql`
    with expired as (
      select ${historyRouteGeometryCache.historyEventId}
      from ${historyRouteGeometryCache}
      where ${historyRouteGeometryCache.expiresAt} < ${now.toISOString()}::timestamptz
      order by ${historyRouteGeometryCache.expiresAt}, ${historyRouteGeometryCache.historyEventId}
      limit ${limit}
      for update skip locked
    )
    delete from ${historyRouteGeometryCache}
    using expired
    where ${historyRouteGeometryCache.historyEventId} = expired.history_event_id
  `);
}

export async function getHistoryRoadGeometry(historyEventId: string) {
  const [row] = await db
    .select()
    .from(historyRouteGeometryCache)
    .where(eq(historyRouteGeometryCache.historyEventId, historyEventId))
    .limit(1);

  if (!row || row.expiresAt <= new Date()) {
    return null;
  }

  return row.geometry ?? null;
}

export async function enrichHistoryRoadGeometry(historyEventId: string) {
  if (!isHistoryRoadSnappingEnabled()) {
    return { status: "rejected" as const, error: "History road snapping is disabled." };
  }

  const [event] = await db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.id, historyEventId))
    .limit(1);

  if (!event || event.kind !== "trip" || event.tripMode !== "vehicle" || event.status !== "finalized" || !event.filteredPath) {
    return { status: "rejected" as const, error: "History event is not an eligible finalized vehicle trip." };
  }

  try {
    const points = event.filteredPath.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
    const snapped = await googleRoadsClient.snapToRoads(points, { enabled: true });

    if (snapped.length < 2) {
      return { status: "rejected" as const, error: "Roads response did not contain enough accepted points." };
    }

    const snappedCoordinates = snapped.map(point => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
    const rawDistance = calculateDistanceMeters(points);
    const snappedDistance = calculateDistanceMeters(snappedCoordinates);
    const endpointDrift = Math.max(
      distanceMeters(points[0]!, snappedCoordinates[0]!),
      distanceMeters(points[points.length - 1]!, snappedCoordinates[snappedCoordinates.length - 1]!),
    );
    const lengthRatio = rawDistance > 0 ? snappedDistance / rawDistance : 1;

    if (endpointDrift > 150 || lengthRatio < 0.5 || lengthRatio > 2) {
      return {
        status: "rejected" as const,
        error: "Roads response failed History geometry quality gates.",
      };
    }

    const now = new Date();
    await db
      .insert(historyRouteGeometryCache)
      .values({
        historyEventId,
        provider: "google_roads",
        geometry: snappedCoordinates,
        generatedAt: now,
        expiresAt: new Date(now.getTime() + ROAD_GEOMETRY_CACHE_DAYS * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: historyRouteGeometryCache.historyEventId,
        set: {
          geometry: snappedCoordinates,
          generatedAt: now,
          expiresAt: new Date(now.getTime() + ROAD_GEOMETRY_CACHE_DAYS * 24 * 60 * 60 * 1000),
        },
      });

    return { status: "completed" as const };
  } catch (error) {
    if (error instanceof GoogleRoadsRequestError && !error.transient) {
      return {
        status: "rejected" as const,
        error: error.message,
      };
    }

    return {
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Road geometry enrichment failed.",
    };
  }
}
