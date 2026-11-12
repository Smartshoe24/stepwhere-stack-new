import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type {
  ChildHistoryDayResponseDto,
  ChildHistoryEventDto,
  ChildHistoryGapEventDto,
  ChildHistoryRangeResponseDto,
  ChildHistoryStayEventDto,
  ChildHistoryTripEventDto,
  HistoryGeofenceEventDto,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  geofenceEvents,
  historyEvents,
  historyProcessingStates,
  locationEvents,
} from "../../db/schema";
import { badRequest } from "../../shared/errors";
import { getChildForOrganization } from "../children/children.service";
import {
  buildDevelopmentHistoryDay,
  buildDevelopmentHistoryRange,
  getEffectiveHistoryDataSource,
} from "./history-fixtures";
import { TELEMETRY_GAP_SECONDS } from "./history.constants";
import { queueExpiredHistoryPlaceRefresh } from "./history-place.service";
import { getHistoryRoadGeometry } from "./history-roads.service";
import { billingEnforced, coveragePredicate } from "../billing/billing-coverage.service";

type HistoryEventRow = typeof historyEvents.$inferSelect;

export async function getChildHistoryRangeForOrganization(
  organizationId: string,
  childId: string,
  timezone: string,
): Promise<ChildHistoryRangeResponseDto> {
  assertValidTimezone(timezone);
  await getChildForOrganization(organizationId, childId);

  if (getEffectiveHistoryDataSource() === "fixture" && !billingEnforced(organizationId)) {
    return buildDevelopmentHistoryRange({ childId, timezone });
  }

  const [range] = await db
    .select({
      firstStartedAt: sql<Date | null>`min(${historyEvents.startedAt})`,
      lastStartedAt: sql<Date | null>`max(${historyEvents.startedAt})`,
    })
    .from(historyEvents)
    .where(and(eq(historyEvents.organizationId, organizationId), eq(historyEvents.childId, childId), coveragePredicate(organizationId, historyEvents.deviceId, historyEvents.startedAt, sql`coalesce(${historyEvents.endedAt}, ${historyEvents.startedAt})`)));

  return {
    dataSource: "live",
    childId,
    timezone,
    firstDate: range?.firstStartedAt ? formatInTimeZone(range.firstStartedAt, timezone, "yyyy-MM-dd") : null,
    lastDataDate: range?.lastStartedAt ? formatInTimeZone(range.lastStartedAt, timezone, "yyyy-MM-dd") : null,
    today: formatInTimeZone(new Date(), timezone, "yyyy-MM-dd"),
  };
}

export async function getChildHistoryDayForOrganization(
  organizationId: string,
  childId: string,
  input: { date: string; timezone: string },
): Promise<ChildHistoryDayResponseDto> {
  assertValidDate(input.date);
  assertValidTimezone(input.timezone);
  await getChildForOrganization(organizationId, childId);

  if (getEffectiveHistoryDataSource() === "fixture" && !billingEnforced(organizationId)) {
    return buildDevelopmentHistoryDay({
      childId,
      date: input.date,
      timezone: input.timezone,
    });
  }

  const { startUtc, endUtcExclusive } = buildUtcDayRange(input.date, input.timezone);
  const rowCandidates = await db
    .select({
      event: historyEvents,
      lastTelemetryAt: locationEvents.occurredAt,
    })
    .from(historyEvents)
    .leftJoin(locationEvents, eq(locationEvents.id, historyEvents.lastLocationEventId))
    .where(and(
      eq(historyEvents.organizationId, organizationId),
      eq(historyEvents.childId, childId),
      coveragePredicate(organizationId, historyEvents.deviceId, historyEvents.startedAt, sql`coalesce(${historyEvents.endedAt}, ${locationEvents.occurredAt}, ${historyEvents.startedAt})`),
      lt(historyEvents.startedAt, endUtcExclusive),
      sql`coalesce(
        ${historyEvents.endedAt},
        ${locationEvents.occurredAt},
        ${historyEvents.startedAt}
      ) >= ${startUtc.toISOString()}::timestamptz`,
    ))
    .orderBy(asc(historyEvents.startedAt));
  const now = new Date();
  const rows = rowCandidates.flatMap(({ event, lastTelemetryAt }) => {
    const readState = resolveHistoryEventReadState({
      endedAt: event.endedAt,
      lastTelemetryAt,
      now,
      startedAt: event.startedAt,
      status: event.status,
      startUtc,
      endUtcExclusive,
    });

    return readState
      ? [{ ...event, status: readState.status, endedAt: readState.endedAt }]
      : [];
  });
  const geofenceRows = await db
    .select()
    .from(geofenceEvents)
    .where(and(
      eq(geofenceEvents.organizationId, organizationId),
      eq(geofenceEvents.childId, childId),
      coveragePredicate(organizationId, sql`(select device_id from location_events where id = ${geofenceEvents.locationEventId})`, geofenceEvents.occurredAt),
      gte(geofenceEvents.occurredAt, startUtc),
      lt(geofenceEvents.occurredAt, endUtcExclusive),
    ))
    .orderBy(asc(geofenceEvents.occurredAt));
  const [state] = await db
    .select()
    .from(historyProcessingStates)
    .where(eq(historyProcessingStates.childId, childId))
    .limit(1);
  const expiredPlaceIds = rows
    .filter(row => (
      row.kind === "stay"
      && row.placeProvider === "google"
      && row.placeMatchType !== "saved"
      && row.placeContentExpiresAt != null
      && row.placeContentExpiresAt <= now
    ))
    .map(row => row.id);

  if (expiredPlaceIds.length > 0) {
    await queueExpiredHistoryPlaceRefresh(expiredPlaceIds);

    for (const row of rows) {
      if (expiredPlaceIds.includes(row.id)) {
        row.placeMatchType = "pending";
        row.placeDistanceMeters = null;
        row.placeLabel = "Pinned location";
        row.formattedAddress = null;
        row.placeContentFetchedAt = null;
        row.placeContentExpiresAt = null;
        row.placeEnrichmentStatus = "pending";
      }
    }
  }
  const events: ChildHistoryEventDto[] = [];

  for (const row of rows) {
    const nested = geofenceRows
      .filter((event) => event.occurredAt >= row.startedAt && event.occurredAt <= (row.endedAt ?? endUtcExclusive))
      .map((event) => toGeofenceEventDto(event, input.timezone));

    events.push(await toHistoryEventDto({
      row,
      rows,
      startUtc,
      endUtcExclusive,
      timezone: input.timezone,
      geofenceEvents: nested,
      roadsGeometry: row.kind === "trip" ? await getHistoryRoadGeometry(row.id) : null,
    }));
  }

  const attachedGeofenceIds = new Set(events.flatMap((event) => event.geofenceEvents.map((nested) => nested.id)));
  const unattached = geofenceRows.filter((event) => !attachedGeofenceIds.has(event.id));

  if (unattached.length > 0) {
    const first = unattached[0]!;
    const last = unattached[unattached.length - 1]!;
    events.push({
      id: `geofence-gap-${first.id}`,
      kind: "gap",
      status: "finalized",
      startedAt: first.occurredAt.toISOString(),
      endedAt: last.occurredAt.toISOString(),
      displayStartedAt: first.occurredAt.toISOString(),
      displayEndedAt: last.occurredAt.toISOString(),
      clippedDurationSeconds: 0,
      continuesFromPreviousDay: false,
      continuesIntoNextDay: false,
      geofenceEvents: unattached.map((event) => toGeofenceEventDto(event, input.timezone)),
      reason: "telemetry_gap",
      beforeCoordinate: null,
      afterCoordinate: null,
    });
  }

  return {
    dataSource: "live",
    childId,
    date: input.date,
    timezone: input.timezone,
    generatedAt: new Date().toISOString(),
    processedThrough: state?.processedThroughAt?.toISOString() ?? null,
    isProcessing: Boolean(state?.isProcessing || (
      state?.dirtyThroughAt
      && (!state.processedThroughAt || state.dirtyThroughAt.getTime() !== state.processedThroughAt.getTime())
    )),
    events: events.sort((a, b) => new Date(a.displayStartedAt).getTime() - new Date(b.displayStartedAt).getTime()),
  };
}

export function resolveHistoryEventReadState(input: {
  endedAt: Date | null;
  endUtcExclusive: Date;
  lastTelemetryAt: Date | null;
  now: Date;
  startedAt: Date;
  startUtc: Date;
  status: "ongoing" | "finalized";
}): { endedAt: Date | null; status: "ongoing" | "finalized" } | null {
  const effectiveEndAt = input.endedAt ?? input.lastTelemetryAt ?? input.startedAt;

  if (input.startedAt >= input.endUtcExclusive || effectiveEndAt < input.startUtc) {
    return null;
  }

  const staleCutoff = new Date(
    input.now.getTime() - TELEMETRY_GAP_SECONDS * 1_000,
  );
  const shouldFinalize = input.status === "ongoing"
    && input.endedAt == null
    && effectiveEndAt < staleCutoff;

  return shouldFinalize
    ? { status: "finalized", endedAt: effectiveEndAt }
    : { status: input.status, endedAt: input.endedAt };
}

export function buildUtcDayRange(date: string, timezone: string) {
  const endDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd");

  return {
    startUtc: fromZonedTime(`${date}T00:00:00`, timezone),
    endUtcExclusive: fromZonedTime(`${endDate}T00:00:00`, timezone),
  };
}

function assertValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parseISO(date).getTime())) {
    throw badRequest("Invalid History date.");
  }
}

function assertValidTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw badRequest("Invalid History timezone.");
  }
}

async function toHistoryEventDto(input: {
  row: HistoryEventRow;
  rows: HistoryEventRow[];
  startUtc: Date;
  endUtcExclusive: Date;
  timezone: string;
  geofenceEvents: HistoryGeofenceEventDto[];
  roadsGeometry: Array<{ latitude: number; longitude: number }> | null;
}): Promise<ChildHistoryEventDto> {
  const displayStartedAt = input.row.startedAt < input.startUtc ? input.startUtc : input.row.startedAt;
  const actualEndedAt = input.row.endedAt;
  const now = new Date();
  const unclippedDisplayEnd = actualEndedAt ?? now;
  const displayEndedAt = unclippedDisplayEnd > input.endUtcExclusive
    ? input.endUtcExclusive
    : unclippedDisplayEnd;
  const base = {
    id: input.row.id,
    kind: input.row.kind,
    status: input.row.status,
    startedAt: input.row.startedAt.toISOString(),
    endedAt: actualEndedAt?.toISOString() ?? null,
    displayStartedAt: displayStartedAt.toISOString(),
    displayEndedAt: input.row.status === "ongoing" && !actualEndedAt ? null : displayEndedAt.toISOString(),
    clippedDurationSeconds: Math.max(
      0,
      Math.floor((displayEndedAt.getTime() - displayStartedAt.getTime()) / 1000),
    ),
    continuesFromPreviousDay: input.row.startedAt < input.startUtc,
    continuesIntoNextDay: actualEndedAt
      ? actualEndedAt > input.endUtcExclusive
      : now >= input.endUtcExclusive,
    geofenceEvents: input.geofenceEvents,
  };

  if (input.row.kind === "stay") {
    return {
      ...base,
      kind: "stay",
      place: {
        label: input.row.placeLabel ?? fallbackCoordinate(input.row.representativeLatitude, input.row.representativeLongitude),
        address: input.row.formattedAddress,
        representativeCoordinate: input.row.representativeLatitude != null && input.row.representativeLongitude != null
          ? {
            latitude: Number(input.row.representativeLatitude),
            longitude: Number(input.row.representativeLongitude),
          }
          : null,
        providerPlaceId: input.row.providerPlaceId,
        matchType: input.row.placeMatchType ?? "unavailable",
        matchDistanceMeters: input.row.placeDistanceMeters,
        enrichmentStatus: input.row.placeEnrichmentStatus ?? "unavailable",
      },
      radiusMeters: input.row.stayRadiusMeters ?? 35,
    } satisfies ChildHistoryStayEventDto;
  }

  if (input.row.kind === "gap") {
    return {
      ...base,
      kind: "gap",
      reason: input.row.gapReason ?? "telemetry_gap",
      beforeCoordinate: input.row.gapBeforeLatitude != null && input.row.gapBeforeLongitude != null
        ? { latitude: Number(input.row.gapBeforeLatitude), longitude: Number(input.row.gapBeforeLongitude) }
        : null,
      afterCoordinate: input.row.gapAfterLatitude != null && input.row.gapAfterLongitude != null
        ? { latitude: Number(input.row.gapAfterLatitude), longitude: Number(input.row.gapAfterLongitude) }
        : null,
    } satisfies ChildHistoryGapEventDto;
  }

  const previousStay = findNeighborStay(input.rows, input.row, "previous");
  const nextStay = findNeighborStay(input.rows, input.row, "next");
  const path = (input.roadsGeometry ?? input.row.filteredPath ?? []).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    occurredAt: "occurredAt" in point && typeof point.occurredAt === "string" ? point.occurredAt : undefined,
  }));

  return {
    ...base,
    kind: "trip",
    originLabel: previousStay
      ? previousStay.placeLabel ?? fallbackCoordinate(
        previousStay.representativeLatitude,
        previousStay.representativeLongitude,
      )
      : "Unknown start",
    destinationLabel: input.row.status === "ongoing"
      ? "In transit"
      : nextStay
        ? nextStay.placeLabel ?? fallbackCoordinate(
          nextStay.representativeLatitude,
          nextStay.representativeLongitude,
        )
        : "Unknown end",
    mode: input.row.tripMode ?? "unknown",
    modeConfidence: input.row.modeConfidence,
    distanceMeters: input.row.distanceMeters ?? 0,
    geometry: {
      source: input.roadsGeometry ? "roads" : "filtered",
      segments: path.length >= 2 ? [path] : [],
    },
  } satisfies ChildHistoryTripEventDto;
}

function findNeighborStay(rows: HistoryEventRow[], current: HistoryEventRow, direction: "previous" | "next") {
  const sorted = [...rows].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const index = sorted.findIndex((row) => row.id === current.id);
  const candidates = direction === "previous" ? sorted.slice(0, index).reverse() : sorted.slice(index + 1);

  return candidates.find((row) => row.kind === "stay") ?? null;
}

function fallbackCoordinate(latitude: string | null, longitude: string | null) {
  if (latitude == null || longitude == null) {
    return "Pinned location";
  }

  return `${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`;
}

function toGeofenceEventDto(event: typeof geofenceEvents.$inferSelect, timezone: string): HistoryGeofenceEventDto {
  const typeLabel = event.eventType === "breached"
    ? "Geofence breached"
    : event.eventType === "reentered"
      ? "Geofence re-entered"
      : "Geofence activated";

  return {
    id: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt.toISOString(),
    displayTime: formatInTimeZone(event.occurredAt, timezone, "h:mm a"),
    label: typeLabel,
    zoneLabel: null,
  };
}
