import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import {
  TELEMETRY_OFFLINE_AFTER_MS,
  TELEMETRY_STALE_AFTER_MS,
  type AdminBulkCreateDeviceResultDto,
  type AdminCreateDeviceInput,
  type AdminDeviceDetailDto,
  type AdminDeviceDto,
  type AdminDeviceListResponseDto,
  type AdminDeviceOwnershipDto,
  type AdminDevicesListQuery,
  type DeviceReservationDto,
} from "@stepwhere/types";

import { db } from "../../db/client";
import { assertDeviceOwnership, claimDevice } from "../billing/billing-ownership.service";
import { childDeviceBindings, children, deviceOwnerships, devices, locationEvents, organizations } from "../../db/schema";
import { generateOpaqueToken, sha256 } from "../../shared/crypto";
import { conflict, notFound, unauthorized } from "../../shared/errors";
import { toIsoString } from "../../shared/mappers";
import { toAdminDeviceFirmwareDto } from "./device-firmware.mapper";
import { buildPaginatedResponse, parseAdminListQuery } from "../admin/admin-list-query";
import { getAdminDeviceTelemetryReliability } from "../admin/admin-device-reliability.service";

const DEVICE_RESERVATION_MS = 1000 * 60 * 10;

export function normalizeHardwareIdentifier(hardwareIdentifier: string) {
  return hardwareIdentifier.trim().toUpperCase();
}

type AdminDeviceRow = {
  device: typeof devices.$inferSelect;
  binding: typeof childDeviceBindings.$inferSelect | null;
  child: typeof children.$inferSelect | null;
};

export function toAdminDeviceDto(input: typeof devices.$inferSelect | AdminDeviceRow): AdminDeviceDto {
  const device = "device" in input ? input.device : input;
  const binding = "binding" in input ? input.binding : null;
  const child = "child" in input ? input.child : null;

  return {
    id: device.id,
    hardwareIdentifier: device.hardwareIdentifier,
    displayName: device.displayName,
    platform: device.platform,
    status: device.status,
    lastSeenAt: toIsoString(device.lastSeenAt),
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    activeBinding: binding && child
      ? {
        id: binding.id,
        childId: child.id,
        childName: child.name,
        childAvatarUrl: child.avatarUrl,
        organizationId: child.organizationId,
        boundAt: binding.boundAt.toISOString(),
      }
      : null,
    reservation: {
      reservedByUserId: device.reservedByUserId,
      reservedByOrganizationId: device.reservedByOrganizationId,
      reservedUntil: toIsoString(device.reservedUntil),
    },
    firmware: toAdminDeviceFirmwareDto(device),
  };
}

async function getAdminDeviceRow(deviceId: string) {
  const [row] = await db
    .select({
      device: devices,
      binding: childDeviceBindings,
      child: children,
    })
    .from(devices)
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(children, eq(children.id, childDeviceBindings.childId))
    .where(eq(devices.id, deviceId))
    .limit(1);

  return row ?? null;
}

const DEVICE_SORTS = [
  "createdAt",
  "hardwareIdentifier",
  "displayName",
  "status",
  "lastSeenAt",
  "platform",
] as const;

type DeviceSort = typeof DEVICE_SORTS[number];

function toDeviceOrderBy(sort: DeviceSort, dir: "asc" | "desc") {
  const order = dir === "asc" ? asc : desc;

  switch (sort) {
    case "hardwareIdentifier":
      return order(devices.hardwareIdentifier);
    case "displayName":
      return order(devices.displayName);
    case "status":
      return order(devices.status);
    case "lastSeenAt":
      return dir === "asc"
        ? sql`${devices.lastSeenAt} asc nulls last`
        : sql`${devices.lastSeenAt} desc nulls last`;
    case "platform":
      return order(devices.platform);
    case "createdAt":
    default:
      return order(devices.createdAt);
  }
}

export function prepareBulkCreateDevices(inputs: AdminCreateDeviceInput[]) {
  const created: Array<{
    hardwareIdentifier: string;
    displayName: string | null;
    platform: "android" | "ios" | "embedded" | "unknown";
    status: "fresh" | "active" | "inactive" | "blocked";
  }> = [];
  const skipped: AdminBulkCreateDeviceResultDto["skipped"] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const hardwareIdentifier = normalizeHardwareIdentifier(input.hardwareIdentifier);

    if (!hardwareIdentifier) {
      skipped.push({
        hardwareIdentifier: input.hardwareIdentifier,
        reason: "Hardware identifier is required.",
      });
      continue;
    }

    if (seen.has(hardwareIdentifier)) {
      skipped.push({
        hardwareIdentifier,
        reason: "Duplicate hardware identifier in request.",
      });
      continue;
    }

    seen.add(hardwareIdentifier);
    created.push({
      hardwareIdentifier,
      displayName: input.displayName ?? null,
      platform: input.platform ?? "unknown",
      status: input.status ?? "fresh",
    });
  }

  return {
    prepared: created,
    skipped,
  };
}

export async function registerDevice(input: {
  hardwareIdentifier: string;
  displayName?: string | null;
  platform?: "android" | "ios" | "embedded" | "unknown";
}) {
  const hardwareIdentifier = normalizeHardwareIdentifier(input.hardwareIdentifier);
  const rawToken = generateOpaqueToken();
  const authTokenHash = sha256(rawToken);
  const [existing] = await db
    .select()
    .from(devices)
    .where(eq(devices.hardwareIdentifier, hardwareIdentifier))
    .limit(1);

  let device: typeof devices.$inferSelect;

  if (existing) {
    [device] = await db
      .update(devices)
      .set({
        displayName: input.displayName ?? existing.displayName,
        platform: input.platform ?? existing.platform,
        status: existing.status,
        authTokenHash,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, existing.id))
      .returning();
  } else {
    [device] = await db
      .insert(devices)
      .values({
        hardwareIdentifier,
        displayName: input.displayName ?? null,
        platform: input.platform ?? "unknown",
        status: "fresh",
        authTokenHash,
      })
      .returning();
  }

  return {
    device: toAdminDeviceDto(device),
    token: rawToken,
  };
}

export async function authenticateDeviceToken(rawToken: string) {
  const tokenHash = sha256(rawToken);
  const [device] = await db.select().from(devices).where(eq(devices.authTokenHash, tokenHash)).limit(1);

  if (!device) {
    throw unauthorized("Device authentication failed.");
  }

  if (device.status !== "active") {
    throw unauthorized("Device is not active.");
  }

  return device;
}

export async function rotateDeviceToken(deviceId: string) {
  const rawToken = generateOpaqueToken();
  const [device] = await db
    .update(devices)
    .set({
      authTokenHash: sha256(rawToken),
      updatedAt: new Date(),
    })
    .where(eq(devices.id, deviceId))
    .returning();

  if (!device) {
    throw notFound("NOT_FOUND", "Device not found.");
  }

  return {
    device: toAdminDeviceDto(device),
    token: rawToken,
  };
}

export async function getActiveBindingForDevice(deviceId: string) {
  const [binding] = await db
    .select({
      binding: childDeviceBindings,
      child: children,
    })
    .from(childDeviceBindings)
    .innerJoin(children, eq(children.id, childDeviceBindings.childId))
    .where(and(eq(childDeviceBindings.deviceId, deviceId), isNull(childDeviceBindings.unboundAt)))
    .limit(1);

  if (!binding) {
    throw notFound("NOT_FOUND", "No active child binding found for device.");
  }

  return binding;
}

export async function listDevices() {
  const rows = await db
    .select({
      device: devices,
      binding: childDeviceBindings,
      child: children,
    })
    .from(devices)
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(children, eq(children.id, childDeviceBindings.childId))
    .orderBy(devices.createdAt);

  return rows.map(toAdminDeviceDto);
}

export async function listAdminDevices(input: AdminDevicesListQuery): Promise<AdminDeviceListResponseDto> {
  const query = parseAdminListQuery(input, {
    defaultSort: "createdAt",
    allowedSorts: DEVICE_SORTS,
  });
  const now = Date.now();
  const staleCutoff = new Date(now - TELEMETRY_STALE_AFTER_MS);
  const offlineCutoff = new Date(now - TELEMETRY_OFFLINE_AFTER_MS);
  const latestDeviceStates = db
    .selectDistinctOn([locationEvents.deviceId], {
      deviceId: locationEvents.deviceId,
      deviceState: locationEvents.deviceState,
    })
    .from(locationEvents)
    .orderBy(locationEvents.deviceId, desc(locationEvents.ingestedAt))
    .as("latest_device_states");

  const filters: SQL[] = [];

  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(or(
      ilike(devices.hardwareIdentifier, pattern),
      ilike(devices.displayName, pattern),
      ilike(children.name, pattern),
    ) as SQL);
  }

  if (input.status) {
    filters.push(eq(devices.status, input.status));
  }

  if (input.platform) {
    filters.push(eq(devices.platform, input.platform));
  }

  if (input.binding === "bound") {
    filters.push(isNull(childDeviceBindings.unboundAt));
  } else if (input.binding === "unbound") {
    filters.push(isNull(childDeviceBindings.id));
  }

  const hasActiveOrUnknownFirmwareState = or(
    isNull(latestDeviceStates.deviceState),
    eq(latestDeviceStates.deviceState, "active"),
  ) as SQL;

  if (input.connection === "connected") {
    filters.push(and(
      ne(devices.status, "blocked"),
      hasActiveOrUnknownFirmwareState,
      gte(devices.lastSeenAt, staleCutoff),
    ) as SQL);
  } else if (input.connection === "stale") {
    filters.push(and(
      ne(devices.status, "blocked"),
      hasActiveOrUnknownFirmwareState,
      gte(devices.lastSeenAt, offlineCutoff),
      lt(devices.lastSeenAt, staleCutoff),
    ) as SQL);
  } else if (input.connection === "offline") {
    filters.push(or(
      eq(devices.status, "blocked"),
      eq(latestDeviceStates.deviceState, "offline"),
      and(
        hasActiveOrUnknownFirmwareState,
        isNotNull(devices.lastSeenAt),
        lt(devices.lastSeenAt, offlineCutoff),
      ),
    ) as SQL);
  } else if (input.connection === "sleep") {
    filters.push(and(
      ne(devices.status, "blocked"),
      eq(latestDeviceStates.deviceState, "sleep"),
    ) as SQL);
  } else if (input.connection === "never") {
    filters.push(and(
      ne(devices.status, "blocked"),
      isNull(devices.lastSeenAt),
    ) as SQL);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [totalRow] = await db
    .select({ total: count() })
    .from(devices)
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(children, eq(children.id, childDeviceBindings.childId))
    .leftJoin(latestDeviceStates, eq(latestDeviceStates.deviceId, devices.id))
    .where(where);

  const rows = await db
    .select({
      device: devices,
      binding: childDeviceBindings,
      child: children,
    })
    .from(devices)
    .leftJoin(
      childDeviceBindings,
      and(eq(childDeviceBindings.deviceId, devices.id), isNull(childDeviceBindings.unboundAt)),
    )
    .leftJoin(children, eq(children.id, childDeviceBindings.childId))
    .leftJoin(latestDeviceStates, eq(latestDeviceStates.deviceId, devices.id))
    .where(where)
    .orderBy(toDeviceOrderBy(query.sort, query.dir), desc(devices.id))
    .limit(query.pageSize)
    .offset(query.offset);

  const reliabilityByDevice = await getAdminDeviceTelemetryReliability(
    rows.map(({ device }) => ({
      id: device.id,
      lastSeenAt: device.lastSeenAt,
    })),
  );
  const items = rows.map((row) => ({
    ...toAdminDeviceDto(row),
    telemetryReliability: reliabilityByDevice.get(row.device.id)!,
  }));

  return buildPaginatedResponse({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: totalRow?.total ?? 0,
  });
}

/** The active (unreleased) family claim on a shoe, if any. Read-only. */
export async function getActiveDeviceOwnership(deviceId: string): Promise<AdminDeviceOwnershipDto | null> {
  const [owner] = await db
    .select({
      organizationId: deviceOwnerships.organizationId,
      organizationName: organizations.name,
      claimedAt: deviceOwnerships.claimedAt,
    })
    .from(deviceOwnerships)
    .leftJoin(organizations, eq(organizations.id, deviceOwnerships.organizationId))
    .where(and(
      eq(deviceOwnerships.deviceId, deviceId),
      isNull(deviceOwnerships.releasedAt),
      isNotNull(deviceOwnerships.organizationId),
    ))
    .limit(1);

  return owner?.organizationId
    ? {
      organizationId: owner.organizationId,
      organizationName: owner.organizationName ?? null,
      claimedAt: owner.claimedAt.toISOString(),
    }
    : null;
}

export async function getAdminDeviceById(deviceId: string): Promise<AdminDeviceDetailDto | null> {
  const row = await getAdminDeviceRow(deviceId);
  if (!row) {
    return null;
  }

  const [reliabilityByDevice, ownership] = await Promise.all([
    getAdminDeviceTelemetryReliability([{
      id: row.device.id,
      lastSeenAt: row.device.lastSeenAt,
    }]),
    getActiveDeviceOwnership(row.device.id),
  ]);

  return {
    ...toAdminDeviceDto(row),
    telemetryReliability: reliabilityByDevice.get(row.device.id)!,
    ownership,
  };
}

export async function createDevice(input: {
  hardwareIdentifier: string;
  displayName?: string | null;
  platform?: "android" | "ios" | "embedded" | "unknown";
  status?: "fresh" | "active" | "inactive" | "blocked";
}) {
  const hardwareIdentifier = normalizeHardwareIdentifier(input.hardwareIdentifier);
  const [existing] = await db.select().from(devices).where(eq(devices.hardwareIdentifier, hardwareIdentifier)).limit(1);

  if (existing) {
    throw conflict("Device hardware identifier already exists.");
  }

  const [device] = await db.insert(devices).values({
    hardwareIdentifier,
    displayName: input.displayName ?? null,
    platform: input.platform ?? "unknown",
    status: input.status ?? "fresh",
  }).returning();

  return toAdminDeviceDto(device);
}

export async function bulkCreateDevices(input: {
  devices: AdminCreateDeviceInput[];
}): Promise<AdminBulkCreateDeviceResultDto> {
  const prepared = prepareBulkCreateDevices(input.devices);
  const requestedIdentifiers = prepared.prepared.map((device) => device.hardwareIdentifier);
  const existingIdentifiers = requestedIdentifiers.length === 0
    ? new Set<string>()
    : new Set(
      (await db
        .select({ hardwareIdentifier: devices.hardwareIdentifier })
        .from(devices)
        .where(inArray(devices.hardwareIdentifier, requestedIdentifiers)))
        .map((row) => row.hardwareIdentifier),
    );

  const toInsert = prepared.prepared.filter((device) => !existingIdentifiers.has(device.hardwareIdentifier));
  const skipped = [
    ...prepared.skipped,
    ...prepared.prepared
      .filter((device) => existingIdentifiers.has(device.hardwareIdentifier))
      .map((device) => ({
        hardwareIdentifier: device.hardwareIdentifier,
        reason: "Device hardware identifier already exists.",
      })),
  ];

  const inserted = toInsert.length === 0
    ? []
    : await db.insert(devices).values(toInsert).returning();

  return {
    created: inserted.map(toAdminDeviceDto),
    skipped,
  };
}

export async function updateDevice(deviceId: string, input: Partial<{
  hardwareIdentifier: string;
  displayName: string | null;
  platform: "android" | "ios" | "embedded" | "unknown";
  status: "fresh" | "active" | "inactive" | "blocked";
}>) {
  const hardwareIdentifier = input.hardwareIdentifier
    ? normalizeHardwareIdentifier(input.hardwareIdentifier)
    : undefined;

  if (hardwareIdentifier) {
    const [existing] = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.hardwareIdentifier, hardwareIdentifier))
      .limit(1);

    if (existing && existing.id !== deviceId) {
      throw conflict("Device hardware identifier already exists.");
    }
  }

  const [device] = await db.update(devices).set({
    hardwareIdentifier,
    displayName: input.displayName,
    platform: input.platform,
    status: input.status,
    updatedAt: new Date(),
  }).where(eq(devices.id, deviceId)).returning();

  if (!device) {
    throw notFound("NOT_FOUND", "Device not found.");
  }

  const row = await getAdminDeviceRow(device.id);
  return row ? toAdminDeviceDto(row) : toAdminDeviceDto(device);
}

export async function bindDevice(deviceId: string, childId: string) {
  await db.transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(eq(devices.id, deviceId)).limit(1).for("update");
    const [child] = await tx.select().from(children).where(eq(children.id, childId)).limit(1);

    if (!device) {
      throw notFound("NOT_FOUND", "Device not found.");
    }

    if (!child) {
      throw notFound("NOT_FOUND", "Child not found.");
    }

    if (device.status === "blocked") {
      throw conflict("This device is blocked.");
    }

    await claimDevice(tx, deviceId, child.organizationId, child.parentUserId);

    await tx.update(childDeviceBindings)
      .set({ unboundAt: new Date(), updatedAt: new Date() })
      .where(and(eq(childDeviceBindings.deviceId, deviceId), isNull(childDeviceBindings.unboundAt)));

    await tx.update(childDeviceBindings)
      .set({ unboundAt: new Date(), updatedAt: new Date() })
      .where(and(eq(childDeviceBindings.childId, childId), isNull(childDeviceBindings.unboundAt)));

    await tx.insert(childDeviceBindings).values({
      childId,
      deviceId,
    });

    await tx.update(devices).set({
      status: "active",
      reservedByUserId: null,
      reservedByOrganizationId: null,
      reservationTokenHash: null,
      reservedUntil: null,
      updatedAt: new Date(),
    }).where(eq(devices.id, deviceId));
  });

  return { childId, deviceId, bound: true };
}

export async function unbindDevice(deviceId: string) {
  const [binding] = await db.update(childDeviceBindings).set({
    unboundAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(childDeviceBindings.deviceId, deviceId), isNull(childDeviceBindings.unboundAt))).returning();

  if (!binding) {
    throw notFound("NOT_FOUND", "Active device binding not found.");
  }

  // Clear the consumed reservation token alongside the status. createChild keeps
  // the hash to recognise replays, so leaving it here would let a long-dead
  // token keep resolving to this device.
  await db.update(devices).set({
    status: "inactive",
    reservedByUserId: null,
    reservedByOrganizationId: null,
    reservationTokenHash: null,
    reservedUntil: null,
    updatedAt: new Date(),
  }).where(eq(devices.id, deviceId));

  return { childId: binding.childId, deviceId, unbound: true };
}

export async function reserveDeviceForOnboarding(input: {
  organizationId: string;
  userId: string;
  hardwareIdentifier: string;
}): Promise<DeviceReservationDto> {
  const hardwareIdentifier = normalizeHardwareIdentifier(input.hardwareIdentifier);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_RESERVATION_MS);
  const reservationToken = generateOpaqueToken(24);

  const device = await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(devices)
      .where(eq(devices.hardwareIdentifier, hardwareIdentifier))
      .limit(1)
      .for("update");

    if (!record) {
      throw notFound("NOT_FOUND", "Device ID was not found.");
    }

    await assertDeviceOwnership(tx, record.id, input.organizationId);

    if (record.status === "blocked") {
      throw conflict("This device is blocked.");
    }

    if (record.status === "active") {
      throw conflict("This device is already attached to a child.");
    }

    const isReservedBySameUser = record.reservedByUserId === input.userId
      && record.reservedByOrganizationId === input.organizationId
      && !!record.reservedUntil
      && record.reservedUntil > now;

    const isReservedByAnotherUser = !!record.reservedUntil
      && record.reservedUntil > now
      && !isReservedBySameUser;

    if (isReservedByAnotherUser) {
      throw conflict("This device is already reserved.");
    }

    const [updated] = await tx
      .update(devices)
      .set({
        reservedByUserId: input.userId,
        reservedByOrganizationId: input.organizationId,
        reservationTokenHash: sha256(reservationToken),
        reservedUntil: expiresAt,
        updatedAt: now,
      })
      .where(eq(devices.id, record.id))
      .returning();

    return updated;
  });

  return {
    deviceId: device.id,
    hardwareIdentifier: device.hardwareIdentifier,
    displayName: device.displayName,
    status: device.status as "fresh" | "inactive",
    reservationToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function releaseDeviceReservation(input: {
  organizationId: string;
  userId: string;
}) {
  const [device] = await db
    .update(devices)
    .set({
      reservedByUserId: null,
      reservedByOrganizationId: null,
      reservationTokenHash: null,
      reservedUntil: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(devices.reservedByUserId, input.userId),
      eq(devices.reservedByOrganizationId, input.organizationId),
      gt(devices.reservedUntil, new Date()),
    ))
    .returning();

  return {
    released: Boolean(device),
  };
}
