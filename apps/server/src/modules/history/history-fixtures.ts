import type {
  ChildHistoryDayResponseDto,
  ChildHistoryEventDto,
  ChildHistoryGapEventDto,
  ChildHistoryRangeResponseDto,
  ChildHistoryStayEventDto,
  ChildHistoryTripEventDto,
  HistoryCoordinateDto,
  HistoryDataSource,
  HistoryGeofenceEventDto,
} from "@stepwhere/types";
import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { env } from "../../config/env";
import { ENABLE_DEVELOPMENT_HISTORY_FIXTURES } from "./history.constants";

const FIXTURE_RANGE_DAYS = 7;

type FixtureLocation = {
  coordinate: HistoryCoordinateDto;
  label: "Home" | "Park" | "School";
};

type FixtureSegment =
  | {
      kind: "stay";
      key: string;
      location: FixtureLocation;
      startTime: string;
      endTime: string;
    }
  | {
      kind: "trip";
      key: string;
      origin: FixtureLocation;
      destination: FixtureLocation;
      mode: "vehicle" | "walking";
      startTime: string;
      endTime: string;
    }
  | {
      kind: "gap";
      key: string;
      before: FixtureLocation;
      after: FixtureLocation;
      startTime: string;
      endTime: string;
    };

export function isDevelopmentHistoryFixtureMode() {
  return env.NODE_ENV === "development" && ENABLE_DEVELOPMENT_HISTORY_FIXTURES;
}

export function getEffectiveHistoryDataSource(): HistoryDataSource {
  return isDevelopmentHistoryFixtureMode() ? "fixture" : "live";
}

export function buildDevelopmentHistoryRange(input: {
  childId: string;
  timezone: string;
  now?: Date;
}): ChildHistoryRangeResponseDto {
  const now = input.now ?? new Date();
  const today = formatInTimeZone(now, input.timezone, "yyyy-MM-dd");

  return {
    dataSource: "fixture",
    childId: input.childId,
    timezone: input.timezone,
    firstDate: shiftDateKey(today, -(FIXTURE_RANGE_DAYS - 1)),
    lastDataDate: today,
    today,
  };
}

export function buildDevelopmentHistoryDay(input: {
  childId: string;
  date: string;
  timezone: string;
  now?: Date;
}): ChildHistoryDayResponseDto {
  const now = input.now ?? new Date();
  const range = buildDevelopmentHistoryRange({
    childId: input.childId,
    timezone: input.timezone,
    now,
  });
  const inFixtureRange =
    input.date >= range.firstDate! && input.date <= range.today;
  const events = inFixtureRange
    ? buildFixtureEvents({
        childId: input.childId,
        date: input.date,
        timezone: input.timezone,
        now,
        today: range.today,
      })
    : [];
  const latestEvent = events[events.length - 1];
  const processedThrough = latestEvent
    ? latestEvent.status === "ongoing"
      ? now.toISOString()
      : latestEvent.endedAt
    : null;

  return {
    dataSource: "fixture",
    childId: input.childId,
    date: input.date,
    timezone: input.timezone,
    generatedAt: now.toISOString(),
    processedThrough,
    isProcessing: false,
    events,
  };
}

function buildFixtureEvents(input: {
  childId: string;
  date: string;
  timezone: string;
  now: Date;
  today: string;
}) {
  const locations = buildFixtureLocations(input.childId);
  const segments = buildFixtureSegments(input.date, input.today, locations);

  return segments.flatMap((segment) => {
    const event = buildFixtureEvent({ ...input, segment });
    return event ? [event] : [];
  });
}

function buildFixtureSegments(
  date: string,
  today: string,
  locations: ReturnType<typeof buildFixtureLocations>,
): FixtureSegment[] {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();

  if (day === 0 || day === 6) {
    return [
      stay("home-morning", locations.home, "00:00:00", "10:00:00"),
      trip(
        "outbound",
        locations.home,
        locations.park,
        "walking",
        "10:00:00",
        "10:20:00",
      ),
      stay("park", locations.park, "10:20:00", "12:30:00"),
      trip(
        "return",
        locations.park,
        locations.home,
        "walking",
        "12:30:00",
        "12:50:00",
      ),
      stay("home-evening", locations.home, "12:50:00", "23:59:59"),
    ];
  }

  const schoolSegments: FixtureSegment[] =
    stableHash(date) % 3 === 0 && date !== today
      ? [
          stay("school-morning", locations.school, "08:25:00", "12:00:00"),
          {
            kind: "gap",
            key: "school-gap",
            before: locations.school,
            after: locations.school,
            startTime: "12:00:00",
            endTime: "12:25:00",
          },
          stay("school-afternoon", locations.school, "12:25:00", "15:15:00"),
        ]
      : [stay("school", locations.school, "08:25:00", "15:15:00")];

  return [
    stay("home-morning", locations.home, "00:00:00", "08:00:00"),
    trip(
      "outbound",
      locations.home,
      locations.school,
      "walking",
      "08:00:00",
      "08:25:00",
    ),
    ...schoolSegments,
    trip(
      "return",
      locations.school,
      locations.home,
      "vehicle",
      "15:15:00",
      "15:45:00",
    ),
    stay("home-evening", locations.home, "15:45:00", "23:59:59"),
  ];
}

function buildFixtureEvent(input: {
  childId: string;
  date: string;
  timezone: string;
  now: Date;
  today: string;
  segment: FixtureSegment;
}): ChildHistoryEventDto | null {
  const startedAt = localDateTime(
    input.date,
    input.segment.startTime,
    input.timezone,
  );
  const scheduledEnd = localDateTime(
    input.date,
    input.segment.endTime,
    input.timezone,
  );
  const isToday = input.date === input.today;

  if (isToday && startedAt >= input.now) {
    return null;
  }

  if (input.segment.kind === "gap" && isToday && scheduledEnd > input.now) {
    return null;
  }

  const isOngoing = isToday && scheduledEnd > input.now;
  const effectiveEnd = isOngoing ? input.now : scheduledEnd;
  const base = {
    id: `fixture-${stableHex(`${input.childId}:${input.date}:${input.segment.key}`, 16)}`,
    status: isOngoing ? ("ongoing" as const) : ("finalized" as const),
    startedAt: startedAt.toISOString(),
    endedAt: isOngoing ? null : scheduledEnd.toISOString(),
    displayStartedAt: startedAt.toISOString(),
    displayEndedAt: isOngoing ? null : scheduledEnd.toISOString(),
    clippedDurationSeconds: Math.max(
      0,
      Math.floor((effectiveEnd.getTime() - startedAt.getTime()) / 1_000),
    ),
    continuesFromPreviousDay: false,
    continuesIntoNextDay: false,
    geofenceEvents: buildFixtureGeofenceEvents({
      ...input,
      effectiveEnd,
      startedAt,
    }),
  };

  if (input.segment.kind === "stay") {
    return {
      ...base,
      kind: "stay",
      place: {
        label: input.segment.location.label,
        address: null,
        representativeCoordinate: input.segment.location.coordinate,
        providerPlaceId: null,
        matchType: "saved",
        matchDistanceMeters: 0,
        enrichmentStatus: "completed",
      },
      radiusMeters: 42,
    } satisfies ChildHistoryStayEventDto;
  }

  if (input.segment.kind === "gap") {
    return {
      ...base,
      kind: "gap",
      status: "finalized",
      endedAt: scheduledEnd.toISOString(),
      displayEndedAt: scheduledEnd.toISOString(),
      reason: "telemetry_gap",
      beforeCoordinate: input.segment.before.coordinate,
      afterCoordinate: input.segment.after.coordinate,
    } satisfies ChildHistoryGapEventDto;
  }

  const scheduledDuration = scheduledEnd.getTime() - startedAt.getTime();
  const progress = Math.min(
    1,
    Math.max(
      0,
      (effectiveEnd.getTime() - startedAt.getTime()) / scheduledDuration,
    ),
  );
  const visibleDestination = interpolateCoordinate(
    input.segment.origin.coordinate,
    input.segment.destination.coordinate,
    progress,
  );
  const midpoint = interpolateCoordinate(
    input.segment.origin.coordinate,
    visibleDestination,
    0.5,
  );
  const midpointAt = new Date(
    (startedAt.getTime() + effectiveEnd.getTime()) / 2,
  );
  const fullDistanceMeters = distanceMeters(
    input.segment.origin.coordinate,
    input.segment.destination.coordinate,
  );

  return {
    ...base,
    kind: "trip",
    originLabel: input.segment.origin.label,
    destinationLabel: isOngoing
      ? "In transit"
      : input.segment.destination.label,
    mode: input.segment.mode,
    modeConfidence: "high",
    distanceMeters: Math.round(fullDistanceMeters * progress),
    geometry: {
      source: "filtered",
      segments: [
        [
          {
            ...input.segment.origin.coordinate,
            occurredAt: startedAt.toISOString(),
          },
          {
            latitude: midpoint.latitude + 0.00035,
            longitude: midpoint.longitude - 0.0002,
            occurredAt: midpointAt.toISOString(),
          },
          { ...visibleDestination, occurredAt: effectiveEnd.toISOString() },
        ],
      ],
    },
  } satisfies ChildHistoryTripEventDto;
}

function buildFixtureGeofenceEvents(input: {
  childId: string;
  date: string;
  timezone: string;
  segment: FixtureSegment;
  startedAt: Date;
  effectiveEnd: Date;
}): HistoryGeofenceEventDto[] {
  const definition =
    input.segment.key === "outbound"
      ? {
          eventType: "breached" as const,
          minuteOffset: 5,
          label: "Geofence breached",
        }
      : input.segment.key === "return"
        ? {
            eventType: "reentered" as const,
            minuteOffset: 16,
            label: "Geofence re-entered",
          }
        : null;

  if (!definition) {
    return [];
  }

  const occurredAt = new Date(
    input.startedAt.getTime() + definition.minuteOffset * 60_000,
  );

  if (occurredAt > input.effectiveEnd) {
    return [];
  }

  return [
    {
      id: deterministicUuid(
        `${input.childId}:${input.date}:${input.segment.key}:geofence`,
      ),
      eventType: definition.eventType,
      occurredAt: occurredAt.toISOString(),
      displayTime: formatInTimeZone(occurredAt, input.timezone, "h:mm a"),
      label: definition.label,
      zoneLabel: "Safe zone",
    },
  ];
}

function buildFixtureLocations(childId: string) {
  const seed = stableHash(childId);
  const latitudeOffset = ((seed % 1_001) - 500) / 500_000;
  const longitudeOffset = (((seed >>> 10) % 1_001) - 500) / 500_000;
  const home = location(
    "Home",
    12.9716 + latitudeOffset,
    77.5946 + longitudeOffset,
  );

  return {
    home,
    school: location(
      "School",
      home.coordinate.latitude + 0.0113,
      home.coordinate.longitude + 0.0084,
    ),
    park: location(
      "Park",
      home.coordinate.latitude + 0.0045,
      home.coordinate.longitude - 0.006,
    ),
  };
}

function location(
  label: FixtureLocation["label"],
  latitude: number,
  longitude: number,
): FixtureLocation {
  return {
    label,
    coordinate: {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
    },
  };
}

function stay(
  key: string,
  locationValue: FixtureLocation,
  startTime: string,
  endTime: string,
): FixtureSegment {
  return { kind: "stay", key, location: locationValue, startTime, endTime };
}

function trip(
  key: string,
  origin: FixtureLocation,
  destination: FixtureLocation,
  mode: "vehicle" | "walking",
  startTime: string,
  endTime: string,
): FixtureSegment {
  return { kind: "trip", key, origin, destination, mode, startTime, endTime };
}

function localDateTime(date: string, time: string, timezone: string) {
  return fromZonedTime(`${date}T${time}`, timezone);
}

function shiftDateKey(date: string, amount: number) {
  return format(addDays(parseISO(date), amount), "yyyy-MM-dd");
}

function interpolateCoordinate(
  from: HistoryCoordinateDto,
  to: HistoryCoordinateDto,
  progress: number,
): HistoryCoordinateDto {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress,
  };
}

function distanceMeters(from: HistoryCoordinateDto, to: HistoryCoordinateDto) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function deterministicUuid(seed: string) {
  const hex = stableHex(seed, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");

  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

function stableHex(seed: string, length: number) {
  let value = "";

  for (let index = 0; value.length < length; index += 1) {
    value += stableHash(`${seed}:${index}`).toString(16).padStart(8, "0");
  }

  return value.slice(0, length);
}

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}
