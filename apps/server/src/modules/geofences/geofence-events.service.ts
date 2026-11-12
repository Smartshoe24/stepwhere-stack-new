import { eq } from "drizzle-orm";

import { geofenceEvents, type childGeofences, type locationEvents } from "../../db/schema";

type GeofenceRow = typeof childGeofences.$inferSelect;
type LocationEventRow = typeof locationEvents.$inferSelect;

export async function createGeofenceEvent(
  tx: Parameters<Parameters<typeof import("../../db/client").db.transaction>[0]>[0],
  input: {
    dedupKey: string;
    distanceMeters: number | null;
    eventType: "breached" | "reentered" | "reset";
    geofence: GeofenceRow;
    latitude: number | null;
    locationEventId?: string | null;
    longitude: number | null;
    occurredAt: Date;
    radiusMeters: number | null;
  },
) {
  const [event] = await tx
    .insert(geofenceEvents)
    .values({
      geofenceId: input.geofence.id,
      childId: input.geofence.childId,
      organizationId: input.geofence.organizationId,
      locationEventId: input.locationEventId ?? null,
      eventType: input.eventType,
      generation: input.geofence.generation,
      latitude: input.latitude == null ? null : input.latitude.toFixed(6),
      longitude: input.longitude == null ? null : input.longitude.toFixed(6),
      distanceMeters: input.distanceMeters == null ? null : input.distanceMeters.toFixed(2),
      radiusMeters: input.radiusMeters,
      dedupKey: input.dedupKey,
      occurredAt: input.occurredAt,
    })
    .onConflictDoNothing({
      target: geofenceEvents.dedupKey,
    })
    .returning();

  if (event) {
    return event;
  }

  const [existing] = await tx
    .select()
    .from(geofenceEvents)
    .where(eq(geofenceEvents.dedupKey, input.dedupKey))
    .limit(1);

  return existing ?? null;
}

export type { GeofenceRow, LocationEventRow };
