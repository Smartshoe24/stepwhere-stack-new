import { z } from "@hono/zod-openapi";

export const UuidSchema = z.string().uuid().openapi({
  example: "4cf1c432-55f3-41cb-9fbc-c52d130f5d59",
});

export const DateTimeSchema = z.string().datetime().openapi({
  example: "2026-06-03T12:30:00.000Z",
});

export const DateSchema = z.string().date().openapi({
  example: "2026-06-03",
});

export const NullableDateTimeSchema = DateTimeSchema.nullable();
export const NullableStringSchema = z.string().nullable();

export const GenericObjectSchema = z.record(z.string(), z.unknown()).openapi("GenericObject");

export const PlanSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  description: NullableStringSchema,
  durationMonths: z.number().int(),
  amountMinor: z.number().int().nullable(),
  currencyCode: NullableStringSchema,
  status: z.enum(["active", "inactive"]),
}).openapi("Plan");

export const ActiveSubscriptionSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  planId: UuidSchema,
  source: z.enum(["admin", "purchase", "promo"]),
  status: z.enum(["active", "expired", "cancelled"]),
  startsAt: DateTimeSchema,
  endsAt: DateTimeSchema,
  externalOrderId: NullableStringSchema,
  externalPurchaseId: NullableStringSchema,
  plan: PlanSchema,
}).openapi("ActiveSubscription");

export const DeviceSummarySchema = z.object({
  id: UuidSchema.nullable(),
  hardwareIdentifier: NullableStringSchema,
  displayName: NullableStringSchema,
  platform: z.enum(["android", "ios", "embedded", "unknown"]).nullable(),
  status: z.enum(["fresh", "active", "inactive", "blocked"]).nullable(),
  lastSeenAt: NullableDateTimeSchema,
}).openapi("DeviceSummary");

export const PlaceSchema = z.object({
  id: UuidSchema,
  kind: z.literal("school"),
  provider: z.literal("google"),
  providerPlaceId: z.string(),
  label: z.string(),
  formattedAddress: NullableStringSchema,
  latitude: z.number(),
  longitude: z.number(),
}).openapi("Place");

export const SchoolPlaceSuggestionSchema = z.object({
  provider: z.literal("google"),
  providerPlaceId: z.string(),
  mainText: z.string(),
  secondaryText: NullableStringSchema,
}).openapi("SchoolPlaceSuggestion");

export const AddressPlaceSuggestionSchema = z.object({
  provider: z.literal("google"),
  providerPlaceId: z.string(),
  mainText: z.string(),
  secondaryText: NullableStringSchema,
}).openapi("AddressPlaceSuggestion");

export const ResolvedAddressSchema = z.object({
  provider: z.literal("google"),
  providerPlaceId: z.string(),
  formattedAddress: z.string(),
  latitude: z.number(),
  longitude: z.number(),
}).openapi("ResolvedAddress");

export const ChildConnectivitySchema = z.object({
  gsmState: z.enum(["connected", "stale", "offline"]),
  gpsState: z.enum(["connected", "acquiring", "stale", "offline"]),
  lastGpsFixAt: NullableDateTimeSchema,
}).openapi("ChildConnectivity");

export const ResolvedPositionSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  source: z.enum(["gps", "cell", "network"]),
  accuracyMeters: z.number().nullable(),
  observedAt: DateTimeSchema,
}).openapi("ResolvedPosition");

export const ChildSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  initials: z.string(),
  avatarUrl: NullableStringSchema,
  status: z.enum(["safe", "transit", "alert", "offline"]),
  telemetryState: z.enum(["active", "sleep", "offline", "connecting"]),
  connectivity: ChildConnectivitySchema,
  statusLabel: NullableStringSchema,
  locationLabel: NullableStringSchema,
  lastSeenAt: NullableDateTimeSchema,
  lastUpdatedAt: NullableDateTimeSchema,
  etaLabel: NullableStringSchema,
  batteryPercent: z.number().int().nullable(),
  batteryVoltageMv: z.number().int().nullable(),
  batteryText: NullableStringSchema,
  signalStrength: z.number().int().nullable(),
  satelliteCount: z.number().int().nullable(),
  stepCounter: z.number().int().nullable(),
  stepDelta: z.number().int(),
  stepsThisHour: z.number().int(),
  stepsToday: z.number().int(),
  stepsTodayDate: NullableStringSchema,
  deviceTimezone: NullableStringSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  resolvedPosition: ResolvedPositionSchema.nullable(),
  activePlan: ActiveSubscriptionSchema.nullable(),
  deviceSummary: DeviceSummarySchema.nullable(),
}).openapi("ChildSummary");

export const ChildGeofenceSchema = z.object({
  status: z.enum(["unset", "enabled", "disabled"]),
  containmentState: z.enum(["unknown", "inside", "outside"]),
  breachedAt: NullableDateTimeSchema,
  lastReenteredAt: NullableDateTimeSchema,
  lastEvaluatedAt: NullableDateTimeSchema,
  lastDistanceMeters: z.number().nullable(),
  centerLatitude: z.number().nullable(),
  centerLongitude: z.number().nullable(),
  radiusMeters: z.number().int().nullable(),
  updatedAt: NullableDateTimeSchema,
}).openapi("ChildGeofence");

export const OverviewChildSchema = ChildSummarySchema.extend({
  geofence: ChildGeofenceSchema,
}).openapi("OverviewChild");

export const ChildDetailSchema = z.object({
  id: UuidSchema,
  parentUserId: UuidSchema.nullable(),
  organizationId: UuidSchema,
  name: z.string(),
  avatarUrl: NullableStringSchema,
  schoolName: NullableStringSchema,
  schoolPlace: PlaceSchema.nullable(),
  gender: NullableStringSchema,
  dateOfBirth: z.string().nullable(),
  lifecycleStatus: z.enum(["active", "archived"]),
  summary: ChildSummarySchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("ChildDetail");

export const OverviewResponseSchema = z.object({
  children: z.array(OverviewChildSchema),
  selectedChildId: UuidSchema.nullable(),
  generatedAt: DateTimeSchema,
}).openapi("OverviewResponse");

export const HistoryCoordinateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
}).openapi("HistoryCoordinate");

export const HistoryPathPointSchema = HistoryCoordinateSchema.extend({
  occurredAt: DateTimeSchema.optional(),
}).openapi("HistoryPathPoint");

export const HistoryGeofenceEventSchema = z.object({
  id: UuidSchema,
  eventType: z.enum(["breached", "reentered", "reset"]),
  occurredAt: DateTimeSchema,
  displayTime: z.string(),
  label: z.string(),
  zoneLabel: NullableStringSchema,
}).openapi("HistoryGeofenceEvent");

export const HistoryPlaceSchema = z.object({
  label: z.string(),
  address: NullableStringSchema,
  representativeCoordinate: HistoryCoordinateSchema.nullable(),
  providerPlaceId: NullableStringSchema,
  matchType: z.enum(["saved", "exact", "near", "address", "pending", "unavailable"]),
  matchDistanceMeters: z.number().int().nullable(),
  enrichmentStatus: z.enum(["pending", "completed", "failed", "unavailable"]),
}).openapi("HistoryPlace");

const HistoryEventBaseSchema = z.object({
  id: z.string(),
  kind: z.enum(["stay", "trip", "gap"]),
  status: z.enum(["ongoing", "finalized"]),
  startedAt: DateTimeSchema,
  endedAt: NullableDateTimeSchema,
  displayStartedAt: DateTimeSchema,
  displayEndedAt: NullableDateTimeSchema,
  clippedDurationSeconds: z.number().int(),
  continuesFromPreviousDay: z.boolean(),
  continuesIntoNextDay: z.boolean(),
  geofenceEvents: z.array(HistoryGeofenceEventSchema),
});

export const ChildHistoryStayEventSchema = HistoryEventBaseSchema.extend({
  kind: z.literal("stay"),
  place: HistoryPlaceSchema,
  radiusMeters: z.number().int(),
}).openapi("ChildHistoryStayEvent");

export const ChildHistoryTripEventSchema = HistoryEventBaseSchema.extend({
  kind: z.literal("trip"),
  originLabel: z.string(),
  destinationLabel: z.string(),
  mode: z.enum(["walking", "vehicle", "unknown"]),
  modeConfidence: z.enum(["high", "medium", "low"]).nullable(),
  distanceMeters: z.number().int(),
  geometry: z.object({
    source: z.enum(["filtered", "roads"]),
    segments: z.array(z.array(HistoryPathPointSchema)),
  }),
}).openapi("ChildHistoryTripEvent");

export const ChildHistoryGapEventSchema = HistoryEventBaseSchema.extend({
  kind: z.literal("gap"),
  reason: z.enum(["telemetry_gap", "offline", "moved_while_sleeping"]),
  beforeCoordinate: HistoryCoordinateSchema.nullable(),
  afterCoordinate: HistoryCoordinateSchema.nullable(),
}).openapi("ChildHistoryGapEvent");

export const ChildHistoryEventSchema = z.discriminatedUnion("kind", [
  ChildHistoryStayEventSchema,
  ChildHistoryTripEventSchema,
  ChildHistoryGapEventSchema,
]).openapi("ChildHistoryEvent");

export const HistoryDataSourceSchema = z.enum(["live", "fixture"])
  .openapi("HistoryDataSource");

export const ChildHistoryRangeResponseSchema = z.object({
  dataSource: HistoryDataSourceSchema,
  childId: UuidSchema,
  timezone: z.string(),
  firstDate: DateSchema.nullable(),
  lastDataDate: DateSchema.nullable(),
  today: DateSchema,
}).openapi("ChildHistoryRangeResponse");

export const ChildHistoryDayResponseSchema = z.object({
  dataSource: HistoryDataSourceSchema,
  childId: UuidSchema,
  date: DateSchema,
  timezone: z.string(),
  generatedAt: DateTimeSchema,
  processedThrough: NullableDateTimeSchema,
  isProcessing: z.boolean(),
  events: z.array(ChildHistoryEventSchema),
}).openapi("ChildHistoryDayResponse");

export const FamilySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  logo: NullableStringSchema,
  familyName: NullableStringSchema,
  createdAt: DateTimeSchema,
  updatedAt: NullableDateTimeSchema,
}).openapi("Family");

export const FamilyPermissionSchema = z.object({
  canManageChildren: z.boolean(),
  canManageGeofences: z.boolean(),
  canManageMembers: z.boolean(),
  canManageJoinCodes: z.boolean(),
  canCreateShareLinks: z.boolean(),
}).openapi("FamilyPermission");

export const FamilyContextSchema = z.object({
  organization: FamilySchema.nullable(),
  memberRole: z.enum(["admin", "member"]).nullable(),
  permissions: FamilyPermissionSchema,
  requiresOnboarding: z.boolean(),
}).openapi("FamilyContext");

export const FamilyMemberSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  organizationId: UuidSchema,
  role: z.enum(["admin", "member"]),
  createdAt: DateTimeSchema,
  user: z.object({
    id: UuidSchema,
    displayName: z.string(),
    phoneNumber: z.string(),
    email: z.string().nullable(),
    avatarUrl: NullableStringSchema,
  }),
}).openapi("FamilyMember");

export const FamilyJoinCodeSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  phoneNumber: NullableStringSchema,
  token: z.string().nullable(),
  joinUrl: z.string().nullable(),
  role: z.literal("member"),
  inviteKind: z.enum(["phone", "qr"]),
  expiresAt: DateTimeSchema,
  consumedAt: NullableDateTimeSchema,
  revokedAt: NullableDateTimeSchema,
  createdAt: DateTimeSchema,
}).openapi("FamilyJoinCode");

export const FamilyQrInviteSchema = z.object({
  id: UuidSchema,
  organizationId: UuidSchema,
  token: z.string(),
  joinUrl: z.string().url(),
  role: z.literal("member"),
  inviteKind: z.literal("qr"),
  expiresAt: DateTimeSchema,
  createdAt: DateTimeSchema,
}).openapi("FamilyQrInvite");

export const PublicFamilyInvitePreviewSchema = z.object({
  familyName: NullableStringSchema,
  role: z.literal("member").nullable(),
  expiresAt: NullableDateTimeSchema,
  status: z.enum(["valid", "expired", "unavailable"]),
}).openapi("PublicFamilyInvitePreview");

export const JoinFamilyPreviewSchema = z.object({
  organization: z.object({
    id: UuidSchema,
    name: z.string(),
    slug: z.string(),
    familyName: NullableStringSchema,
  }),
  role: z.literal("member"),
  phoneNumber: NullableStringSchema,
  inviteKind: z.enum(["phone", "qr"]),
  expiresAt: DateTimeSchema,
  isValid: z.boolean(),
}).openapi("JoinFamilyPreview");

export const LeaveFamilyResultSchema = z.object({
  left: z.boolean(),
  nextOnboardingPath: z.literal("/onboarding/family"),
}).openapi("LeaveFamilyResult");

export const RemoveFamilyMemberResultSchema = z.object({
  removed: z.boolean(),
  memberId: UuidSchema,
}).openapi("RemoveFamilyMemberResult");

export const BindChildDeviceResultSchema = z.object({
  childId: UuidSchema,
  deviceId: UuidSchema,
  hardwareIdentifier: z.string(),
  linked: z.boolean(),
}).openapi("BindChildDeviceResult");

export const ArchiveChildResultSchema = z.object({
  id: UuidSchema,
  archived: z.boolean(),
  deviceHardwareIdentifier: NullableStringSchema,
}).openapi("ArchiveChildResult");

export const UnlinkChildDeviceResultSchema = z.object({
  childId: UuidSchema,
  deviceId: UuidSchema.nullable(),
  hardwareIdentifier: NullableStringSchema,
  unlinked: z.boolean(),
}).openapi("UnlinkChildDeviceResult");

export const StartOrJoinFamilySchema = z.object({
  family: FamilySchema,
  context: FamilyContextSchema,
}).openapi("FamilyOnboardingResult");

export const UserProfileSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  phoneNumber: z.string(),
  avatarUrl: NullableStringSchema,
  currentAddress: NullableStringSchema,
  dateOfBirth: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  role: z.enum(["user", "admin"]),
  status: z.enum(["active", "suspended"]),
  banned: z.boolean(),
  banReason: NullableStringSchema,
  banExpires: NullableDateTimeSchema,
  lastSeenAt: NullableDateTimeSchema,
  family: FamilyContextSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("UserProfile");

export const AuthSessionSchema = z.object({
  token: z.string().nullable(),
  expiresAt: NullableDateTimeSchema,
  user: UserProfileSchema.nullable(),
}).openapi("AuthSession");

export const VerifyGoogleEmailInputSchema = z.object({
  idToken: z.string().trim().min(1),
}).openapi("VerifyGoogleEmailInput");

export const LocationHistoryItemSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  latitude: z.number(),
  longitude: z.number(),
  source: z.enum(["gps", "cell", "network"]),
  locationLabel: NullableStringSchema,
  accuracyMeters: z.number().nullable(),
  batteryPercent: z.number().int().nullable(),
  batteryVoltageMv: z.number().int().nullable(),
  signalStrength: z.number().int().nullable(),
  satelliteCount: z.number().int().nullable(),
  stepCounter: z.number().int(),
  deviceState: z.enum(["active", "sleep", "offline"]),
  occurredAt: DateTimeSchema,
  ingestedAt: DateTimeSchema,
}).openapi("LocationHistoryItem");

export const LocationHistoryResponseSchema = z.object({
  items: z.array(LocationHistoryItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("LocationHistoryResponse");

export const ChildTrailPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  occurredAt: DateTimeSchema,
  distanceFromLatestMeters: z.number(),
}).openapi("ChildTrailPoint");

export const ChildTrailSegmentSchema = z.object({
  source: z.enum(["filtered", "roads"]),
  points: z.array(ChildTrailPointSchema),
}).openapi("ChildTrailSegment");

export const ChildTrailResponseSchema = z.object({
  childId: UuidSchema,
  distanceMeters: z.number().int(),
  generatedAt: DateTimeSchema,
  geometrySource: z.enum(["filtered", "roads", "hybrid"]),
  segments: z.array(ChildTrailSegmentSchema),
  points: z.array(ChildTrailPointSchema),
}).openapi("ChildTrailResponse");

export const ChildLiveResponseSchema = z.object({
  child: ChildSummarySchema,
}).openapi("ChildLiveResponse");

export const ActivityRangeSchema = z.object({
  startDate: DateSchema,
  endDate: DateSchema,
  timezone: z.string(),
  label: z.string(),
}).openapi("ActivityRange");

export const ActivityInsightPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  tone: z.enum(["green", "blue", "yellow"]),
}).openapi("ActivityInsightPoint");

export const ActivityInsightBannerSchema = z.object({
  mode: z.enum(["active", "inactive"]),
  title: z.string(),
  points: z.tuple([ActivityInsightPointSchema, ActivityInsightPointSchema]),
}).openapi("ActivityInsightBanner");

export const ActivityMetricSchema = z.object({
  key: z.enum(["steps", "activeTime", "calories"]),
  label: z.string(),
  value: z.number(),
  formattedValue: z.string(),
  unit: z.enum(["steps", "min", "kcal"]),
  goalValue: z.number(),
  formattedGoal: z.string(),
  percentOfGoal: z.number(),
  comparisonPercent: z.number().nullable(),
  tone: z.enum(["green", "blue", "orange"]),
}).openapi("ActivityMetric");

export const ActivityHourlyBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  label: z.string(),
  steps: z.number().int(),
  activeMinutes: z.number().int(),
  isPeak: z.boolean(),
}).openapi("ActivityHourlyBucket");

export const ActivitySeriesPointSchema = z.object({
  date: DateSchema,
  label: z.string(),
  steps: z.number().int(),
  activeMinutes: z.number().int(),
  calories: z.number().int(),
}).openapi("ActivitySeriesPoint");

export const ChildActivityResponseSchema = z.object({
  childId: UuidSchema,
  period: z.enum(["day", "week", "month", "year"]),
  range: ActivityRangeSchema,
  generatedAt: DateTimeSchema,
  insightBanner: ActivityInsightBannerSchema,
  metrics: z.array(ActivityMetricSchema),
  rhythm: z.array(ActivityHourlyBucketSchema),
  series: z.array(ActivitySeriesPointSchema),
  isLive: z.boolean(),
}).openapi("ChildActivityResponse");

export const NotificationSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  body: z.string(),
  imageUrl: NullableStringSchema,
  targetRole: NullableStringSchema,
  targetUserId: UuidSchema.nullable(),
  status: z.enum(["draft", "active", "archived"]),
  publishedAt: NullableDateTimeSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("Notification");

export const NotificationInboxChildSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  initials: z.string(),
  avatarUrl: NullableStringSchema,
}).openapi("NotificationInboxChild");

export const NotificationInboxDataSchema = z.object({
  route: z.literal("/home"),
  childId: UuidSchema,
  geofenceEventId: UuidSchema,
}).openapi("NotificationInboxData");

export const NotificationInboxItemSchema = z.object({
  id: UuidSchema,
  type: z.enum(["geofence_breached", "geofence_reentered"]),
  priority: z.enum(["general", "child_safety"]),
  title: z.string(),
  body: z.string(),
  child: NotificationInboxChildSchema.nullable(),
  data: NotificationInboxDataSchema,
  readAt: NullableDateTimeSchema,
  occurredAt: DateTimeSchema,
  createdAt: DateTimeSchema,
}).openapi("NotificationInboxItem");

export const NotificationInboxResponseSchema = z.object({
  items: z.array(NotificationInboxItemSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int(),
}).openapi("NotificationInboxResponse");

export const NotificationUnreadCountSchema = z.object({
  unreadCount: z.number().int(),
}).openapi("NotificationUnreadCount");

export const PushInstallationSchema = z.object({
  expoPushToken: z.string().trim().min(1),
  installationId: z.string().trim().min(1),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().nullable(),
}).openapi("PushInstallation");

export const CmsPageSchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.enum(["draft", "active", "archived"]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("CmsPage");

export const FeedbackSubmissionResultSchema = z.object({
  id: UuidSchema,
  createdAt: DateTimeSchema,
}).openapi("FeedbackSubmissionResult");

export const ShareLinkSchema = z.object({
  id: UuidSchema,
  shareUrl: z.string(),
  startsAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  status: z.literal("active"),
}).openapi("ShareLink");

export const ActiveShareLinkResponseSchema = z.object({
  share: ShareLinkSchema.nullable(),
}).openapi("ActiveShareLinkResponse");

export const RevokedShareLinkSchema = z.discriminatedUnion("status", [
  z.object({
    id: UuidSchema,
    revokedAt: DateTimeSchema,
    status: z.literal("revoked"),
  }),
  z.object({
    id: UuidSchema,
    revokedAt: z.null(),
    status: z.literal("expired"),
  }),
]).openapi("RevokedShareLink");

export const PublicShareChildSchema = z.object({
  childName: z.string(),
  initials: z.string(),
  avatarUrl: NullableStringSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  resolvedPosition: ResolvedPositionSchema.nullable(),
  telemetryState: z.enum(["active", "sleep", "offline", "connecting"]),
  gpsState: z.enum(["connected", "acquiring", "stale", "offline"]),
  statusLabel: z.string(),
  lastUpdatedAt: NullableDateTimeSchema,
}).openapi("PublicShareChild");

export const PublicShareResponseSchema = z.object({
  startsAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  status: z.literal("active"),
  child: PublicShareChildSchema,
}).openapi("PublicShareResponse");

export const PublicShareExpiredSchema = z.object({
  expiresAt: DateTimeSchema,
}).openapi("PublicShareExpired");

export const AdminDeviceSchema = z.object({
  id: UuidSchema,
  hardwareIdentifier: z.string(),
  displayName: NullableStringSchema,
  platform: z.enum(["android", "ios", "embedded", "unknown"]),
  status: z.enum(["fresh", "active", "inactive", "blocked"]),
  lastSeenAt: NullableDateTimeSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  activeBinding: z.object({
    id: UuidSchema,
    childId: UuidSchema,
    childName: z.string(),
    childAvatarUrl: NullableStringSchema,
    organizationId: UuidSchema,
    boundAt: DateTimeSchema,
  }).nullable(),
  reservation: z.object({
    reservedByUserId: UuidSchema.nullable(),
    reservedByOrganizationId: UuidSchema.nullable(),
    reservedUntil: NullableDateTimeSchema,
  }),
  firmware: z.object({
    version: z.string(),
    bootloaderVersion: NullableStringSchema,
    signingKey: NullableStringSchema,
    otaState: NullableStringSchema,
    lastResult: NullableStringSchema,
    availableVersion: NullableStringSchema,
    downloadPercent: z.number().int().nullable(),
    reportedAt: DateTimeSchema,
  }).nullable(),
}).openapi("AdminDevice");

export const AdminDeviceTelemetryReliabilitySchema = z.object({
  windowMinutes: z.literal(30),
  windowStartedAt: DateTimeSchema,
  calculatedAt: DateTimeSchema,
  expectedIntervalSeconds: z.literal(8),
  lateAtSeconds: z.literal(10),
  missingAtSeconds: z.literal(17),
  latestDeviceState: z.enum(["active", "sleep", "offline"]).nullable(),
  lastPacketAt: NullableDateTimeSchema,
  lastCompletedIntervalSeconds: z.number().nonnegative().nullable(),
  completedOnTimePackets: z.number().int().nonnegative(),
  completedLatePackets: z.number().int().nonnegative(),
  completedMissedPackets: z.number().int().nonnegative(),
}).openapi("AdminDeviceTelemetryReliability");

export const AdminDeviceListItemSchema = AdminDeviceSchema.extend({
  telemetryReliability: AdminDeviceTelemetryReliabilitySchema,
}).openapi("AdminDeviceListItem");

export const AdminChildParentSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
  phoneNumber: z.string(),
  email: z.string().nullable(),
  avatarUrl: NullableStringSchema,
}).nullable().openapi("AdminChildParent");

export const AdminChildRelationshipSummarySchema = z.object({
  id: UuidSchema,
  name: z.string(),
  avatarUrl: NullableStringSchema,
  lifecycleStatus: z.enum(["active", "archived"]),
  trackingStatus: z.enum(["safe", "transit", "alert", "offline"]),
  telemetryState: z.enum(["active", "sleep", "offline", "connecting"]),
  activeDevice: z.object({
    id: UuidSchema,
    hardwareIdentifier: z.string(),
    displayName: NullableStringSchema,
    status: z.enum(["fresh", "active", "inactive", "blocked"]),
  }).nullable(),
}).openapi("AdminChildRelationshipSummary");

export const AdminUserChildRelationshipSchema = z.object({
  count: z.number().int(),
  previewChildren: z.array(AdminChildRelationshipSummarySchema),
}).openapi("AdminUserChildRelationship");

export const AdminUserSummarySchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
  phoneNumber: z.string(),
  email: z.string().nullable(),
  avatarUrl: NullableStringSchema,
}).openapi("AdminUserSummary");

export const AdminFamilyRelationSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  familyName: NullableStringSchema,
  logo: NullableStringSchema,
}).openapi("AdminFamilyRelation");

export const AdminUserListItemSchema = UserProfileSchema.extend({
  childRelationship: AdminUserChildRelationshipSchema,
}).openapi("AdminUserListItem");

export const AdminChildListItemSchema = ChildDetailSchema.extend({
  parent: AdminChildParentSchema,
}).openapi("AdminChildListItem");

export const AdminChildDeviceLinkSchema = z.object({
  device: AdminDeviceSchema.nullable(),
  bindingId: UuidSchema.nullable(),
  boundAt: NullableDateTimeSchema,
}).openapi("AdminChildDeviceLink");

export const AdminUserDetailSchema = UserProfileSchema.extend({
  children: z.array(AdminChildListItemSchema),
}).openapi("AdminUserDetail");

export const AdminChildDetailSchema = ChildDetailSchema.extend({
  parent: AdminChildParentSchema,
  deviceLink: AdminChildDeviceLinkSchema,
}).openapi("AdminChildDetail");

export const AdminDeviceOwnershipSchema = z.object({
  organizationId: UuidSchema,
  organizationName: NullableStringSchema,
  claimedAt: DateTimeSchema,
}).openapi("AdminDeviceOwnership");

export const AdminDeviceDetailSchema = AdminDeviceListItemSchema.extend({
  ownership: AdminDeviceOwnershipSchema.nullable(),
}).openapi("AdminDeviceDetail");

export const AdminFamilyListItemSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  slug: z.string(),
  familyName: NullableStringSchema,
  logo: NullableStringSchema,
  admin: AdminUserSummarySchema.nullable(),
  memberCount: z.number().int(),
  childCount: z.number().int(),
  activeJoinCodeCount: z.number().int(),
  createdAt: DateTimeSchema,
  updatedAt: NullableDateTimeSchema,
}).openapi("AdminFamilyListItem");

export const AdminFamilyDetailSchema = AdminFamilyListItemSchema.extend({
  members: z.array(FamilyMemberSchema),
  children: z.array(AdminChildListItemSchema),
  joinCodes: z.array(FamilyJoinCodeSchema),
}).openapi("AdminFamilyDetail");

export const AdminDeviceLiveTelemetrySchema = z.object({
  device: AdminDeviceSchema,
  child: AdminChildListItemSchema.nullable(),
  location: z.object({
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    source: z.enum(["gps", "cell", "network"]).nullable(),
    label: NullableStringSchema,
    accuracyMeters: z.number().nullable(),
    occurredAt: NullableDateTimeSchema,
    ingestedAt: NullableDateTimeSchema,
  }),
  battery: z.object({
    percent: z.number().int().nullable(),
    voltageMv: z.number().int().nullable(),
  }),
  signal: z.object({
    strength: z.number().int().nullable(),
    satelliteCount: z.number().int().nullable(),
  }),
  motion: z.object({
    stepCounter: z.number().int().nullable(),
    stepDelta: z.number().int(),
    stepsThisHour: z.number().int(),
  }),
  state: z.object({
    deviceState: z.enum(["active", "sleep", "offline", "connecting"]),
    trackingStatus: z.enum(["safe", "transit", "alert", "offline"]).nullable(),
    lastSeenAt: NullableDateTimeSchema,
    gsmState: z.enum(["connected", "stale", "offline"]),
    gpsState: z.enum(["connected", "acquiring", "stale", "offline"]),
    lastGpsFixAt: NullableDateTimeSchema,
  }),
}).openapi("AdminDeviceLiveTelemetry");

export const AdminLocationEventSchema = z.object({
  id: UuidSchema,
  deviceId: UuidSchema,
  childId: UuidSchema,
  child: z.object({
    id: UuidSchema,
    name: z.string(),
  }).nullable(),
  device: z.object({
    id: UuidSchema,
    hardwareIdentifier: z.string(),
    displayName: NullableStringSchema,
  }).nullable(),
  latitude: z.number(),
  longitude: z.number(),
  gpsConnected: z.boolean(),
  source: z.enum(["gps", "cell", "network", "none"]),
  locationLabel: NullableStringSchema,
  accuracyMeters: z.number().nullable(),
  batteryPercent: z.number().int().nullable(),
  batteryVoltageMv: z.number().int().nullable(),
  signalStrength: z.number().int().nullable(),
  satelliteCount: z.number().int().nullable(),
  stepCounter: z.number().int(),
  deviceState: z.enum(["active", "sleep", "offline"]),
  occurredAt: DateTimeSchema,
  ingestedAt: DateTimeSchema,
}).openapi("AdminLocationEvent");

export const AdminLocationEventListResponseSchema = z.object({
  items: z.array(AdminLocationEventSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminLocationEvents");

export const AdminGeofenceSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  childName: z.string(),
  activeDevice: AdminDeviceSchema.nullable(),
  family: AdminFamilyRelationSchema,
  status: z.enum(["unset", "enabled", "disabled"]),
  containmentState: z.enum(["unknown", "inside", "outside"]),
  lastLatitude: z.number().nullable(),
  lastLongitude: z.number().nullable(),
  centerLatitude: z.number().nullable(),
  centerLongitude: z.number().nullable(),
  radiusMeters: z.number().int().nullable(),
  lastDistanceMeters: z.number().nullable(),
  breachedAt: NullableDateTimeSchema,
  lastReenteredAt: NullableDateTimeSchema,
  lastEvaluatedAt: NullableDateTimeSchema,
  unacknowledgedBreachCount: z.number().int(),
  updatedAt: NullableDateTimeSchema,
}).openapi("AdminGeofence");

export const AdminGeofenceEventSchema = z.object({
  id: UuidSchema,
  geofenceId: UuidSchema,
  child: z.object({
    id: UuidSchema,
    name: z.string(),
  }),
  device: z.object({
    id: UuidSchema,
    hardwareIdentifier: z.string(),
    displayName: NullableStringSchema,
  }).nullable(),
  family: AdminFamilyRelationSchema,
  eventType: z.enum(["breached", "reentered", "reset"]),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  distanceMeters: z.number().nullable(),
  radiusMeters: z.number().int().nullable(),
  occurredAt: DateTimeSchema,
  createdAt: DateTimeSchema,
  acknowledgment: z.object({
    acknowledgedAt: DateTimeSchema,
    acknowledgedBy: AdminUserSummarySchema,
    note: NullableStringSchema,
  }).nullable(),
}).openapi("AdminGeofenceEvent");

export const PaginatedAdminGeofencesSchema = z.object({
  items: z.array(AdminGeofenceSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminGeofences");

export const PaginatedAdminGeofenceEventsSchema = z.object({
  items: z.array(AdminGeofenceEventSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminGeofenceEvents");

export const AdminGeofenceBreachCountsSchema = z.object({
  unacknowledged: z.number().int(),
  acknowledged: z.number().int(),
}).openapi("AdminGeofenceBreachCounts");

export const AdminAcknowledgeGeofenceBreachInputSchema = z.object({
  note: z.string().trim().nullable().optional(),
}).openapi("AdminAcknowledgeGeofenceBreachInput");

export const AdminBulkAcknowledgeGeofenceBreachesInputSchema = z.object({
  eventIds: z.array(UuidSchema).min(1),
  note: z.string().trim().nullable().optional(),
}).openapi("AdminBulkAcknowledgeGeofenceBreachesInput");

export const PaginatedAdminUsersSchema = z.object({
  items: z.array(AdminUserListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminUsers");

export const PaginatedAdminChildrenSchema = z.object({
  items: z.array(AdminChildListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminChildren");

export const PaginatedAdminDevicesSchema = z.object({
  items: z.array(AdminDeviceListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminDevices");

export const PaginatedAdminFamiliesSchema = z.object({
  items: z.array(AdminFamilyListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  hasMore: z.boolean(),
}).openapi("PaginatedAdminFamilies");

export const DeviceAuthResultSchema = z.object({
  device: AdminDeviceSchema,
  token: z.string(),
}).openapi("DeviceAuthResult");

export const DeviceBindResultSchema = z.object({
  childId: UuidSchema,
  deviceId: UuidSchema,
  bound: z.boolean(),
}).openapi("DeviceBindResult");

export const DeviceUnbindResultSchema = z.object({
  childId: UuidSchema,
  deviceId: UuidSchema,
  unbound: z.boolean(),
}).openapi("DeviceUnbindResult");

export const AdminBulkCreateDeviceInputSchema = z.object({
  devices: z.array(z.object({
    hardwareIdentifier: z.string().trim().min(1),
    displayName: z.string().trim().nullable().optional(),
    platform: z.enum(["android", "ios", "embedded", "unknown"]).optional(),
    status: z.enum(["fresh", "active", "inactive", "blocked"]).optional(),
  })).min(1).max(500),
}).openapi("AdminBulkCreateDeviceInput");

export const AdminBulkCreateDeviceResultSchema = z.object({
  created: z.array(AdminDeviceSchema),
  skipped: z.array(z.object({
    hardwareIdentifier: z.string(),
    reason: z.string(),
  })),
}).openapi("AdminBulkCreateDeviceResult");

export const AdminUpdateUserInputSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
}).openapi("AdminUpdateUserInput");

export const AdminCreateChildForUserInputSchema = z.object({
  name: z.string().trim().min(1),
  schoolName: z.string().trim().nullable().optional(),
  gender: z.string().trim().nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  lifecycleStatus: z.enum(["active", "archived"]).optional(),
  avatarUrl: z.string().trim().nullable().optional(),
  deviceId: UuidSchema,
}).openapi("AdminCreateChildForUserInput");

export const AdminCreateFamilyInputSchema = z.object({
  familyName: z.string().trim().min(1),
  adminUserId: UuidSchema,
}).openapi("AdminCreateFamilyInput");

export const AdminAddFamilyMemberInputSchema = z.object({
  userId: UuidSchema,
}).openapi("AdminAddFamilyMemberInput");

export const AdminTransferFamilyAdminInputSchema = z.object({
  userId: UuidSchema,
}).openapi("AdminTransferFamilyAdminInput");

export const AdminBanUserInputSchema = z.object({
  banReason: z.string().trim().nullable().optional(),
  banExpiresIn: z.number().int().positive().nullable().optional(),
}).openapi("AdminBanUserInput");

export const AdminUnbanUserInputSchema = z.object({}).openapi("AdminUnbanUserInput");

export const AdminUpdateChildInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  avatarUrl: z.string().trim().nullable().optional(),
  schoolName: z.string().trim().nullable().optional(),
  gender: z.string().trim().nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  lifecycleStatus: z.enum(["active", "archived"]).optional(),
}).openapi("AdminUpdateChildInput");

export const PreviewAccessEntrySchema = z.object({
  id: UuidSchema,
  phoneNumber: z.string(),
  label: NullableStringSchema,
  isActive: z.boolean(),
  createdByUserId: UuidSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("PreviewAccessEntry");

export const PreviewAccessStateSchema = z.object({
  enabled: z.boolean(),
  entries: z.array(PreviewAccessEntrySchema),
}).openapi("PreviewAccessState");

export const CreatePreviewAccessEntryInputSchema = z.object({
  phoneNumber: z.string().trim().min(1),
  label: z.string().trim().max(120).nullable().optional(),
}).openapi("CreatePreviewAccessEntryInput");

export const UpdatePreviewAccessEntryInputSchema = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (input) => input.label !== undefined || input.isActive !== undefined,
  { message: "Provide a label or active state to update." },
).openapi("UpdatePreviewAccessEntryInput");

export const PrepareOtpResponseSchema = z.object({
  challengeToken: z.string(),
  expiresAt: DateTimeSchema,
  intent: z.enum(["signin", "signup"]),
  phoneNumber: z.string(),
  resendAvailableAt: DateTimeSchema,
}).openapi("PrepareOtpResponse");

export const DeviceReservationSchema = z.object({
  deviceId: UuidSchema,
  hardwareIdentifier: z.string(),
  displayName: NullableStringSchema,
  status: z.enum(["fresh", "inactive"]),
  reservationToken: z.string(),
  expiresAt: DateTimeSchema,
}).openapi("DeviceReservation");

export const ChildAvatarUploadIntentSchema = z.object({
  path: z.string(),
  signedUrl: z.string().url(),
  expiresAt: DateTimeSchema,
}).openapi("ChildAvatarUploadIntent");

export const UserAvatarUploadIntentSchema = z.object({
  path: z.string(),
  signedUrl: z.string().url(),
  expiresAt: DateTimeSchema,
}).openapi("UserAvatarUploadIntent");

export const AdminPlanRecordSchema = PlanSchema.extend({
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("AdminPlanRecord");

export const AdminSubscriptionRecordSchema = z.object({
  id: UuidSchema,
  childId: UuidSchema,
  planId: UuidSchema,
  source: z.enum(["admin", "purchase", "promo"]),
  externalOrderId: NullableStringSchema,
  externalPurchaseId: NullableStringSchema,
  status: z.enum(["active", "expired", "cancelled"]),
  startsAt: DateTimeSchema,
  endsAt: DateTimeSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}).openapi("AdminSubscriptionRecord");

export const WebSocketUpgradeSchema = z.object({
  ok: z.boolean(),
}).openapi("WebSocketUpgradePlaceholder");
