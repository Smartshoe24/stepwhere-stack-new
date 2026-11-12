export type HistoryEventKind = "stay" | "trip" | "gap";
export type HistoryDataSource = "live" | "fixture";
export type HistoryEventStatus = "ongoing" | "finalized";
export type HistoryTripMode = "walking" | "vehicle" | "unknown";
export type HistoryModeConfidence = "high" | "medium" | "low";
export type HistoryGapReason = "telemetry_gap" | "offline" | "moved_while_sleeping";
export type HistoryPlaceMatchType = "saved" | "exact" | "near" | "address" | "pending" | "unavailable";
export type HistoryPlaceEnrichmentStatus = "pending" | "completed" | "failed" | "unavailable";

export type HistoryCoordinateDto = {
  latitude: number;
  longitude: number;
};

export type HistoryPathPointDto = HistoryCoordinateDto & {
  occurredAt?: string;
};

export type HistoryGeofenceEventDto = {
  id: string;
  eventType: "breached" | "reentered" | "reset";
  occurredAt: string;
  displayTime: string;
  label: string;
  zoneLabel: string | null;
};

export type HistoryPlaceDto = {
  label: string;
  address: string | null;
  representativeCoordinate: HistoryCoordinateDto | null;
  providerPlaceId: string | null;
  matchType: HistoryPlaceMatchType;
  matchDistanceMeters: number | null;
  enrichmentStatus: HistoryPlaceEnrichmentStatus;
};

export type HistoryEventBaseDto = {
  id: string;
  kind: HistoryEventKind;
  status: HistoryEventStatus;
  startedAt: string;
  endedAt: string | null;
  displayStartedAt: string;
  displayEndedAt: string | null;
  clippedDurationSeconds: number;
  continuesFromPreviousDay: boolean;
  continuesIntoNextDay: boolean;
  geofenceEvents: HistoryGeofenceEventDto[];
};

export type ChildHistoryStayEventDto = HistoryEventBaseDto & {
  kind: "stay";
  place: HistoryPlaceDto;
  radiusMeters: number;
};

export type ChildHistoryTripEventDto = HistoryEventBaseDto & {
  kind: "trip";
  originLabel: string;
  destinationLabel: string;
  mode: HistoryTripMode;
  modeConfidence: HistoryModeConfidence | null;
  distanceMeters: number;
  geometry: {
    source: "filtered" | "roads";
    segments: HistoryPathPointDto[][];
  };
};

export type ChildHistoryGapEventDto = HistoryEventBaseDto & {
  kind: "gap";
  reason: HistoryGapReason;
  beforeCoordinate: HistoryCoordinateDto | null;
  afterCoordinate: HistoryCoordinateDto | null;
};

export type ChildHistoryEventDto =
  | ChildHistoryStayEventDto
  | ChildHistoryTripEventDto
  | ChildHistoryGapEventDto;

export type ChildHistoryRangeResponseDto = {
  dataSource: HistoryDataSource;
  childId: string;
  timezone: string;
  firstDate: string | null;
  lastDataDate: string | null;
  today: string;
};

export type ChildHistoryDayResponseDto = {
  dataSource: HistoryDataSource;
  childId: string;
  date: string;
  timezone: string;
  generatedAt: string;
  processedThrough: string | null;
  isProcessing: boolean;
  events: ChildHistoryEventDto[];
};

export type HistoryUpdatedEventDto = {
  childId: string;
  processedThrough: string;
};
