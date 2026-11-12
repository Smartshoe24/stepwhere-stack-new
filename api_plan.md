# Stepwhere API Plan

## Purpose

This document defines the implementation plan for the new Stepwhere backend to be built in this repo under `apps/server`.

This is a greenfield backend rewrite. It does not preserve legacy API compatibility. It preserves business capabilities from the legacy system while fixing the structural, data-model, auth, and realtime issues found in the original Laravel + Express implementation.

## Summary

Build a new backend using:

- Hono
- Node.js
- Postgres
- Drizzle ORM
- Better Auth
- WebSockets for realtime live tracking

The new backend will become the single system of record for:

- parent authentication
- child management
- device registration and device binding
- location tracking and history
- realtime child updates
- share links
- plans and subscriptions
- notifications
- CMS pages
- admin operations

This rewrite replaces:

- Laravel API
- Laravel admin business backend
- separate Express realtime relay

## Goals

### Primary goals

- preserve the legacy business logic that matters
- remove legacy API design constraints
- normalize the schema and type system
- build a backend that fits the current monorepo
- make the mobile app consume real APIs instead of local mock data
- include realtime tracking in phase 1

### Non-goals

- preserving Laravel route shapes
- preserving Passport tokens
- preserving legacy body-level `status_code` response conventions
- porting broken behavior unchanged

## Current Repo Fit

Existing workspace facts:

- `apps/server` already exists and is a minimal Hono server
- `apps/mobile` already exists and currently uses local mock data
- `packages/types` already exists and should become the shared API contract package

Primary implementation locations:

- server runtime: `apps/server`
- shared DTOs: `packages/types`

## Architectural Direction

## 1. Single backend service

Use one Hono service as the only backend runtime.

This new service will own:

- HTTP APIs
- auth/session handling
- device telemetry ingestion
- child state aggregation
- admin APIs
- public share-link APIs
- websocket connections and fanout

We will not keep a separate Node relay service.

## 2. New app-facing API

Design a clean `/v1` API specifically for the new app and future admin surfaces.

Business logic is preserved.
Route compatibility is not.

## 3. Typed schema and contracts

Use:

- Postgres as the database
- Drizzle for schema and migrations
- `packages/types` for shared response/request types

No legacy string-typed dates, string-typed coordinates, or pseudo-boolean string flags in the new persistence model.

## 4. Business logic in service layer

Route handlers must stay thin.

Business logic belongs in service modules so it can be reused across:

- HTTP routes
- websocket flows
- admin endpoints
- future jobs or background tasks

## 5. Realtime in phase 1

Realtime is part of the initial backend build.

Location ingestion should:

1. write the event
2. update the child snapshot
3. emit the new household state to subscribed parent clients

## Product Logic To Preserve From Legacy

The rewrite must preserve these behaviors:

### Parent and child ownership

- a parent user can manage multiple children
- each child belongs to exactly one parent
- parent-facing child reads and writes are scoped to the authenticated parent

### Device-linked child tracking

- children are associated with known devices
- location events are produced by devices
- a parent sees the latest known state for each child
- location history remains queryable

### Share-link flow

- a parent can generate a time-bound public share link for a child
- the public link should expose current location only while the session is valid

### Plan assignment

- a child can have an assigned plan/subscription
- plans can be managed operationally by admin
- active plan details should be visible to parent-facing APIs

### Notifications and CMS

- active notifications are retrievable by app users
- CMS pages are retrievable by slug/list
- admin must be able to manage both

### Admin operational control

The new backend must provide APIs for:

- users
- devices
- children
- plans
- subscriptions
- notifications
- CMS pages

## Legacy Problems To Fix

The rewrite must explicitly fix these issues:

### Authentication issues

- hardcoded OTP
- awkward multi-step auth flow
- weak verification model
- no proper throttling

### Data integrity issues

- string dates and timestamps
- string latitude/longitude
- weak uniqueness guarantees
- plan-child relation not fully enforced
- child-device relation based on unsafe string matching

### API design issues

- ambiguous route methods
- inconsistent status handling
- JSON body pseudo-statuses
- misleading success/failure messages

### Realtime issues

- separate relay service
- trust based on loosely structured payloads
- no clean subscription model

### Security issues

- predictable share-link token shape
- loose device identity model
- weak admin authorization boundaries

## Target Stack

### Runtime

- Hono
- Node.js

### Database

- Postgres

### ORM and migrations

- Drizzle ORM
- Drizzle migrations

### Validation

- Zod

### Authentication

- Better Auth
- custom phone OTP verification workflow on top of Better Auth-supported account/session primitives

### Realtime

- WebSockets served from the Hono backend

### Shared typing

- `packages/types`

## Recommended Server Structure

Inside `apps/server/src`:

- `app.ts`
- `index.ts`
- `config/env.ts`
- `config/constants.ts`
- `db/client.ts`
- `db/schema/users.ts`
- `db/schema/children.ts`
- `db/schema/devices.ts`
- `db/schema/telemetry.ts`
- `db/schema/plans.ts`
- `db/schema/content.ts`
- `db/schema/auth.ts`
- `db/migrations/*`
- `lib/errors.ts`
- `lib/http.ts`
- `lib/pagination.ts`
- `lib/validation.ts`
- `lib/time.ts`
- `lib/crypto.ts`
- `middlewares/auth.ts`
- `middlewares/admin.ts`
- `middlewares/request-id.ts`
- `middlewares/error-handler.ts`
- `modules/auth/*`
- `modules/users/*`
- `modules/children/*`
- `modules/devices/*`
- `modules/telemetry/*`
- `modules/realtime/*`
- `modules/shares/*`
- `modules/plans/*`
- `modules/notifications/*`
- `modules/cms/*`
- `modules/admin/*`

Inside `packages/types/src`:

- `common.ts`
- `auth.ts`
- `children.ts`
- `telemetry.ts`
- `plans.ts`
- `notifications.ts`
- `cms.ts`
- `admin.ts`
- `index.ts`

## Target Database Model

This is the intended new normalized schema for the Hono backend.

## Users and auth

### `users`

Fields:

- `id` uuid primary key
- `phone_number` text unique not null
- `email` text unique nullable
- `status` enum: `pending_verification | active | suspended`
- `display_name` text nullable
- `avatar_url` text nullable
- `fcm_token` text nullable
- `last_seen_at` timestamptz nullable
- `created_at`
- `updated_at`

### `phone_verifications`

Fields:

- `id` uuid primary key
- `phone_number` text not null
- `otp_hash` text not null
- `purpose` enum: `sign_in | sign_up | verify_phone | reset`
- `expires_at` timestamptz not null
- `consumed_at` timestamptz nullable
- `attempt_count` integer default 0 not null
- `created_at`
- `updated_at`

### Better Auth support tables

Use whatever adapter tables Better Auth requires for:

- accounts
- sessions
- verification/session state

These should be implemented cleanly rather than forced into legacy Passport structure.

## Children and devices

### `children`

Fields:

- `id` uuid primary key
- `parent_user_id` uuid not null
- `name` text not null
- `avatar_url` text nullable
- `gender` text nullable
- `date_of_birth` date nullable
- `status` enum: `active | archived`
- `created_at`
- `updated_at`

### `devices`

Fields:

- `id` uuid primary key
- `hardware_identifier` text unique not null
- `display_name` text nullable
- `platform` enum: `android | ios | embedded | unknown`
- `status` enum: `active | inactive | blocked`
- `created_at`
- `updated_at`

### `child_device_bindings`

Fields:

- `id` uuid primary key
- `child_id` uuid not null
- `device_id` uuid not null
- `bound_at` timestamptz not null
- `unbound_at` timestamptz nullable

Constraints:

- one active binding per child
- one active binding per device

## Tracking and current state

### `location_events`

Fields:

- `id` uuid primary key
- `child_id` uuid not null
- `device_id` uuid not null
- `latitude` numeric(9, 6) not null
- `longitude` numeric(9, 6) not null
- `location_label` text nullable
- `accuracy_meters` numeric nullable
- `battery_percent` integer nullable
- `signal_strength` smallint nullable
- `occurred_at` timestamptz not null
- `ingested_at` timestamptz not null default now

### `child_status_snapshots`

Fields:

- `child_id` uuid primary key
- `last_location_event_id` uuid nullable
- `last_latitude` numeric(9, 6) nullable
- `last_longitude` numeric(9, 6) nullable
- `last_location_label` text nullable
- `last_battery_percent` integer nullable
- `last_signal_strength` smallint nullable
- `status` enum: `safe | transit | alert | offline`
- `status_label` text nullable
- `last_seen_at` timestamptz nullable
- `updated_at` timestamptz not null

### `step_counts_daily`

Fields:

- `id` uuid primary key
- `child_id` uuid not null
- `device_id` uuid not null
- `event_date` date not null
- `step_count` integer not null
- `created_at`
- `updated_at`

## Shares

### `child_share_links`

Fields:

- `id` uuid primary key
- `child_id` uuid not null
- `token` text unique not null
- `starts_at` timestamptz not null
- `expires_at` timestamptz not null
- `status` enum: `active | expired | revoked`
- `created_by_user_id` uuid not null
- `created_at`
- `updated_at`

## Plans and subscriptions

### `plans`

Fields:

- `id` uuid primary key
- `title` text not null
- `description` text nullable
- `duration_months` integer not null
- `amount_minor` integer nullable
- `currency_code` text nullable
- `status` enum: `active | inactive`
- `created_at`
- `updated_at`

### `child_plan_subscriptions`

Fields:

- `id` uuid primary key
- `child_id` uuid not null
- `plan_id` uuid not null
- `source` enum: `admin | purchase | promo`
- `external_order_id` text nullable
- `external_purchase_id` text nullable
- `status` enum: `active | expired | cancelled`
- `starts_at` timestamptz not null
- `ends_at` timestamptz not null
- `created_at`
- `updated_at`

Constraints:

- one active subscription per child

## Content and messaging

### `notifications`

Fields:

- `id` uuid primary key
- `title` text not null
- `body` text not null
- `image_url` text nullable
- `target_role` text nullable
- `target_user_id` uuid nullable
- `status` enum: `draft | active | archived`
- `published_at` timestamptz nullable
- `created_at`
- `updated_at`

### `cms_pages`

Fields:

- `id` uuid primary key
- `slug` text unique not null
- `title` text not null
- `body` text not null
- `status` enum: `draft | active | archived`
- `created_at`
- `updated_at`

### `feedback_submissions`

Fields:

- `id` uuid primary key
- `name` text nullable
- `email` text nullable
- `phone_number` text nullable
- `message` text not null
- `created_at`
- `updated_at`

## Core API Surface

All new APIs live under `/v1`.

## Auth APIs

### `POST /v1/auth/request-otp`

Purpose:

- start phone authentication

### `POST /v1/auth/verify-otp`

Purpose:

- verify OTP and issue authenticated session/token

### `POST /v1/auth/sign-out`

Purpose:

- revoke session for current client

### `GET /v1/auth/session`

Purpose:

- return current auth/session state

## Parent/user APIs

### `GET /v1/me`

Purpose:

- current parent profile

### `PATCH /v1/me`

Purpose:

- update profile

### `PUT /v1/me/push-token`

Purpose:

- store/update FCM token

## Child APIs

### `GET /v1/home`

Purpose:

- aggregate home/dashboard data for the app
- this replaces the legacy split between latest child status and child plan enrichment

### `GET /v1/children`

Purpose:

- list children for current parent

### `POST /v1/children`

Purpose:

- create child

### `GET /v1/children/:childId`

Purpose:

- child detail

### `PATCH /v1/children/:childId`

Purpose:

- update child

### `DELETE /v1/children/:childId`

Purpose:

- archive or remove child

## Tracking APIs

### `GET /v1/children/:childId/live`

Purpose:

- return current child live snapshot

### `GET /v1/children/:childId/history`

Purpose:

- return paginated location history

### `POST /v1/telemetry/location`

Purpose:

- ingest location event from device

### `POST /v1/telemetry/steps`

Purpose:

- ingest daily or periodic step data

## Share APIs

### `POST /v1/children/:childId/share-links`

Purpose:

- create expiring public share link

### `GET /v1/share-links/:token`

Purpose:

- retrieve current shareable public child location view

### `DELETE /v1/share-links/:token`

Purpose:

- revoke share link

## Plan APIs

### `GET /v1/plans`

Purpose:

- list active plans

### `GET /v1/children/:childId/subscription`

Purpose:

- return active subscription for a child

## Notification and CMS APIs

### `GET /v1/notifications`

Purpose:

- return active notifications for app use

### `GET /v1/cms-pages`

Purpose:

- list active CMS pages

### `GET /v1/cms-pages/:slug`

Purpose:

- fetch page by slug

### `POST /v1/feedback`

Purpose:

- submit contact/feedback data

## Device APIs

### `POST /v1/device-auth/register`

Purpose:

- register or provision a device credential flow

### `POST /v1/device-auth/rotate-token`

Purpose:

- rotate device credential/token

## Realtime API

### `GET /v1/realtime/ws`

Purpose:

- websocket endpoint for authenticated parent clients

Behavior:

- connect using authenticated parent session
- subscribe to that parent household stream
- receive live child updates after telemetry writes

## Admin API Surface

The backend includes admin-capable APIs even if an admin UI is built later.

## User and child administration

- `GET /v1/admin/users`
- `GET /v1/admin/users/:userId`
- `GET /v1/admin/children`
- `GET /v1/admin/children/:childId`

## Device administration

- `GET /v1/admin/devices`
- `POST /v1/admin/devices`
- `PATCH /v1/admin/devices/:deviceId`
- `POST /v1/admin/devices/:deviceId/bind`
- `POST /v1/admin/devices/:deviceId/unbind`

## Plan administration

- `GET /v1/admin/plans`
- `POST /v1/admin/plans`
- `PATCH /v1/admin/plans/:planId`
- `POST /v1/admin/children/:childId/subscriptions`
- `PATCH /v1/admin/subscriptions/:subscriptionId`
- `DELETE /v1/admin/subscriptions/:subscriptionId`

## CMS and notification administration

- `GET /v1/admin/cms-pages`
- `POST /v1/admin/cms-pages`
- `PATCH /v1/admin/cms-pages/:pageId`
- `GET /v1/admin/notifications`
- `POST /v1/admin/notifications`
- `PATCH /v1/admin/notifications/:notificationId`

## Shared DTO Plan

Use `packages/types` to define the backend contracts consumed by the mobile app.

## Child summary DTO

Target shape:

- `id`
- `name`
- `avatarUrl`
- `status`
- `statusLabel`
- `locationLabel`
- `lastUpdatedAt`
- `etaLabel`
- `batteryPercent`
- `batteryText`
- `signalStrength`
- `latitude`
- `longitude`
- `activePlan`
- `deviceSummary`

This should replace the current local mock `Child` shape in `apps/mobile/src/data/children.ts`.

## Location history DTO

Target shape:

- `id`
- `childId`
- `latitude`
- `longitude`
- `locationLabel`
- `accuracyMeters`
- `batteryPercent`
- `signalStrength`
- `occurredAt`

## Share DTO

Target shape:

- `token`
- `shareUrl`
- `startsAt`
- `expiresAt`
- `status`

## API error shape

Use a clean error object:

- `code`
- `message`
- `details` optional

Do not return legacy-style body `status_code`.

## Business Modules

## `modules/auth`

Responsibilities:

- OTP request
- OTP verify
- session creation
- session lookup
- sign-out
- auth middleware integration

## `modules/users`

Responsibilities:

- current user profile
- update current user
- FCM token update
- admin user lookup/listing

## `modules/children`

Responsibilities:

- child CRUD
- ownership enforcement
- home/dashboard aggregation
- app-facing child DTO mapping

## `modules/devices`

Responsibilities:

- device registration
- active binding management
- admin device control
- device auth credentials

## `modules/telemetry`

Responsibilities:

- location event ingestion
- step ingestion
- location history
- snapshot updates
- publish realtime events

## `modules/realtime`

Responsibilities:

- websocket auth handshake
- connection registry
- household stream subscription
- live payload broadcast

## `modules/shares`

Responsibilities:

- create share token
- validate public token
- revoke token
- return public child live view

## `modules/plans`

Responsibilities:

- plan catalog
- child active subscription resolution
- admin subscription assignment/removal
- expiry calculations

## `modules/notifications`

Responsibilities:

- active notification reads
- admin create/update/publish flows

## `modules/cms`

Responsibilities:

- public page reads
- admin page CRUD

## `modules/admin`

Responsibilities:

- admin role enforcement
- operational views over users/children/devices/plans/content

## Authentication Plan

## User auth

Use a phone-first flow.

Flow:

1. parent submits phone number
2. backend generates OTP
3. backend stores hashed OTP with expiry and attempt limits
4. parent submits OTP
5. backend verifies and creates user if needed
6. backend creates authenticated session/token

Rules:

- no hardcoded OTP
- rate limit OTP requests
- rate limit OTP verification attempts
- expire OTP after short TTL
- optional email stored as profile/contact info

## Device auth

Device telemetry must be authenticated separately from parent auth.

Flow:

1. device is registered and activated
2. device receives backend-issued credential/token
3. telemetry requests authenticate using device credential
4. backend resolves active child binding
5. telemetry is accepted only if binding and status checks pass

This replaces legacy trust-by-device-name-string logic.

## Realtime Plan

Use WebSockets directly in the Hono backend.

Flow:

1. parent connects to `/v1/realtime/ws`
2. backend validates auth session
3. backend registers parent connection to household scope
4. telemetry write succeeds
5. snapshot refresh runs
6. updated child/household payload is broadcast to connected parent clients

Suggested realtime events:

- `household.snapshot`
- `child.updated`

Fallback behavior:

- HTTP endpoints remain authoritative
- websocket is additive for live updates

## Mobile Integration Plan

The mobile app currently uses mock data for home/children telemetry.

Backend integration plan:

1. move shared DTOs into `packages/types`
2. replace `apps/mobile/src/data/children.ts` mock usage with `/v1/home`
3. replace activity/log views with `/v1/children/:childId/history`
4. add auth flow
5. add websocket household updates

Priority endpoints for mobile integration:

1. `POST /v1/auth/request-otp`
2. `POST /v1/auth/verify-otp`
3. `GET /v1/home`
4. `GET /v1/children/:childId/history`
5. `GET /v1/me`
6. `GET /v1/notifications`
7. `GET /v1/realtime/ws`

## Migration Strategy

This is a logic migration, not an API compatibility migration.

Implementation order:

1. server foundation and config
2. Postgres and Drizzle setup
3. auth and user model
4. child and device model
5. telemetry ingestion and history
6. child snapshot model
7. realtime websocket layer
8. share-link flow
9. plan/subscription flow
10. CMS and notifications
11. admin APIs
12. mobile integration against real APIs

## Testing Plan

## Unit tests

- OTP issuance and expiry
- OTP verification attempt limits
- device binding validation
- share-link expiry and revocation
- active subscription resolution
- child snapshot derivation
- ownership checks

## Integration tests

- request OTP -> verify OTP -> session established
- create child -> bind device -> ingest location -> home reflects new state
- ingest multiple locations -> history pagination works
- create share link -> public lookup works until expiry
- assign child plan -> active subscription appears in child/home data
- websocket parent client receives update after telemetry ingest
- admin route rejects non-admin user

## Contract tests

- `/v1/home` matches shared child DTO
- `/v1/children/:childId/history` matches shared history DTO
- `/v1/share-links/:token` exposes only public-safe fields

## Failure scenarios

- invalid OTP
- expired OTP
- rate-limited OTP verification
- unregistered device
- inactive or blocked device
- no active child-device binding
- parent accessing another parent’s child
- expired or revoked share token
- double active subscription attempt
- duplicate active device binding attempt

## Acceptance Criteria

This plan is considered fulfilled when the future implementation achieves all of the following:

- `apps/server` becomes a modular Hono backend rather than a stub
- Postgres + Drizzle schema is in place
- Better Auth-backed phone-first login works
- parent-facing home API serves live child summaries
- device telemetry ingestion persists history and refreshes current state
- websocket realtime works in phase 1
- public expiring share links work securely
- plan/subscription logic is available through clean APIs
- admin APIs exist for operational control
- `packages/types` provides shared DTOs for the mobile app

## Assumptions

- backend lives in `apps/server`
- shared contracts live in `packages/types`
- Postgres is the target database
- Drizzle is the target ORM
- Better Auth is the auth library
- realtime is included in phase 1
- legacy API compatibility is not required
- the new backend is for the redesigned app, not for drop-in replacement of Laravel routes
