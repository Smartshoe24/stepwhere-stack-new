import type { ActiveSubscriptionDto } from "./plans";
import type { ResolvedPositionDto } from "./telemetry";

export type ChildTrackingStatus = "safe" | "transit" | "alert" | "offline";
export type ChildLifecycleStatus = "active" | "archived";
export type ChildTelemetryState = "active" | "sleep" | "offline" | "connecting";
export type GsmConnectionState = "connected" | "stale" | "offline";
export type GpsConnectionState = "connected" | "acquiring" | "stale" | "offline";

export type ChildConnectivityDto = {
  gsmState: GsmConnectionState;
  gpsState: GpsConnectionState;
  lastGpsFixAt: string | null;
};

export type DeviceSummaryDto = {
  id: string | null;
  hardwareIdentifier: string | null;
  displayName: string | null;
  platform: "android" | "ios" | "embedded" | "unknown" | null;
  status: "fresh" | "active" | "inactive" | "blocked" | null;
  lastSeenAt: string | null;
};

export type PlaceDto = {
  id: string;
  kind: "school";
  provider: "google";
  providerPlaceId: string;
  label: string;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
};

export type SchoolPlaceSuggestionDto = {
  provider: "google";
  providerPlaceId: string;
  mainText: string;
  secondaryText: string | null;
};

export type AddressPlaceSuggestionDto = {
  provider: "google";
  providerPlaceId: string;
  mainText: string;
  secondaryText: string | null;
};

export type ResolvedAddressDto = {
  provider: "google";
  providerPlaceId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export type ResolveAddressPlaceInput = {
  providerPlaceId: string;
  sessionToken?: string;
};

export type ResolveSchoolPlaceInput = {
  providerPlaceId: string;
};

export type UnlinkChildDeviceResultDto = {
  childId: string;
  deviceId: string | null;
  hardwareIdentifier: string | null;
  unlinked: boolean;
};

export type BindChildDeviceInput = {
  deviceReservationToken: string;
};

export type BindChildDeviceResultDto = {
  childId: string;
  deviceId: string;
  hardwareIdentifier: string;
  linked: boolean;
};

export type ArchiveChildResultDto = {
  id: string;
  archived: boolean;
  deviceHardwareIdentifier: string | null;
};

export type ChildSummaryDto = {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  status: ChildTrackingStatus;
  telemetryState: ChildTelemetryState;
  connectivity: ChildConnectivityDto;
  statusLabel: string | null;
  locationLabel: string | null;
  lastSeenAt: string | null;
  lastUpdatedAt: string | null;
  etaLabel: string | null;
  batteryPercent: number | null;
  batteryVoltageMv: number | null;
  batteryText: string | null;
  signalStrength: number | null;
  satelliteCount: number | null;
  stepCounter: number | null;
  stepDelta: number;
  stepsThisHour: number;
  /** Running total for the child's current local day. */
  stepsToday: number;
  /** Local date `stepsToday` was accumulated against, `YYYY-MM-DD`. */
  stepsTodayDate: string | null;
  /** IANA zone derived from the device's last known coordinate. */
  deviceTimezone: string | null;
  latitude: number | null;
  longitude: number | null;
  resolvedPosition: ResolvedPositionDto | null;
  activePlan: ActiveSubscriptionDto | null;
  deviceSummary: DeviceSummaryDto | null;
};

export type GeofenceContainmentState = "unknown" | "inside" | "outside";

export type ChildGeofenceDto = {
  status: "unset" | "enabled" | "disabled";
  containmentState: GeofenceContainmentState;
  breachedAt: string | null;
  lastReenteredAt: string | null;
  lastEvaluatedAt: string | null;
  lastDistanceMeters: number | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  updatedAt: string | null;
};

export type OverviewChildDto = ChildSummaryDto & {
  geofence: ChildGeofenceDto;
};

export type ChildDetailDto = {
  id: string;
  parentUserId: string | null;
  organizationId: string;
  name: string;
  avatarUrl: string | null;
  schoolName: string | null;
  schoolPlace: PlaceDto | null;
  gender: string | null;
  dateOfBirth: string | null;
  lifecycleStatus: ChildLifecycleStatus;
  summary: ChildSummaryDto;
  createdAt: string;
  updatedAt: string;
};

export type OverviewResponseDto = {
  children: OverviewChildDto[];
  selectedChildId: string | null;
  generatedAt: string;
};

export type CreateChildInput = {
  name: string;
  avatarUrl: string;
  dateOfBirth: string;
  schoolPlaceId: string;
  deviceReservationToken: string;
  idempotencyKey: string;
};

export type UpdateChildInput = {
  name?: string;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  schoolPlaceId?: string;
};

export type UpdateChildGeofenceInput = {
  status: "enabled" | "disabled";
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  radiusMeters?: number | null;
};
