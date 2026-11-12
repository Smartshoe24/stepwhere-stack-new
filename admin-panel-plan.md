# Stepwhere Admin Panel Expansion Plan

## Summary

This plan expands the Stepwhere admin panel into a full operations console for users, children, devices, families, telemetry, activity analytics, geofences, and breach response.

The implementation should be delivered in four phases:

1. Admin foundation, formatting, navigation cleanup, and view-page UI redesigns.
2. User, child, family, device relationship workflows.
3. Device and child telemetry, Google Maps, and activity analytics.
4. Geofence management, breach queue, acknowledgments, and protected admin realtime.

This document is intentionally decision-complete. Implementers should not need to make product or architecture decisions while building from it.

## Locked Decisions

- Global admin date display format is `17 Jun 26`.
- Google Maps is the standard map provider for admin map views.
- If Google Maps config is missing, show a useful coordinate fallback instead of a broken map.
- Admin Socket.IO realtime must be protected by Better Auth session and `role === "admin"`.
- Add-child from user detail requires the target user to already belong to a family.
- Add-child from user detail requires selecting a device.
- Child avatars use initials fallback when no photo/avatar URL exists. Do not generate/upload an image file in this phase.
- Family membership remains one family per user.
- Adding an existing user to a family adds them as `member` only.
- Family admin transfer is explicit. Promoting one member to admin demotes the previous admin to member transactionally.
- Geofence breach acknowledgment is global operations state, not per-admin read state.
- Geofence nav badge counts globally unacknowledged breaches.
- Relationship previews are read-only.
- Relationship trigger click navigates directly to the record.
- Preview popovers open on hover/focus and are prefetched for visible rows.
- Remove template/admin demo surfaces aggressively, while keeping required auth/errors and account/appearance/notification settings accessible outside the sidebar.

## Phase 1: Foundation, Formatting, Navigation, And View UI

### Date Formatting Utility

Create:

```txt
apps/admin/src/lib/date-format.ts
```

Exports:

```ts
export function formatAdminDate(value: string | Date | null | undefined): string
export function formatAdminDateTime(value: string | Date | null | undefined): string
export function formatAdminDateTimeWithSeconds(value: string | Date | null | undefined): string
export function formatAdminDateRange(start: string | Date | null | undefined, end: string | Date | null | undefined): string
export function formatAdminRelativeDate(value: string | Date | null | undefined): string
```

Rules:

- `formatAdminDate(...)` returns `17 Jun 26`.
- `formatAdminDateTime(...)` returns `17 Jun 26, 14:30`.
- `formatAdminDateTimeWithSeconds(...)` returns `17 Jun 26, 14:30:21`.
- `formatAdminDateRange(start, end)` returns `17 Jun 26 - 21 Jun 26`.
- Nullish values return `Never` unless a caller passes a custom fallback later.
- Invalid dates return `Invalid date`.
- Use `date-fns` already present in the admin app.
- Never render raw ISO timestamps in admin UI once this phase is complete.

Update all date usages in:

- user list and user detail
- child list and child detail
- device list and device detail
- preview popovers
- CSV exports
- QR ZIP filenames
- future family/geofence/telemetry pages

### Enum Badge System

Create:

```txt
apps/admin/src/features/admin/components/status-badge.tsx
```

Exports:

```ts
export function UserRoleBadge({ role }: { role: "user" | "admin" }): JSX.Element
export function UserStatusBadge({ status }: { status: "active" | "suspended" }): JSX.Element
export function BanStateBadge({ banned }: { banned: boolean }): JSX.Element
export function ChildLifecycleBadge({ status }: { status: "active" | "archived" }): JSX.Element
export function TrackingStatusBadge({ status }: { status: "safe" | "transit" | "alert" | "offline" }): JSX.Element
export function TelemetryStateBadge({ state }: { state: "active" | "sleep" | "offline" | "connecting" }): JSX.Element
export function DevicePlatformBadge({ platform }: { platform: "android" | "ios" | "embedded" | "unknown" }): JSX.Element
export function DeviceStatusBadge({ status }: { status: "fresh" | "active" | "inactive" | "blocked" }): JSX.Element
export function GeofenceStatusBadge({ status }: { status: "unset" | "enabled" | "disabled" }): JSX.Element
export function ContainmentBadge({ state }: { state: "unknown" | "inside" | "outside" }): JSX.Element
export function GeofenceEventBadge({ eventType }: { eventType: "breached" | "reentered" | "reset" }): JSX.Element
export function AckStateBadge({ acknowledged }: { acknowledged: boolean }): JSX.Element
```

Visual rules:

- Neutral states use outline badges.
- Good states use green/emerald outline styling.
- Warning states use amber.
- Breach/blocked/banned states use destructive styling.
- Badges should be compact and readable in dense tables.
- Badges should be used in view pages, tables, preview popovers, and relationship panels.

### Copyable Identifiers

Create:

```txt
apps/admin/src/features/admin/components/copyable-id.tsx
```

Props:

```ts
type CopyableIdProps = {
  value: string | null | undefined;
  label: string;
  compact?: boolean;
  monospace?: boolean;
};
```

Behavior:

- Displays the identifier in monospace by default.
- Shows an icon-only `Copy` button from `lucide-react`.
- Button has accessible label like `Copy hardware ID`.
- Toasts `Copied hardware ID.` on success.
- If value is missing, render muted `Not available`.

Use anywhere these appear:

- device ID
- hardware identifier
- child ID
- user ID when shown
- family ID
- geofence ID
- geofence event ID
- coordinates where useful

### Relationship Preview Redesign

Update:

```txt
apps/admin/src/features/admin/components/record-preview-link.tsx
```

Required behavior:

- Trigger is rendered as link-styled text.
- Hover/focus opens preview popover.
- Click navigates directly to the target record.
- Remove the `Open record` button from popover content.
- Popover content is read-only.
- Popover should never execute destructive mutations.
- Missing relation renders muted text, no query, no popover.
- Preview data should be prefetched:
  - on visible row render via `usePrefetchRelatedRecords`
  - on hover/focus
- Use badges for enum fields.
- Use `CopyableId` for important IDs.

Supported relationship record types:

```ts
export type AdminRelatedRecordType =
  | "user"
  | "child"
  | "device"
  | "family"
  | "geofence";
```

Routes:

- user -> `/users/:userId`
- child -> `/children/:childId`
- device -> `/devices/:deviceId`
- family -> `/families/:familyId`
- geofence -> `/geofences/:geofenceId`

Preview content:

User:

- display name
- phone
- email
- role badge
- status badge
- ban badge
- child count
- family relationship if available

Child:

- name
- lifecycle badge
- tracking badge
- telemetry badge
- parent user relationship
- active device relationship
- last seen formatted

Device:

- hardware ID with copy
- display name
- platform badge
- status badge
- active child relationship
- reservation state
- last seen formatted

Family:

- family name
- slug
- admin relationship
- member count
- child count
- active join code count

Geofence:

- child relationship
- active device relationship
- status badge
- containment badge
- radius
- breach state
- last evaluated formatted

### Shared View Page Layout

Create/extend:

```txt
apps/admin/src/features/admin/components/record-page-header.tsx
apps/admin/src/features/admin/components/record-stat.tsx
apps/admin/src/features/admin/components/relationship-panel.tsx
apps/admin/src/features/admin/components/record-section.tsx
apps/admin/src/features/admin/components/record-detail-grid.tsx
apps/admin/src/features/admin/components/record-tabs.tsx
```

View page design rules:

- No marketing hero layout.
- First viewport should communicate operational state immediately.
- Use horizontal space: desktop detail pages should use 2-column or 3-column sections.
- Avoid long single-column key/value walls.
- Use dense, grouped sections:
  - identity
  - status
  - relationships
  - telemetry/activity
  - timestamps
  - actions
- Put primary actions in the header.
- Put destructive actions behind confirmation or clearly separated button styling.
- Use tabs only when the record has distinct operational modes.
- Use stable heights for map panels and metric grids to prevent layout shift.
- Do not nest cards inside cards.
- Use repeated item cards only for relation lists and event rows.

### Navigation Cleanup

Sidebar should become:

General:

- Dashboard
- Apps

Operations:

- Users
- Children
- Devices
- Families
- Geofences

Remove from sidebar:

- Tasks
- Chats
- Help Center
- Settings
- Auth demo pages
- Error demo pages

Keep accessible outside sidebar:

- Account settings
- Appearance settings
- Notification settings

Access settings through:

- profile dropdown
- top-right settings icon or profile menu action

Delete unused template code for:

- tasks feature
- chats feature
- unused task/chat routes
- unused mock data
- old template user components that are not used by real admin users
- billing/demo/settings pages that are not required

Keep:

- auth flow
- OTP flow
- error routes
- account settings
- appearance settings
- notification settings
- dashboard
- apps

## Phase 2: Users, Children, Families, And Relationship Workflows

### Add Child From User Detail

Add action on `/users/:userId`:

```txt
Add child
```

Precondition:

- User must already belong to a family.
- If user has no family, do not show the creation form.
- Show a blocking message:

```txt
This user must belong to a family before a child can be added. Open Families to create or link a family first.
```

Add button:

```txt
Open Families
```

Device requirement:

- Device selection is required.
- Only unbound, non-blocked devices should be selectable.
- Child creation and device binding must happen transactionally.

Dialog fields:

- name, required
- school name, optional
- gender, optional
- date of birth, optional
- lifecycle status, default `active`
- device, required
- avatar URL, optional

Avatar behavior:

- If avatar URL is blank, submit `avatarUrl: null`.
- UI uses initials fallback.
- Do not generate or upload an image file.

Server API:

```txt
POST /v1/admin/users/:userId/children
```

Input:

```ts
export type AdminCreateChildForUserInput = {
  name: string;
  schoolName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  lifecycleStatus?: "active" | "archived";
  avatarUrl?: string | null;
  deviceId: string;
};
```

Behavior:

- Verify target user exists.
- Verify target user belongs to a family.
- If no family, return `409 USER_HAS_NO_FAMILY`.
- Verify selected device exists.
- Verify selected device is unbound.
- Verify selected device is not blocked.
- Create child under the user’s organization.
- Set `parentUserId` to target user.
- Bind selected device to the child.
- Return `AdminChildDetailDto`.

Frontend invalidation:

- users list
- user detail
- children list
- created child detail
- devices list
- selected device detail

### User Detail UI

Tabs:

- Overview
- Children
- Access

Overview:

- profile details
- family relationship
- child count
- last seen
- created/updated

Children:

- related children list
- child relationships are previewable and clickable
- each child row shows active device relationship if present
- Add child action appears here and in header

Access:

- role badge
- status badge
- ban state
- ban reason
- ban expiration
- edit access
- ban/unban

### Family Management

Add routes:

```txt
/families
/families/:familyId
```

Feature folder:

```txt
apps/admin/src/features/families/
```

Server APIs:

```txt
GET /v1/admin/families
GET /v1/admin/families/:familyId
POST /v1/admin/families
PATCH /v1/admin/families/:familyId
POST /v1/admin/families/:familyId/members
POST /v1/admin/families/:familyId/admin
POST /v1/admin/families/:familyId/join-codes
POST /v1/admin/families/:familyId/join-codes/:joinCodeId/revoke
```

Types:

```ts
export type AdminUserSummaryDto = {
  id: string;
  displayName: string;
  phoneNumber: string;
  email: string | null;
  avatarUrl: string | null;
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

export type AdminFamilyMemberDto = {
  id: string;
  userId: string;
  role: "admin" | "member";
  createdAt: string;
  user: AdminUserSummaryDto;
};

export type AdminFamilyJoinCodeDto = {
  id: string;
  organizationId: string;
  phoneNumber: string;
  token: string | null;
  joinUrl: string | null;
  role: "member";
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type AdminFamilyDetailDto = AdminFamilyListItemDto & {
  members: AdminFamilyMemberDto[];
  children: AdminChildListItemDto[];
  joinCodes: AdminFamilyJoinCodeDto[];
};

export type AdminCreateFamilyInput = {
  familyName: string;
  adminUserId: string;
};

export type AdminUpdateFamilyInput = {
  familyName?: string;
  logo?: string | null;
};

export type AdminAddFamilyMemberInput = {
  userId: string;
};

export type AdminTransferFamilyAdminInput = {
  userId: string;
};

export type AdminCreateFamilyJoinCodeInput = {
  phoneNumber: string;
  expiresAt?: string | null;
};
```

Rules:

- One admin per family.
- Adding existing user adds member only.
- User must not already belong to another family.
- Transfer admin is transactional:
  - selected user must already be family member
  - current admin becomes member
  - selected member becomes admin
- Join code QR payload is `joinUrl`.
- Family QR files are generated client-side like device QR files.

Family list columns:

- Family
- Admin
- Members
- Children
- Active join codes
- Created
- Actions

Family list filters:

- search family name/slug/admin phone/admin name
- has children
- has active join code

Family detail tabs:

- Details
- Members
- Children
- Join codes

Details:

- family identity
- admin relationship
- counts
- timestamps

Members:

- members table
- user relationship preview/click
- role badge
- transfer admin dropdown/action
- add existing user dialog

Children:

- children list
- child/device relationships previewable/clickable

Join codes:

- active/revoked/consumed join codes
- create join code
- revoke join code
- QR preview/download
- copy join URL

## Phase 3: Device, Child, Telemetry, Maps, And Activity Analytics

### Google Maps

Add admin dependency:

```txt
@react-google-maps/api
```

Environment:

```env
VITE_GOOGLE_MAPS_API_KEY=
```

Create:

```txt
apps/admin/src/features/admin/components/google-map-panel.tsx
```

Props:

```ts
type GoogleMapPanelProps = {
  center: { lat: number; lng: number } | null;
  markers?: Array<{
    id: string;
    lat: number;
    lng: number;
    label?: string;
  }>;
  polylines?: Array<{
    id: string;
    points: Array<{ lat: number; lng: number }>;
  }>;
  circles?: Array<{
    id: string;
    center: { lat: number; lng: number };
    radiusMeters: number;
  }>;
  height?: number;
};
```

Behavior:

- If API key missing, show coordinate fallback.
- If center missing, show `No location available`.
- Use stable height.
- Support marker, polyline, and circle overlays.
- Do not block page rendering while map library loads.

### Device Detail Tabs

Update `/devices/:deviceId`.

Tabs:

1. Details
2. Live telemetry
3. Past telemetry

#### Details Tab

Layout:

- left column: identity and status
- middle column: active binding and reservation
- right column: QR tools and actions

Fields:

- hardware ID with copy
- device ID with copy
- display name
- platform badge
- status badge
- last seen formatted
- created/updated formatted
- reservation user/org/expiry
- active child relationship

If bound:

- show active child relationship next to binding state
- child relationship is previewable on hover and navigates on click

If unbound:

- show clear `Unbound` state
- show `Bind to child` action

#### Live Telemetry Tab

Add admin API:

```txt
GET /v1/admin/devices/:deviceId/live
```

Response:

```ts
export type AdminDeviceLiveTelemetryDto = {
  device: AdminDeviceDto;
  child: AdminChildListItemDto | null;
  location: {
    latitude: number | null;
    longitude: number | null;
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
  };
};
```

UI:

- Desktop: metric panel left, map right.
- Mobile: map first, metrics below.
- Metric rows use icons:
  - `MapPin` for coordinates/location
  - `Battery` for battery
  - `Signal` for signal
  - `Satellite` if available, otherwise `Radio`
  - `Footprints` or `Activity` for steps
  - `Clock` for last seen
  - `Wifi` / `WifiOff` for device state
- Show badges for device state and tracking state.
- Show bound child as previewable/clickable relationship.

#### Past Telemetry Tab

Add admin API:

```txt
GET /v1/admin/devices/:deviceId/location-events
```

Query:

```ts
page
pageSize
startDate?
endDate?
```

Response:

```ts
export type AdminLocationEventDto = {
  id: string;
  deviceId: string;
  childId: string;
  child: AdminChildListItemDto | null;
  latitude: number;
  longitude: number;
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

export type AdminLocationEventListResponseDto =
  PaginatedResponse<AdminLocationEventDto>;
```

UI table columns:

- Occurred
- Child
- Coordinates
- Location
- Accuracy
- Battery
- Signal
- Satellites
- Steps
- State
- Ingested

Filters:

- date range
- device state
- child if historical multiple children exist

Coordinates:

- copyable
- clicking coordinates centers map if map is shown later in this tab

### Child Detail Tabs

Update `/children/:childId`.

Tabs:

1. Details
2. Activity and analytics
3. Location history

#### Details Tab

Layout:

- left: child profile
- center: relationships
- right: tracking summary

Show:

- child name
- initials/avatar
- school
- gender
- DOB formatted if available
- lifecycle badge
- parent user relationship
- active device relationship with copyable hardware ID
- tracking badge
- telemetry badge
- latest location label
- battery/signal/satellite values
- active plan summary
- geofence summary if configured
- timestamps

The active device relationship should replace vague telemetry/offline wording. If no device exists, show `No active device` and a bind action.

#### Activity And Analytics Tab

Add admin endpoint:

```txt
GET /v1/admin/children/:childId/activity
```

Query:

```ts
period: "day" | "week" | "month" | "year"
startDate
endDate
timezone
```

Response:

- Reuse `ChildActivityResponseDto`.

UI:

- date range picker
- period segmented control
- summary metric cards:
  - total steps
  - active time
  - calories
  - peak hour
  - average steps/day
- charts:
  - series line/bar chart for selected range
  - hourly rhythm chart
- table:
  - hourly step counts
  - bucket start
  - steps
  - active minutes
  - calories if available/derived
- sortable by bucket start and step count.

#### Location History Tab

Admin APIs:

```txt
GET /v1/admin/children/:childId/location-events
GET /v1/admin/children/:childId/trail
```

UI:

- map with trail
- location event list/table
- device relationship in rows
- date range filter
- geometry mode filter if road snapping is available

## Phase 4: Geofences, Breaches, Notifications, And Admin Realtime

### Admin Geofence Acknowledgment Table

Add DB table:

```txt
admin_geofence_event_acknowledgments
```

Columns:

- id
- geofenceEventId
- acknowledgedByUserId
- acknowledgedAt
- note nullable
- createdAt

Constraints:

- unique `geofenceEventId`
- FK `geofenceEventId` -> `geofence_events.id`
- FK `acknowledgedByUserId` -> `users.id`

Meaning:

- One global acknowledgment per breached event.
- One admin acknowledgment clears the event from global unacknowledged count.

### Admin Geofence APIs

Routes:

```txt
GET /v1/admin/geofences
GET /v1/admin/geofences/:geofenceId
GET /v1/admin/geofences/:geofenceId/events
GET /v1/admin/geofence-breaches
POST /v1/admin/geofence-breaches/:eventId/ack
POST /v1/admin/geofence-breaches/ack
GET /v1/admin/geofence-breaches/counts
```

List query:

```ts
page
pageSize
search
status?: "unset" | "enabled" | "disabled"
containmentState?: "unknown" | "inside" | "outside"
breachState?: "clear" | "breached"
childId?
familyId?
sort?
dir?
```

Types:

```ts
export type AdminGeofenceListItemDto = {
  id: string;
  child: AdminChildListItemDto;
  activeDevice: AdminDeviceDto | null;
  family: AdminFamilyListItemDto;
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

export type AdminGeofenceDetailDto = AdminGeofenceListItemDto & {
  generation: number;
  candidateState: "unknown" | "inside" | "outside";
  candidateSampleCount: number;
  recentEvents: AdminGeofenceEventDto[];
};

export type AdminGeofenceEventDto = {
  id: string;
  geofenceId: string;
  child: AdminChildListItemDto;
  device: AdminDeviceDto | null;
  family: AdminFamilyListItemDto;
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

export type AdminAckGeofenceBreachInput = {
  note?: string | null;
};

export type AdminBulkAckGeofenceBreachesInput = {
  eventIds: string[];
  note?: string | null;
};

export type AdminGeofenceBreachCountsDto = {
  unacknowledged: number;
  acknowledgedToday: number;
  breachedToday: number;
};
```

### Geofence List Page

Route:

```txt
/geofences
```

Tabs:

1. Geofences
2. Breaches

#### Geofences Tab

Table columns:

- Child
- Device
- Family
- Status
- Containment
- Live latitude
- Live longitude
- Distance
- Radius
- Last evaluated
- Breach state
- Actions

Filters:

- search child/family/device
- status
- containment
- breach state

Realtime fields:

- latitude
- longitude
- containment
- breach count

These update via Socket.IO event invalidation/refetch.

Relationships:

- child preview/click
- device preview/click
- family preview/click
- geofence row click opens `/geofences/:geofenceId`

#### Breaches Tab

Purpose:

- Dedicated global operations queue for geofence breaches.

Table columns:

- Occurred
- Child
- Device
- Geofence
- Family
- Coordinates
- Distance
- Radius
- Ack state
- Acknowledged by
- Actions

Filters:

- unacknowledged only
- acknowledged
- child
- device
- family
- date range

Top action:

- `Acknowledge selected`
- disabled unless selected rows include unacknowledged breaches

Row action:

- icon-only acknowledge button
- use `Check` or `CheckCircle`
- accessible label: `Acknowledge breach`
- no visible text

### Geofence Detail Page

Route:

```txt
/geofences/:geofenceId
```

Tabs:

1. Details
2. Live and past events
3. Breaches

#### Details Tab

Show:

- geofence ID with copy
- child relationship
- active device relationship
- family relationship
- status badge
- containment badge
- center coordinates
- latest child coordinates
- radius
- distance from center
- breached/reentered/evaluated timestamps
- map with center circle and latest point

#### Live And Past Events Tab

Show:

- current containment state
- event timeline/table
- map markers for event points
- filters by event type/date

#### Breaches Tab

Show:

- only breached events for this geofence
- ack state
- acknowledge selected
- row icon-only acknowledge action

### Geofence Nav Badge

Sidebar `Geofences` item should show badge:

- destructive badge when `unacknowledged > 0`
- muted/secondary indicator if `unacknowledged === 0` but recent acknowledged breaches exist
- no badge when no relevant breaches exist

Badge value:

- global unacknowledged breach count

### Admin Realtime With Socket.IO

Add dependencies:

Server:

```txt
socket.io
```

Admin:

```txt
socket.io-client
```

Namespace:

```txt
/admin/realtime
```

Handshake authentication:

- Read Better Auth session from cookies/headers.
- Resolve via `auth.api.getSession`.
- Require `session.user.role === "admin"`.
- Reject missing sessions.
- Reject non-admin sessions.
- Do not trust client-supplied user IDs or roles.

Events:

```ts
type AdminRealtimeEvent =
  | { type: "admin:child.updated"; data: { childId: string; reason: string } }
  | { type: "admin:device.telemetry.changed"; data: { deviceId: string; childId: string | null; reason: string } }
  | { type: "admin:geofence.changed"; data: { geofenceId: string; childId: string; reason: string } }
  | { type: "admin:geofence.breach.created"; data: { geofenceId: string; geofenceEventId: string; childId: string; reason: string } }
  | { type: "admin:geofence.breach.acknowledged"; data: { geofenceId: string; geofenceEventId: string; reason: string } }
  | { type: "admin:family.changed"; data: { familyId: string; reason: string } };
```

Client hook:

```txt
apps/admin/src/features/admin/realtime/use-admin-realtime.ts
```

Behavior:

- Connect once after confirmed admin session.
- Disconnect on sign-out.
- Invalidate targeted React Query keys.
- Show toast only for `admin:geofence.breach.created`.
- Do not toast every telemetry update.

Invalidation:

- `admin:child.updated`
  - children list/detail
  - users list/detail if parent known
  - child activity/location queries
- `admin:device.telemetry.changed`
  - devices list/detail/live/location events
  - children list/detail if child known
  - maps/trails
- `admin:geofence.changed`
  - geofences list/detail/events
  - child detail if child known
- `admin:geofence.breach.created`
  - geofence breaches list
  - geofence counts
  - geofence detail
  - nav badge
- `admin:geofence.breach.acknowledged`
  - geofence breaches list
  - counts
  - nav badge
- `admin:family.changed`
  - families list/detail
  - users list/detail
  - children list/detail

## Shared Admin API Client Additions

Add functions to:

```txt
apps/admin/src/lib/api-client.ts
```

Functions:

```ts
createAdminChildForUser(userId, input)

listAdminFamilies(query)
getAdminFamily(familyId)
createAdminFamily(input)
updateAdminFamily(familyId, input)
addAdminFamilyMember(familyId, input)
transferAdminFamilyAdmin(familyId, input)
createAdminFamilyJoinCode(familyId, input)
revokeAdminFamilyJoinCode(familyId, joinCodeId)

getAdminDeviceLiveTelemetry(deviceId)
listAdminDeviceLocationEvents(deviceId, query)

getAdminChildActivity(childId, query)
listAdminChildLocationEvents(childId, query)
getAdminChildTrail(childId, query)

listAdminGeofences(query)
getAdminGeofence(geofenceId)
listAdminGeofenceEvents(geofenceId, query)
listAdminGeofenceBreaches(query)
ackAdminGeofenceBreach(eventId, input)
ackAdminGeofenceBreaches(input)
getAdminGeofenceBreachCounts()
```

All calls keep `credentials: "include"`.

## Query Keys

Extend:

```txt
apps/admin/src/features/admin/query-keys.ts
```

Add:

```ts
families: {
  list(query)
  detail(familyId)
}
telemetry: {
  deviceLive(deviceId)
  deviceLocationEvents(deviceId, query)
  childLocationEvents(childId, query)
  childTrail(childId, query)
}
activity: {
  child(childId, query)
}
geofences: {
  list(query)
  detail(geofenceId)
  events(geofenceId, query)
}
geofenceBreaches: {
  list(query)
  counts()
}
```

## Testing Plan

### Server Tests

Add or update tests for:

- admin create-child:
  - rejects user without family
  - requires device
  - rejects blocked device
  - rejects bound device
  - creates child under user family
  - binds selected device transactionally
- admin families:
  - paginated list
  - detail includes members/children/join codes
  - add existing user as member
  - rejects user already in family
  - transfer admin demotes previous admin
  - create/revoke join code
- admin device telemetry:
  - live telemetry for bound device
  - live telemetry for unbound device
  - location event pagination/date filters
- admin child activity:
  - returns existing activity response shape
  - validates date ranges
- geofences:
  - list filters status/containment/breach
  - detail returns relationships
  - events pagination/filtering
  - breach list includes ack state
  - single ack creates global ack
  - bulk ack skips already acknowledged events
  - counts return global unacknowledged total
- Socket.IO admin auth:
  - rejects anonymous
  - rejects non-admin
  - accepts admin
  - emits minimal payloads only

### Admin Tests

Add or update tests for:

- date utility:
  - `17 Jun 26`
  - null fallback
  - invalid date
- enum badges:
  - renders expected labels
  - applies alert/destructive variants for risk states
- copyable ID:
  - copies value
  - accessible label present
- preview links:
  - hover opens preview
  - click navigates directly
  - no `Open record` button
  - family/geofence preview support
- user detail:
  - blocks add child when no family
  - requires device for add child
  - submits typed add-child payload
- family pages:
  - list renders admin/member/child counts
  - add member calls API
  - transfer admin calls API
  - join QR payload equals join URL
- device detail:
  - tabs render
  - active child relationship appears beside binding
  - live telemetry renders metric panel
  - Google Map fallback works without key
  - past telemetry table renders location events
- child detail:
  - direct device relationship is previewable/clickable
  - activity filters call correct query
  - metric cards render
- geofence pages:
  - geofence table renders realtime columns
  - breach table renders ack state
  - row icon-only ack button works
  - bulk ack works
  - nav badge reflects count
- admin realtime:
  - connects after admin session
  - disconnects on sign-out
  - invalidates expected query keys
  - breach event shows toast

## Verification Commands

Run after every phase:

```sh
pnpm --filter @stepwhere/server typecheck
pnpm --filter @stepwhere/server test
pnpm --filter shadcn-admin lint
pnpm --filter shadcn-admin test
pnpm --filter shadcn-admin build
```

Manual verification after full implementation:

1. Sign in as admin.
2. Confirm sidebar only shows Dashboard, Apps, Users, Children, Devices, Families, Geofences.
3. Confirm account/appearance/notification settings remain reachable from profile/top-right controls.
4. Confirm all dates use `17 Jun 26` style.
5. Confirm enum fields render as badges.
6. Confirm device IDs/hardware IDs are copyable.
7. Confirm relationship previews open on hover and clicking navigates directly.
8. Add child from user detail for a user with family and selected unbound device.
9. Confirm add-child is blocked for a user without family.
10. Create/link family member.
11. Transfer family admin and confirm previous admin demoted.
12. Generate family join QR and verify payload is join URL.
13. Open device details/live telemetry/past telemetry tabs.
14. Confirm Google Map renders or shows fallback if key is missing.
15. Open child activity analytics and adjust date range.
16. Open geofence list and breach tab.
17. Acknowledge one breach and confirm nav badge updates.
18. Confirm non-admin cannot connect to admin Socket.IO namespace.

## Rollout Notes

- Build in phases and keep each phase independently releasable.
- Avoid changing mobile API contracts.
- Admin API contracts may evolve because admin frontend is updated in the same work.
- Add migrations only in phases that need schema changes:
  - admin geofence acknowledgments
  - possible Socket.IO infrastructure config if needed
- Keep production SMS/auth behavior untouched.
- Do not add map rendering without a graceful no-key fallback.
- Do not emit full telemetry payloads over Socket.IO; emit minimal event identifiers and refetch through authenticated APIs.

## Explicit Assumptions

- Admin users are trusted operators but still need server-side authorization on every route.
- Current Better Auth admin role remains source of admin access.
- Current one-family-per-user model remains in place.
- Current child/device binding model remains one active child per device and one active device per child.
- Google Maps key will be provided through `VITE_GOOGLE_MAPS_API_KEY`.
- Geofence acknowledgement state is global across admins.
- Missing child photo uses initials fallback only.
- Template removal does not remove required auth/error/account/appearance/notification flows.
