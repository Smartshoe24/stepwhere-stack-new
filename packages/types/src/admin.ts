import type { ChildDetailDto, ChildLifecycleStatus } from "./children";
import type { CmsPageDto } from "./cms";
import type { PaginatedResponse } from "./common";
import type { FamilyJoinCodeDto, FamilyMemberDto } from "./family";
import type { NotificationDto } from "./notifications";
import type { PlanDto, ActiveSubscriptionDto } from "./plans";
import type { LocationSource } from "./telemetry";
import type { UserProfileDto } from "./users";

export type AdminSortDirection = "asc" | "desc";

export type AdminListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  dir?: AdminSortDirection;
};

export type AdminUsersListQuery = AdminListQuery & {
  role?: "user" | "admin";
  status?: "active" | "suspended";
  banned?: "true" | "false";
  onboarding?: "completed" | "incomplete";
};

export type AdminChildrenListQuery = AdminListQuery & {
  lifecycleStatus?: "active" | "archived";
  trackingStatus?: "safe" | "transit" | "alert" | "offline";
  telemetryState?: "active" | "sleep" | "offline" | "connecting";
  binding?: "bound" | "unbound";
};

export type AdminDeviceConnectionState =
  | "connected"
  | "stale"
  | "offline"
  | "sleep"
  | "never";

export type AdminDevicesListQuery = AdminListQuery & {
  status?: "fresh" | "active" | "inactive" | "blocked";
  platform?: "android" | "ios" | "embedded" | "unknown";
  binding?: "bound" | "unbound";
  connection?: AdminDeviceConnectionState;
};

export type AdminFamiliesListQuery = AdminListQuery;

export type AdminGeofencesListQuery = AdminListQuery & {
  status?: "unset" | "enabled" | "disabled";
  containmentState?: "unknown" | "inside" | "outside";
  breachState?: "clear" | "breached";
  childId?: string;
  familyId?: string;
};

export type AdminGeofenceBreachesListQuery = AdminListQuery & {
  acknowledged?: "true" | "false";
  childId?: string;
  deviceId?: string;
  familyId?: string;
  startDate?: string;
  endDate?: string;
};

export type AdminLocationEventsListQuery = {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
};

export type AdminGeofenceEventsListQuery = AdminLocationEventsListQuery & {
  eventType?: "breached" | "reentered" | "reset";
};

export type AdminActivityQuery = {
  period: "day" | "week" | "month" | "year";
  startDate: string;
  endDate: string;
  timezone: string;
};

export type AdminRelatedRecordType = "user" | "child" | "device" | "family" | "geofence";

export type AdminUserSummaryDto = {
  id: string;
  displayName: string;
  phoneNumber: string;
  email: string | null;
  avatarUrl: string | null;
};

export type AdminFamilyRelationDto = {
  id: string;
  name: string;
  slug: string;
  familyName: string | null;
  logo: string | null;
};

export type AdminDeviceBindingDto = {
  id: string;
  childId: string;
  childName: string;
  childAvatarUrl: string | null;
  organizationId: string;
  boundAt: string;
};

export type AdminDeviceReservationDto = {
  reservedByUserId: string | null;
  reservedByOrganizationId: string | null;
  reservedUntil: string | null;
};

export type AdminDeviceDto = {
  id: string;
  hardwareIdentifier: string;
  displayName: string | null;
  platform: "android" | "ios" | "embedded" | "unknown";
  status: "fresh" | "active" | "inactive" | "blocked";
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  activeBinding: AdminDeviceBindingDto | null;
  reservation: AdminDeviceReservationDto;
};

export type AdminDeviceTelemetryReliabilityDto = {
  windowMinutes: 30;
  windowStartedAt: string;
  calculatedAt: string;
  expectedIntervalSeconds: 8;
  lateAtSeconds: 10;
  missingAtSeconds: 17;
  latestDeviceState: "active" | "sleep" | "offline" | null;
  lastPacketAt: string | null;
  lastCompletedIntervalSeconds: number | null;
  completedOnTimePackets: number;
  completedLatePackets: number;
  completedMissedPackets: number;
};

export type AdminDeviceListItemDto = AdminDeviceDto & {
  telemetryReliability: AdminDeviceTelemetryReliabilityDto;
};

export type AdminCreateDeviceInput = {
  hardwareIdentifier: string;
  displayName?: string | null;
  platform?: "android" | "ios" | "embedded" | "unknown";
  status?: "fresh" | "active" | "inactive" | "blocked";
};

export type AdminUpdateDeviceInput = Partial<AdminCreateDeviceInput>;

export type AdminBulkCreateDeviceInput = {
  devices: AdminCreateDeviceInput[];
};

export type AdminBulkCreateDeviceResultDto = {
  created: AdminDeviceDto[];
  skipped: {
    hardwareIdentifier: string;
    reason: string;
  }[];
};

export type AdminBindDeviceInput = {
  childId: string;
};

export type DeviceBindResultDto = {
  childId: string;
  deviceId: string;
  bound: boolean;
};

export type DeviceUnbindResultDto = {
  childId: string;
  deviceId: string;
  unbound: boolean;
};

export type AdminChildParentDto = {
  id: string;
  displayName: string;
  phoneNumber: string;
  email: string | null;
  avatarUrl: string | null;
} | null;

export type AdminChildRelationshipSummaryDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
  lifecycleStatus: "active" | "archived";
  trackingStatus: "safe" | "transit" | "alert" | "offline";
  telemetryState: "active" | "sleep" | "offline" | "connecting";
  activeDevice: {
    id: string;
    hardwareIdentifier: string;
    displayName: string | null;
    status: "fresh" | "active" | "inactive" | "blocked";
  } | null;
};

export type AdminUserChildRelationshipDto = {
  count: number;
  previewChildren: AdminChildRelationshipSummaryDto[];
};

export type AdminChildListItemDto = ChildDetailDto & {
  parent: AdminChildParentDto;
};

export type AdminChildDeviceLinkDto = {
  device: AdminDeviceDto | null;
  bindingId: string | null;
  boundAt: string | null;
};

export type AdminUserDetailDto = UserProfileDto & {
  children: AdminChildListItemDto[];
};

export type AdminChildDetailDto = ChildDetailDto & {
  parent: AdminChildParentDto;
  deviceLink: AdminChildDeviceLinkDto;
};

/** The family that currently owns the physical shoe (billing ownership claim). */
export type AdminDeviceOwnershipDto = {
  organizationId: string;
  organizationName: string | null;
  claimedAt: string;
};

export type AdminDeviceDetailDto = AdminDeviceListItemDto & {
  ownership: AdminDeviceOwnershipDto | null;
};

export type AdminReleaseDeviceOwnershipInput = {
  deviceId: string;
  reason: string;
};

export type AdminReleaseDeviceOwnershipResultDto = {
  deviceId: string;
  released: boolean;
};

export type AdminUserListResponseDto = PaginatedResponse<AdminUserListItemDto>;
export type AdminChildListResponseDto = PaginatedResponse<AdminChildListItemDto>;
export type AdminDeviceListResponseDto = PaginatedResponse<AdminDeviceListItemDto>;
export type AdminFamilyListResponseDto = PaginatedResponse<AdminFamilyListItemDto>;

export type AdminUpdateUserInput = {
  role?: "user" | "admin";
  status?: "active" | "suspended";
};

export type AdminCreateChildForUserInput = {
  name: string;
  schoolName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  lifecycleStatus?: ChildLifecycleStatus;
  avatarUrl?: string | null;
  deviceId: string;
};

export type AdminFamilyListItemDto = {
  id: string;
  name: string;
  slug: string;
  familyName: string | null;
  logo: string | null;
  admin: AdminUserSummaryDto | null;
  memberCount: number;
  childCount: number;
  activeJoinCodeCount: number;
  createdAt: string;
  updatedAt: string | null;
};

export type AdminFamilyDetailDto = AdminFamilyListItemDto & {
  members: FamilyMemberDto[];
  children: AdminChildListItemDto[];
  joinCodes: FamilyJoinCodeDto[];
};

export type AdminDeviceLiveTelemetryDto = {
  device: AdminDeviceDto;
  child: AdminChildListItemDto | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    source: LocationSource | null;
    label: string | null;
    accuracyMeters: number | null;
    occurredAt: string | null;
    ingestedAt: string | null;
  };
  battery: {
    percent: number | null;
    voltageMv: number | null;
  };
  signal: {
    strength: number | null;
    satelliteCount: number | null;
  };
  motion: {
    stepCounter: number | null;
    stepDelta: number;
    stepsThisHour: number;
  };
  state: {
    deviceState: "active" | "sleep" | "offline" | "connecting";
    trackingStatus: "safe" | "transit" | "alert" | "offline" | null;
    lastSeenAt: string | null;
    gsmState: import("./children").GsmConnectionState;
    gpsState: import("./children").GpsConnectionState;
    lastGpsFixAt: string | null;
  };
};

export type AdminLocationEventDto = {
  id: string;
  deviceId: string;
  childId: string;
  child: {
    id: string;
    name: string;
  } | null;
  device: {
    id: string;
    hardwareIdentifier: string;
    displayName: string | null;
  } | null;
  latitude: number;
  longitude: number;
  gpsConnected: boolean;
  source: LocationSource | "none";
  locationLabel: string | null;
  accuracyMeters: number | null;
  batteryPercent: number | null;
  batteryVoltageMv: number | null;
  signalStrength: number | null;
  satelliteCount: number | null;
  stepCounter: number;
  deviceState: "active" | "sleep" | "offline";
  occurredAt: string;
  ingestedAt: string;
};

export type AdminLocationEventListResponseDto = PaginatedResponse<AdminLocationEventDto>;

export type AdminGeofenceListItemDto = {
  id: string;
  childId: string;
  childName: string;
  activeDevice: AdminDeviceDto | null;
  family: AdminFamilyRelationDto;
  status: "unset" | "enabled" | "disabled";
  containmentState: "unknown" | "inside" | "outside";
  lastLatitude: number | null;
  lastLongitude: number | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  lastDistanceMeters: number | null;
  breachedAt: string | null;
  lastReenteredAt: string | null;
  lastEvaluatedAt: string | null;
  unacknowledgedBreachCount: number;
  updatedAt: string | null;
};

export type AdminGeofenceDetailDto = AdminGeofenceListItemDto;

export type AdminGeofenceEventDto = {
  id: string;
  geofenceId: string;
  child: {
    id: string;
    name: string;
  };
  device: {
    id: string;
    hardwareIdentifier: string;
    displayName: string | null;
  } | null;
  family: AdminFamilyRelationDto;
  eventType: "breached" | "reentered" | "reset";
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  radiusMeters: number | null;
  occurredAt: string;
  createdAt: string;
  acknowledgment: {
    acknowledgedAt: string;
    acknowledgedBy: AdminUserSummaryDto;
    note: string | null;
  } | null;
};

export type AdminGeofenceListResponseDto = PaginatedResponse<AdminGeofenceListItemDto>;
export type AdminGeofenceEventListResponseDto = PaginatedResponse<AdminGeofenceEventDto>;
export type AdminGeofenceBreachCountsDto = {
  unacknowledged: number;
  acknowledged: number;
};

export type AdminAcknowledgeGeofenceBreachInput = {
  note?: string | null;
};

export type AdminBulkAcknowledgeGeofenceBreachesInput = {
  eventIds: string[];
  note?: string | null;
};

export type AdminCreateFamilyInput = {
  familyName: string;
  adminUserId: string;
};

export type AdminAddFamilyMemberInput = {
  userId: string;
};

export type AdminTransferFamilyAdminInput = {
  userId: string;
};

export type AdminBanUserInput = {
  banReason?: string | null;
  banExpiresIn?: number | null;
};

export type AdminUnbanUserInput = Record<string, never>;

export type AdminUserListItemDto = UserProfileDto & {
  childRelationship: AdminUserChildRelationshipDto;
};
export type AdminUpdateChildInput = {
  name?: string;
  avatarUrl?: string | null;
  schoolName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  lifecycleStatus?: ChildLifecycleStatus;
};
export type AdminPlanDto = PlanDto;
export type AdminSubscriptionDto = ActiveSubscriptionDto;
export type AdminCmsPageDto = CmsPageDto;
export type AdminNotificationDto = NotificationDto;

export type PreviewAccessEntryDto = {
  id: string;
  phoneNumber: string;
  label: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PreviewAccessStateDto = {
  enabled: boolean;
  entries: PreviewAccessEntryDto[];
};

export type CreatePreviewAccessEntryInput = {
  phoneNumber: string;
  label?: string | null;
};

export type UpdatePreviewAccessEntryInput = {
  label?: string | null;
  isActive?: boolean;
};
