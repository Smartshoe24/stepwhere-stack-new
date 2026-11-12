import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  ArchiveChildResultDto,
  BindChildDeviceResultDto,
  ChildDetailDto,
  ChildGeofenceDto,
  ChildSummaryDto,
  CreateChildInput,
  OverviewResponseDto,
  UnlinkChildDeviceResultDto,
  UpdateChildGeofenceInput,
  UpdateChildInput,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { childDeviceBindings, childGeofences, childStatusSnapshots, children, devices, places, users } from "../../db/schema";
import { AppError, badRequest, notFound, typedConflict } from "../../shared/errors";
import { getActiveSubscriptionForChild } from "../plans/plans.service";
import { sha256 } from "../../shared/crypto";
import { assertChildAvatarOwnership, ensureStoredAvatarExists, isStoredAvatarPath } from "../uploads/uploads.service";
import { toChildDetailDto, toChildGeofenceDto, toChildSummaryDto, toOverviewChildDto } from "./children.mapper";
import { createGeofenceEvent } from "../geofences/geofence-events.service";
import { claimDevice } from "../billing/billing-ownership.service";
import { publicShareRealtimeRegistry } from "../shares/share-realtime.service";
import { revokeActiveShareLinksForChildren } from "../shares/share-revocation";

async function getChildRowsForOrganization(organizationId: string) {
  return db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      device,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(device, eq(device.id, childDeviceBindings.deviceId))
    .where(and(eq(children.organizationId, organizationId), eq(children.status, "active")))
    .orderBy(children.createdAt);
}

const device = devices;
type PlaceRecord = typeof places.$inferSelect;

async function getSchoolPlaceById(placeId: string | null | undefined): Promise<PlaceRecord | null> {
  if (!placeId) {
    return null;
  }

  const [place] = await db
    .select()
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);

  return place ?? null;
}

async function getRequiredSchoolPlace(placeId: string): Promise<PlaceRecord> {
  const [place] = await db
    .select()
    .from(places)
    .where(and(eq(places.id, placeId), eq(places.kind, "school")))
    .limit(1);

  if (!place) {
    throw badRequest("Select a valid school.");
  }

  return place;
}

async function getSchoolPlaceMap(placeIds: Array<string | null | undefined>) {
  const uniquePlaceIds = [...new Set(placeIds.filter((placeId): placeId is string => Boolean(placeId)))];

  if (uniquePlaceIds.length === 0) {
    return new Map<string, PlaceRecord>();
  }

  const rows = await db
    .select()
    .from(places)
    .where(inArray(places.id, uniquePlaceIds));

  return new Map(rows.map((place) => [place.id, place]));
}

async function getGeofenceRowsForOrganization(organizationId: string) {
  const rows = await db
    .select()
    .from(childGeofences)
    .where(eq(childGeofences.organizationId, organizationId));

  return new Map(rows.map((row) => [row.childId, row]));
}

export async function listChildrenForOrganization(organizationId: string): Promise<ChildDetailDto[]> {
  const rows = await getChildRowsForOrganization(organizationId);
  const schoolPlaceMap = await getSchoolPlaceMap(rows.map((row) => row.child.schoolPlaceId));

  return Promise.all(rows.map(async (row) => {
    const activePlan = await getActiveSubscriptionForChild(row.child.id);
    return toChildDetailDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
      schoolPlace: row.child.schoolPlaceId ? (schoolPlaceMap.get(row.child.schoolPlaceId) ?? null) : null,
    });
  }));
}

export async function getOverviewForOrganization(organizationId: string): Promise<OverviewResponseDto> {
  const rows = await getChildRowsForOrganization(organizationId);
  const geofenceRows = await getGeofenceRowsForOrganization(organizationId);

  const childrenDtos = await Promise.all(rows.map(async (row) => {
    const activePlan = await getActiveSubscriptionForChild(row.child.id);
    return toOverviewChildDto({
      child: row.child,
      snapshot: row.snapshot,
      device: row.device,
      activePlan,
      geofence: geofenceRows.get(row.child.id) ?? null,
    });
  }));

  return {
    children: childrenDtos,
    selectedChildId: childrenDtos[0]?.id ?? null,
    generatedAt: new Date().toISOString(),
  };
}

export async function createChild(organizationId: string, input: CreateChildInput, options?: { userId?: string }) {
  if (!options?.userId) {
    throw new AppError(401, "UNAUTHORIZED", "User is required to create a child.");
  }

  const userId = options.userId;
  const schoolPlace = await getRequiredSchoolPlace(input.schoolPlaceId);

  if (!input.avatarUrl.trim()) {
    throw new AppError(400, "BAD_REQUEST", "Child photo is required.");
  }

  if (isStoredAvatarPath(input.avatarUrl)) {
    assertChildAvatarOwnership({
      organizationId,
      userId,
      path: input.avatarUrl,
    });
    await ensureStoredAvatarExists(input.avatarUrl);
  }

  const result = await db.transaction(async (tx) => {
    const [existingChild] = await tx
      .select()
      .from(children)
      .where(and(
        eq(children.organizationId, organizationId),
        eq(children.creationIdempotencyKey, input.idempotencyKey),
      ))
      .limit(1);

    if (existingChild) {
      const [existingBinding] = await tx
        .select({ device })
        .from(childDeviceBindings)
        .innerJoin(device, eq(device.id, childDeviceBindings.deviceId))
        .where(and(eq(childDeviceBindings.childId, existingChild.id), isNull(childDeviceBindings.unboundAt)))
        .limit(1);

      return { child: existingChild, device: existingBinding?.device ?? null };
    }

    // Looked up by token hash alone. The expiry and ownership checks happen
    // below so each failure gets a distinct code — folding them into the WHERE
    // clause made every cause collapse into "expired", including the common
    // case of a retry after a create that already succeeded.
    const [deviceRecord] = await tx
      .select()
      .from(devices)
      .where(eq(devices.reservationTokenHash, sha256(input.deviceReservationToken)))
      .limit(1)
      .for("update");

    if (!deviceRecord) {
      throw typedConflict(
        "RESERVATION_EXPIRED",
        "This shoe reservation is no longer valid. Scan the shoe again.",
      );
    }

    const isOwnReservation = deviceRecord.reservedByUserId === userId
      && deviceRecord.reservedByOrganizationId === organizationId;

    if (!isOwnReservation) {
      throw typedConflict(
        "RESERVATION_HELD_BY_ANOTHER_USER",
        "This shoe is being set up by someone else.",
      );
    }

    // The hash survives a successful claim, so an active device carrying this
    // token means the create already committed. Return the child that was
    // created rather than reporting a spurious expiry.
    if (deviceRecord.status === "active") {
      const [consumedBinding] = await tx
        .select({ child: children, device })
        .from(childDeviceBindings)
        .innerJoin(children, eq(children.id, childDeviceBindings.childId))
        .innerJoin(device, eq(device.id, childDeviceBindings.deviceId))
        .where(and(
          eq(childDeviceBindings.deviceId, deviceRecord.id),
          isNull(childDeviceBindings.unboundAt),
        ))
        .limit(1);

      if (consumedBinding && consumedBinding.child.organizationId === organizationId) {
        return { child: consumedBinding.child, device: consumedBinding.device };
      }

      throw typedConflict(
        "RESERVATION_ALREADY_CONSUMED",
        "This shoe is already attached to a child.",
      );
    }

    if (deviceRecord.status === "blocked") {
      throw typedConflict("DEVICE_BLOCKED", "This shoe has been blocked.");
    }

    if (deviceRecord.status !== "fresh" && deviceRecord.status !== "inactive") {
      throw typedConflict("DEVICE_NOT_CLAIMABLE", "This shoe cannot be set up right now.");
    }

    if (!deviceRecord.reservedUntil || deviceRecord.reservedUntil <= new Date()) {
      throw typedConflict(
        "RESERVATION_EXPIRED",
        "This shoe reservation expired. Scan the shoe again.",
      );
    }

    const [activeBinding] = await tx
      .select()
      .from(childDeviceBindings)
      .where(and(eq(childDeviceBindings.deviceId, deviceRecord.id), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    if (activeBinding) {
      throw typedConflict(
        "DEVICE_BOUND_ELSEWHERE",
        "This shoe is already attached to another child.",
      );
    }

    const [child] = await tx
      .insert(children)
      .values({
        parentUserId: userId,
        organizationId,
        name: input.name,
        avatarUrl: input.avatarUrl,
        schoolName: schoolPlace.label,
        schoolPlaceId: schoolPlace.id,
        dateOfBirth: input.dateOfBirth,
        creationIdempotencyKey: input.idempotencyKey,
      })
      .returning();

    await tx.insert(childDeviceBindings).values({
      childId: child.id,
      deviceId: deviceRecord.id,
    });
    await claimDevice(tx, deviceRecord.id, organizationId, userId);

    // `reservationTokenHash` is deliberately retained. Nulling it destroyed the
    // only evidence that this token was consumed successfully, so a retry after
    // a lost response looked identical to an expired reservation.
    // `status: "active"` is what marks it consumed.
    const [updatedDevice] = await tx
      .update(devices)
      .set({
        status: "active",
        reservedByOrganizationId: organizationId,
        reservedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, deviceRecord.id))
      .returning();

    // Inside the transaction: a commit that left onboarding incomplete created a
    // durable state where the child existed but the client was still routed back
    // to the scanner.
    await tx
      .update(users)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { child, device: updatedDevice };
  });

  const activePlan = await getActiveSubscriptionForChild(result.child.id);
  const resolvedSchoolPlace = await getSchoolPlaceById(result.child.schoolPlaceId);
  return toChildDetailDto({
    child: result.child,
    snapshot: null,
    device: result.device,
    activePlan,
    schoolPlace: resolvedSchoolPlace,
  });
}

export async function getChildForOrganization(organizationId: string, childId: string) {
  const [row] = await db
    .select({
      child: children,
      snapshot: childStatusSnapshots,
      device,
    })
    .from(children)
    .leftJoin(childStatusSnapshots, eq(childStatusSnapshots.childId, children.id))
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.childId, children.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(device, eq(device.id, childDeviceBindings.deviceId))
    .where(and(eq(children.organizationId, organizationId), eq(children.id, childId)))
    .limit(1);

  if (!row) {
    throw notFound("CHILD_NOT_FOUND", "Child not found.");
  }

  const activePlan = await getActiveSubscriptionForChild(row.child.id);
  const schoolPlace = await getSchoolPlaceById(row.child.schoolPlaceId);
  return toChildDetailDto({
    child: row.child,
    snapshot: row.snapshot,
    device: row.device,
    activePlan,
    schoolPlace,
  });
}

export async function getChildGeofenceForOrganization(organizationId: string, childId: string): Promise<ChildGeofenceDto> {
  await getChildForOrganization(organizationId, childId);

  const [geofence] = await db
    .select()
    .from(childGeofences)
    .where(and(eq(childGeofences.organizationId, organizationId), eq(childGeofences.childId, childId)))
    .limit(1);

  return toChildGeofenceDto(geofence ?? null);
}

export async function updateChildGeofenceForOrganization(
  organizationId: string,
  childId: string,
  input: UpdateChildGeofenceInput,
): Promise<ChildGeofenceDto> {
  await getChildForOrganization(organizationId, childId);

  if (input.status === "enabled") {
    if (input.centerLatitude == null || input.centerLongitude == null || input.radiusMeters == null) {
      throw badRequest("Center and radius are required when enabling a geofence.");
    }

    if (input.radiusMeters < 0 || input.radiusMeters > 10000) {
      throw badRequest("Geofence radius must be between 0 and 10000 meters.");
    }
  }

  const now = new Date();

  const [saved] = await db
    .insert(childGeofences)
    .values({
      childId,
      organizationId,
      status: input.status,
      containmentState: input.status === "enabled" ? "unknown" : "unknown",
      candidateState: "unknown",
      candidateSampleCount: 0,
      centerLatitude: input.centerLatitude?.toFixed(6) ?? null,
      centerLongitude: input.centerLongitude?.toFixed(6) ?? null,
      radiusMeters: input.radiusMeters ?? null,
      breachedAt: null,
      lastReenteredAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: childGeofences.childId,
      set: {
        status: input.status,
        containmentState: "unknown",
        candidateState: "unknown",
        candidateSampleCount: 0,
        generation: input.status === "enabled"
          ? sql`${childGeofences.generation} + 1`
          : childGeofences.generation,
        centerLatitude: input.status === "enabled"
          ? input.centerLatitude?.toFixed(6) ?? null
          : input.centerLatitude === undefined
            ? childGeofences.centerLatitude
            : input.centerLatitude?.toFixed(6) ?? null,
        centerLongitude: input.status === "enabled"
          ? input.centerLongitude?.toFixed(6) ?? null
          : input.centerLongitude === undefined
            ? childGeofences.centerLongitude
            : input.centerLongitude?.toFixed(6) ?? null,
        radiusMeters: input.status === "enabled"
          ? input.radiusMeters ?? null
          : input.radiusMeters === undefined
            ? childGeofences.radiusMeters
            : input.radiusMeters ?? null,
        breachedAt: null,
        updatedAt: now,
      },
    })
    .returning();

  return toChildGeofenceDto(saved);
}

export async function resetChildGeofenceForOrganization(
  organizationId: string,
  childId: string,
): Promise<ChildGeofenceDto> {
  await getChildForOrganization(organizationId, childId);

  const [snapshot] = await db
    .select()
    .from(childStatusSnapshots)
    .where(eq(childStatusSnapshots.childId, childId))
    .limit(1);

  if (!snapshot || snapshot.lastLatitude == null || snapshot.lastLongitude == null || !snapshot.lastSeenAt) {
    throw new AppError(409, "LOCATION_UNAVAILABLE", "A current device location is required to reset this geofence.");
  }

  if (snapshot.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new AppError(409, "LOCATION_STALE", "The latest device location is too old to reset this geofence.");
  }

  const [existing] = await db
    .select()
    .from(childGeofences)
    .where(and(eq(childGeofences.organizationId, organizationId), eq(childGeofences.childId, childId)))
    .limit(1);

  if (!existing || existing.status !== "enabled" || existing.radiusMeters == null) {
    throw notFound("GEOFENCE_NOT_FOUND", "Active geofence not found.");
  }

  const now = new Date();
  const [saved] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(childGeofences)
      .set({
        status: "enabled",
        centerLatitude: Number(snapshot.lastLatitude).toFixed(6),
        centerLongitude: Number(snapshot.lastLongitude).toFixed(6),
        radiusMeters: existing.radiusMeters,
        containmentState: "inside",
        candidateState: "unknown",
        candidateSampleCount: 0,
        generation: existing.generation + 1,
        lastDistanceMeters: "0.00",
        lastEvaluatedAt: now,
        breachedAt: null,
        updatedAt: now,
      })
      .where(eq(childGeofences.id, existing.id))
      .returning();

    if (!updated) {
      throw notFound("GEOFENCE_NOT_FOUND", "Active geofence not found.");
    }

    await createGeofenceEvent(tx, {
      dedupKey: `${updated.id}:${updated.generation}:reset:${now.toISOString()}`,
      distanceMeters: 0,
      eventType: "reset",
      geofence: updated,
      latitude: Number(snapshot.lastLatitude),
      longitude: Number(snapshot.lastLongitude),
      occurredAt: now,
      radiusMeters: updated.radiusMeters,
    });

    return [updated] as const;
  });

  return toChildGeofenceDto(saved);
}

export async function updateChildForOrganization(
  organizationId: string,
  childId: string,
  input: UpdateChildInput,
  options?: { userId?: string },
) {
  await getChildForOrganization(organizationId, childId);
  const schoolPlace = input.schoolPlaceId ? await getRequiredSchoolPlace(input.schoolPlaceId) : null;

  if (input.avatarUrl && isStoredAvatarPath(input.avatarUrl)) {
    if (!options?.userId) {
      throw new AppError(401, "UNAUTHORIZED", "User is required to update a stored child photo.");
    }

    assertChildAvatarOwnership({
      organizationId,
      userId: options.userId,
      path: input.avatarUrl,
    });
    await ensureStoredAvatarExists(input.avatarUrl);
  }

  const [child] = await db
    .update(children)
    .set({
      name: input.name,
      avatarUrl: input.avatarUrl,
      dateOfBirth: input.dateOfBirth,
      schoolName: schoolPlace ? schoolPlace.label : undefined,
      schoolPlaceId: schoolPlace ? schoolPlace.id : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(children.id, childId), eq(children.organizationId, organizationId)))
    .returning();

  const [snapshotRow] = await db.select().from(childStatusSnapshots).where(eq(childStatusSnapshots.childId, childId)).limit(1);
  const [bindingRow] = await db
    .select({ device })
    .from(childDeviceBindings)
    .innerJoin(device, eq(device.id, childDeviceBindings.deviceId))
    .where(and(eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt)))
    .limit(1);

  const activePlan = await getActiveSubscriptionForChild(child.id);
  return toChildDetailDto({
    child,
    snapshot: snapshotRow ?? null,
    device: bindingRow?.device ?? null,
    activePlan,
    schoolPlace: await getSchoolPlaceById(child.schoolPlaceId),
  });
}

export async function unlinkChildDeviceForOrganization(
  organizationId: string,
  childId: string,
): Promise<UnlinkChildDeviceResultDto> {
  const [child] = await db
    .select()
    .from(children)
    .where(and(
      eq(children.id, childId),
      eq(children.organizationId, organizationId),
      eq(children.status, "active"),
    ))
    .limit(1);

  if (!child) {
    throw notFound("CHILD_NOT_FOUND", "Child not found.");
  }

  return db.transaction(async (tx) => {
    const [binding] = await tx
      .select({
        binding: childDeviceBindings,
        device,
      })
      .from(childDeviceBindings)
      .innerJoin(device, eq(device.id, childDeviceBindings.deviceId))
      .where(and(eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    if (!binding) {
      return {
        childId,
        deviceId: null,
        hardwareIdentifier: null,
        unlinked: false,
      };
    }

    const now = new Date();

    await tx
      .update(childDeviceBindings)
      .set({
        unboundAt: now,
        updatedAt: now,
      })
      .where(eq(childDeviceBindings.id, binding.binding.id));

    // Releasing the device retires its consumed reservation token. createChild
    // keeps the hash to detect replays, so it has to be cleared here or an old
    // token would keep resolving to this device forever.
    await tx
      .update(devices)
      .set({
        status: "inactive",
        reservedByUserId: null,
        reservedByOrganizationId: null,
        reservationTokenHash: null,
        reservedUntil: null,
        updatedAt: now,
      })
      .where(eq(devices.id, binding.binding.deviceId));

    return {
      childId,
      deviceId: binding.binding.deviceId,
      hardwareIdentifier: binding.device.hardwareIdentifier,
      unlinked: true,
    };
  });
}

export async function bindReservedDeviceToChild(input: {
  organizationId: string;
  userId: string;
  childId: string;
  deviceReservationToken: string;
}): Promise<BindChildDeviceResultDto> {
  const [child] = await db
    .select()
    .from(children)
    .where(and(
      eq(children.id, input.childId),
      eq(children.organizationId, input.organizationId),
      eq(children.status, "active"),
    ))
    .limit(1);

  if (!child) {
    throw notFound("CHILD_NOT_FOUND", "Child not found.");
  }

  const now = new Date();
  const reservationTokenHash = sha256(input.deviceReservationToken);

  return db.transaction(async (tx) => {
    const [activeBinding] = await tx
      .select({ id: childDeviceBindings.id })
      .from(childDeviceBindings)
      .where(and(eq(childDeviceBindings.childId, input.childId), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    if (activeBinding) {
      throw typedConflict(
        "CHILD_ALREADY_HAS_DEVICE",
        "This child already has a shoe connected.",
      );
    }

    // Same split as createChild: look up by token hash, then decide why it
    // failed, so the client can tell a retry apart from a real expiry.
    const [reservedDevice] = await tx
      .select()
      .from(devices)
      .where(eq(devices.reservationTokenHash, reservationTokenHash))
      .limit(1)
      .for("update");

    if (!reservedDevice) {
      throw typedConflict(
        "RESERVATION_EXPIRED",
        "This shoe reservation is no longer valid. Scan the shoe again.",
      );
    }

    if (
      reservedDevice.reservedByUserId !== input.userId
      || reservedDevice.reservedByOrganizationId !== input.organizationId
    ) {
      throw typedConflict(
        "RESERVATION_HELD_BY_ANOTHER_USER",
        "This shoe is being set up by someone else.",
      );
    }

    if (reservedDevice.status === "blocked") {
      throw typedConflict("DEVICE_BLOCKED", "This shoe has been blocked.");
    }

    if (reservedDevice.status === "active") {
      throw typedConflict(
        "RESERVATION_ALREADY_CONSUMED",
        "This shoe is already attached to a child.",
      );
    }

    if (reservedDevice.status !== "fresh" && reservedDevice.status !== "inactive") {
      throw typedConflict("DEVICE_NOT_CLAIMABLE", "This shoe cannot be set up right now.");
    }

    if (!reservedDevice.reservedUntil || reservedDevice.reservedUntil <= now) {
      throw typedConflict(
        "RESERVATION_EXPIRED",
        "This shoe reservation expired. Scan the shoe again.",
      );
    }

    const [deviceBinding] = await tx
      .select({ id: childDeviceBindings.id })
      .from(childDeviceBindings)
      .where(and(eq(childDeviceBindings.deviceId, reservedDevice.id), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    if (deviceBinding) {
      throw typedConflict(
        "DEVICE_BOUND_ELSEWHERE",
        "This shoe is already attached to another child.",
      );
    }

    await tx.insert(childDeviceBindings).values({
      childId: input.childId,
      deviceId: reservedDevice.id,
    });
    await claimDevice(tx, reservedDevice.id, input.organizationId, input.userId, now);

    // Token hash retained so a replayed bind reports ALREADY_CONSUMED rather
    // than a misleading expiry. See the note in createChild.
    await tx
      .update(devices)
      .set({
        status: "active",
        reservedByOrganizationId: input.organizationId,
        reservedUntil: null,
        updatedAt: now,
      })
      .where(eq(devices.id, reservedDevice.id));

    return {
      childId: input.childId,
      deviceId: reservedDevice.id,
      hardwareIdentifier: reservedDevice.hardwareIdentifier,
      linked: true,
    };
  });
}

export async function archiveChildForOrganization(organizationId: string, childId: string): Promise<ArchiveChildResultDto> {
  await getChildForOrganization(organizationId, childId);

  const result = await db.transaction(async (tx) => {
    const [activeBinding] = await tx
      .select({
        binding: childDeviceBindings,
        device,
      })
      .from(childDeviceBindings)
      .innerJoin(device, eq(device.id, childDeviceBindings.deviceId))
      .where(and(eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt)))
      .limit(1);

    const now = new Date();

    await tx
      .update(children)
      .set({
        status: "archived",
        updatedAt: now,
      })
      .where(and(eq(children.id, childId), eq(children.organizationId, organizationId)));

    const [binding] = await tx
      .update(childDeviceBindings)
      .set({
        unboundAt: now,
        updatedAt: now,
      })
      .where(and(eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt)))
      .returning();

    // An archived child must not stay visible through a live link.
    const revokedShareIds = await revokeActiveShareLinksForChildren(tx, [childId], now);

    if (binding) {
      // Same reason as unlinkChildDevice: retire the consumed reservation token.
      await tx
        .update(devices)
        .set({
          status: "inactive",
          reservedByUserId: null,
          reservedByOrganizationId: null,
          reservationTokenHash: null,
          reservedUntil: null,
          updatedAt: now,
        })
        .where(eq(devices.id, binding.deviceId));
    }

    return {
      revokedShareIds,
      response: {
        id: childId,
        archived: true,
        deviceHardwareIdentifier: activeBinding?.device.hardwareIdentifier ?? null,
      } satisfies ArchiveChildResultDto,
    };
  });

  await publicShareRealtimeRegistry.endShares(result.revokedShareIds, "stopped");
  return result.response;
}
