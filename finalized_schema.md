# Finalized Schema: Legacy Stepwhere Database

## Purpose

This document converts the raw dump in [current_schema.md](/Users/vael/work/repos/stepwhere/current_schema.md) into an application-focused, ORM-ready schema reference for the legacy Stepwhere backend.

This is the schema we should treat as the current source of truth for migration and ORM mapping work.

It is based on the live SQL schema dump, not only the Laravel migrations. That matters because the live schema differs from the repo in several important places.

## Scope

Included here:

- application tables
- auth and authorization tables used by Laravel/Passport/Spatie
- legacy business tables that still exist in the database
- relationship notes
- ORM mapping cautions

Explicitly excluded from ORM planning:

- MySQL internal/system tables such as `db`, `user`, `tables_priv`, `columns_priv`, `general_log`, `slow_log`, `time_zone*`, `engine_cost`, `component`, `plugin`, `procs_priv`, replication tables, and similar server-owned metadata tables

## Source-Of-Truth Notes

The live schema shows several differences from repo migrations and controller assumptions.

Important differences:

- `users.email` is nullable and is not unique at the DB level
- `users` has extra fields:
  - `unique_device_id`
  - `unique_device_model`
- `notifications` has a `course_id` column that was not visible in the earlier migration review
- `device_ids`, `plans`, and `plan_purchases` do exist in the live DB
- several values that should be typed as dates, datetimes, or decimals are stored as `varchar`
- `children.device_id` is not DB-unique, even though application validation tries to keep it unique

## Recommended Reading Order

1. Core child-tracking domain
2. Supporting content and admin domain
3. Auth and authorization infrastructure
4. Legacy residue and mismatches

## ORM Mapping Principles

When mapping these tables into an ORM, preserve the actual database types first. Do not silently “correct” the schema in the first pass.

Use two layers:

- raw persistence models that match the DB exactly
- service/domain normalization on top where the legacy schema is weak

Especially important:

- preserve `varchar` date fields as strings in persistence models unless the migration plan includes DB changes
- preserve nullable fields as nullable
- do not assume uniqueness unless the DB enforces it
- treat missing foreign keys as application-level relationships, not enforced DB constraints

## Domain Overview

### Core child-tracking domain

- `users`
- `children`
- `location_tracks`
- `child_location_shares`
- `device_ids`
- `plans`
- `plan_purchases`
- `step_count_master`

### Content and messaging domain

- `cms`
- `notifications`
- `feed_backs`
- `banners`
- `categories`
- `products`

### Auth and access-control domain

- `oauth_access_tokens`
- `oauth_auth_codes`
- `oauth_clients`
- `oauth_personal_access_clients`
- `oauth_refresh_tokens`
- `personal_access_tokens`
- `password_resets`
- `failed_jobs`
- `migrations`
- `roles`
- `permissions`
- `model_has_roles`
- `model_has_permissions`
- `role_has_permissions`

### Legacy education/product residue

- `course_assign_users`

### Referenced in code but not present in live schema dump

- `video_courses`
- `videos`
- `assign_videos`
- `course_video_comments`
- `product_assign_users`

These should be treated as code residue unless another schema source proves otherwise.

## Relationship Map

Primary relationships visible in the schema:

- `users.id` -> `children.parent_id`
- `children.id` -> `location_tracks.child_id`
- `children.id` -> `child_location_shares.child_id`
- `plans.id` -> `plan_purchases.plan_id`
- `roles.id` -> `model_has_roles.role_id`
- `roles.id` -> `role_has_permissions.role_id`
- `permissions.id` -> `model_has_permissions.permission_id`
- `permissions.id` -> `role_has_permissions.permission_id`

Application-level relationships used in code but not enforced by DB:

- `children.device_id` -> `device_ids.device`
- `plan_purchases.child_id` -> `children.id`
- `notifications.user_id` -> `users.id` conceptually
- `course_assign_users.user_id` -> `users.id` conceptually

## Table Definitions

## 1. `users`

Purpose:

- stores both parent users and admins
- stores auth credentials, OTP state, FCM token, profile image, and device-binding metadata

Primary key:

- `id` `int unsigned` auto increment

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `slug` | `varchar(255)` | yes |  | derived from mobile in code |
| `name` | `varchar(255)` | yes |  | display name |
| `email` | `varchar(255)` | yes |  | not unique in DB |
| `mobile_number` | `varchar(255)` | no |  | unique in DB |
| `email_verified_at` | `timestamp` | yes |  | standard Laravel field |
| `password` | `varchar(255)` | yes |  | bcrypt hash when set |
| `fcm_token` | `varchar(255)` | yes |  | mobile push token |
| `lat` | `varchar(255)` | yes |  | unused or legacy location cache |
| `long` | `varchar(255)` | yes |  | reserved-word style column name |
| `otp` | `varchar(255)` | yes |  | OTP value |
| `otp_verify` | `varchar(255)` | yes | `'0'` | string flag, not boolean |
| `status` | `enum('active','inactive')` | no | `'inactive'` | user status |
| `image` | `varchar(255)` | yes |  | profile image filename |
| `remember_token` | `varchar(100)` | yes |  | session remember token |
| `unique_device_id` | `varchar(255)` | yes |  | extra live-schema field |
| `unique_device_model` | `varchar(255)` | yes |  | extra live-schema field |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`
- unique: `mobile_number`

Relationships:

- has many `children`
- morph many `roles`
- morph many `permissions`
- has many Passport tokens conceptually

ORM notes:

- keep `email` nullable and non-unique in the ORM schema
- map `long` carefully because some ORMs treat it awkwardly; alias at model layer if needed
- `otp_verify` should remain string in persistence mapping unless schema is changed
- `status` can be represented as enum in ORM

## 2. `children`

Purpose:

- child profiles belonging to a parent user

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `parent_id` | `int unsigned` | no |  | FK to `users.id` |
| `slug` | `varchar(255)` | yes |  | generated from child name |
| `image` | `varchar(255)` | yes |  | child image filename |
| `child_name` | `varchar(255)` | yes |  |  |
| `device_id` | `varchar(255)` | yes |  | device binding, not DB-unique |
| `gender` | `varchar(255)` | yes |  | free-form string |
| `dob` | `varchar(255)` | yes |  | stored as string, not date |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`
- FK: `parent_id` -> `users.id` on delete cascade

Relationships:

- belongs to `users` as parent
- has many `location_tracks`
- has many `child_location_shares`
- has many `plan_purchases` at application level

ORM notes:

- do not add uniqueness to `device_id` at ORM schema level unless the DB is migrated
- `dob` should be kept as string in persistence mapping

## 3. `location_tracks`

Purpose:

- append-only history of child location samples

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `child_id` | `int unsigned` | no |  | FK to `children.id` |
| `slug` | `varchar(255)` | yes |  | generated from `device_name` in code |
| `latitude` | `varchar(255)` | yes |  | stored as string |
| `longitude` | `varchar(255)` | yes |  | stored as string |
| `device_name` | `varchar(255)` | yes |  | incoming device identifier |
| `location` | `varchar(255)` | yes |  | human-readable location string |
| `created_at` | `timestamp` | yes |  | event timestamp |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`
- FK: `child_id` -> `children.id` on delete cascade

Relationships:

- belongs to `children`

ORM notes:

- keep latitude/longitude as strings unless the DB is migrated
- current location in business logic is derived by latest `id` descending

## 4. `child_location_shares`

Purpose:

- temporary public sharing sessions for a child’s location

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `child_id` | `int unsigned` | no |  | FK to `children.id` |
| `slug` | `varchar(255)` | yes |  | public share slug |
| `start_time` | `varchar(255)` | yes |  | datetime stored as string |
| `end_time` | `varchar(255)` | yes |  | datetime stored as string |
| `minutes` | `varchar(255)` | yes |  | share duration stored as string |
| `status` | `varchar(255)` | yes | `'1'` | string flag |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`
- FK: `child_id` -> `children.id` on delete cascade

Relationships:

- belongs to `children`

ORM notes:

- the code behaves as if each child has one active share row, but the DB does not enforce uniqueness on `child_id`
- time fields must remain strings in the raw mapping

## 5. `device_ids`

Purpose:

- registry or whitelist of device identifiers allowed to be attached to children

Primary key:

- `id` `int`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int` | no | auto increment | primary key |
| `device` | `varchar(100)` | no |  | canonical device identifier |
| `status` | `varchar(50)` | no | `'active'` | active/inactive marker |
| `slug` | `varchar(100)` | no |  | generated from device value |
| `created_at` | `timestamp` | no | `CURRENT_TIMESTAMP` |  |
| `updated_at` | `timestamp` | no | `CURRENT_TIMESTAMP` | no explicit `ON UPDATE` in dump |

Constraints and indexes:

- PK: `id`

Relationships:

- referenced from application logic by `children.device_id` -> `device_ids.device`

ORM notes:

- no DB uniqueness is shown for `device`
- if you need referential integrity in the new system, add a proper FK strategy during migration design

## 6. `plans`

Purpose:

- catalog of subscription or plan options that can be attached to a child

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `slug` | `varchar(255)` | yes |  | generated from title |
| `title` | `varchar(255)` | yes |  | plan name |
| `description` | `longtext` | yes |  | plan description |
| `month` | `varchar(255)` | yes |  | duration count stored as string |
| `amount` | `int` | yes |  | plan amount |
| `status` | `varchar(255)` | yes | `'active'` | active/inactive status |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`

Relationships:

- has many `plan_purchases`

ORM notes:

- `month` should stay string in raw mapping even though it behaves numerically in code

## 7. `plan_purchases`

Purpose:

- assigned or purchased plan records for children

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `child_id` | `int unsigned` | yes |  | logical FK to `children.id`, but no DB FK present |
| `plan_id` | `int unsigned` | no |  | FK to `plans.id` |
| `slug` | `varchar(255)` | yes |  | generated from child id in model |
| `amount` | `varchar(255)` | yes |  | stored as string |
| `order_id` | `varchar(255)` | yes |  | may be synthetic `'admin'` |
| `purchase_id` | `varchar(255)` | yes |  | may be synthetic `'admin'` |
| `status` | `enum('0','1')` | no | `'0'` | string enum flag |
| `month` | `varchar(50)` | yes |  | duration snapshot |
| `start_date` | `varchar(50)` | yes |  | date stored as string |
| `end_date` | `varchar(50)` | yes |  | date stored as string |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`
- FK: `plan_id` -> `plans.id` on delete cascade
- index: `child_id`

Relationships:

- belongs to `plans`
- belongs to `children` at application level only

ORM notes:

- do not model `child_id` as required at the DB mapping level
- use caution with amount and date parsing because they are strings
- if your ORM supports relation definitions without DB FKs, define the child relation explicitly

## 8. `notifications`

Purpose:

- notification records exposed in API and used by admin UI

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `course_id` | `int` | no | `0` | legacy coupling to course domain |
| `slug` | `varchar(255)` | yes |  | generated from title |
| `title` | `varchar(255)` | yes |  | notification title |
| `logo` | `varchar(255)` | yes |  | image filename |
| `description` | `longtext` | yes |  | HTML-capable text |
| `user_id` | `int` | no | `0` | target/owner concept, no FK |
| `role` | `varchar(255)` | no | `'user'` | role targeting hint |
| `status` | `enum('active','inactive')` | no | `'active'` | publication status |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`

Relationships:

- optional application-level relation to `users`

ORM notes:

- `course_id` is legacy and should not be dropped from raw mapping
- preserve `status` as enum/string

## 9. `cms`

Purpose:

- CMS content records exposed by API and admin

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `slug` | `longtext` | yes |  | unusually large type for slug |
| `title` | `varchar(255)` | yes |  |  |
| `description` | `longtext` | yes |  | content body |
| `status` | `varchar(255)` | yes | `'active'` | publication state |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`

ORM notes:

- keep `slug` as `longtext` in raw schema even though it should likely be shorter

## 10. `feed_backs`

Purpose:

- contact-us or feedback submissions

Primary key:

- `id` `int unsigned`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int unsigned` | no | auto increment | primary key |
| `slug` | `varchar(255)` | yes |  | likely generated, but not important |
| `name` | `varchar(255)` | yes |  | submitter name |
| `email` | `varchar(50)` | yes |  | submitter email |
| `mobile` | `varchar(15)` | yes |  | submitter phone |
| `message` | `varchar(255)` | yes |  | feedback body |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`

## 11. `step_count_master`

Purpose:

- likely stores step counts by device and date

Primary key:

- `id` `int`

Columns:

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `int` | no | auto increment | primary key |
| `device_id` | `varchar(255)` | yes |  | links by string only |
| `step_count` | `varchar(255)` | yes |  | stored as string |
| `date` | `varchar(255)` | yes |  | stored as string |
| `created_at` | `timestamp` | yes |  |  |
| `updated_at` | `timestamp` | yes |  |  |

Constraints and indexes:

- PK: `id`

ORM notes:

- this table is not surfaced in the reviewed child-tracking controllers, but it is application-owned and should be preserved in mapping

## 12. `banners`

Purpose:

- legacy or admin-managed marketing banners

Primary key:

- `id` `int unsigned`

Columns:

- `id` `int unsigned` PK
- `slug` `longtext` nullable
- `title` `varchar(255)` nullable
- `image` `varchar(255)` nullable
- `status` `varchar(255)` nullable default `'active'`
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

ORM notes:

- keep as simple content/admin table

## 13. `categories`

Purpose:

- legacy categorization table

Primary key:

- `id` `int unsigned`

Columns:

- `id` `int unsigned` PK
- `slug` `longtext` nullable
- `title` `varchar(255)` nullable
- `image` `varchar(255)` nullable
- `status` `varchar(255)` nullable default `'active'`
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

## 14. `products`

Purpose:

- legacy product catalog

Primary key:

- `id` `int unsigned`

Columns:

- `id` `int unsigned` PK
- `slug` `varchar(255)` nullable
- `title` `varchar(255)` nullable
- `description` `longtext` nullable
- `price` `varchar(255)` nullable
- `offer_price` `varchar(255)` nullable
- `image_first` `varchar(255)` nullable
- `image_second` `varchar(255)` nullable
- `image_third` `varchar(255)` nullable
- `image_four` `varchar(255)` nullable
- `image_five` `varchar(255)` nullable
- `link` `longtext` nullable
- `status` `varchar(255)` nullable default `'active'`
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

ORM notes:

- preserve string price fields in raw mapping

## 15. `course_assign_users`

Purpose:

- legacy course-assignment pivot-like table

Primary key:

- `id` `int unsigned`

Columns:

- `id` `int unsigned` PK
- `video_course_id` `int unsigned` not null
- `user_id` `int unsigned` not null
- `slug` `varchar(255)` nullable
- `start_date` `date` nullable
- `end_date` `date` nullable
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

Relationships:

- likely links users to course records that are not present in this dump

ORM notes:

- treat as legacy until another source confirms the surrounding course tables

## Auth / Infrastructure Tables

These should be mapped if the new system needs compatibility or data migration, but they are infrastructure rather than business-domain entities.

## 16. `oauth_access_tokens`

Purpose:

- Laravel Passport access tokens

Columns:

- `id` `varchar(100)` PK
- `user_id` `bigint unsigned` nullable
- `client_id` `bigint unsigned` not null
- `name` `varchar(255)` nullable
- `scopes` `text` nullable
- `revoked` `tinyint(1)` not null
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable
- `expires_at` `datetime` nullable

Index:

- `user_id`

## 17. `oauth_auth_codes`

Purpose:

- Laravel Passport auth codes

Columns:

- `id` `varchar(100)` PK
- `user_id` `bigint unsigned` not null
- `client_id` `bigint unsigned` not null
- `scopes` `text` nullable
- `revoked` `tinyint(1)` not null
- `expires_at` `datetime` nullable

Index:

- `user_id`

## 18. `oauth_clients`

Purpose:

- Laravel Passport clients

Columns:

- `id` `bigint unsigned` PK
- `user_id` `bigint unsigned` nullable
- `name` `varchar(255)` not null
- `secret` `varchar(100)` nullable
- `provider` `varchar(255)` nullable
- `redirect` `text` not null
- `personal_access_client` `tinyint(1)` not null
- `password_client` `tinyint(1)` not null
- `revoked` `tinyint(1)` not null
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

Index:

- `user_id`

## 19. `oauth_personal_access_clients`

Purpose:

- Laravel Passport personal access client registry

Columns:

- `id` `bigint unsigned` PK
- `client_id` `bigint unsigned` not null
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

## 20. `oauth_refresh_tokens`

Purpose:

- Laravel Passport refresh tokens

Columns:

- `id` `varchar(100)` PK
- `access_token_id` `varchar(100)` not null
- `revoked` `tinyint(1)` not null
- `expires_at` `datetime` nullable

Index:

- `access_token_id`

## 21. `personal_access_tokens`

Purpose:

- Laravel Sanctum-style personal access tokens

Columns:

- `id` `bigint unsigned` PK
- `tokenable_type` `varchar(255)` not null
- `tokenable_id` `bigint unsigned` not null
- `name` `varchar(255)` not null
- `token` `varchar(64)` not null unique
- `abilities` `text` nullable
- `last_used_at` `timestamp` nullable
- `expires_at` `timestamp` nullable
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

Index:

- `(tokenable_type, tokenable_id)`

Note:

- the application primarily uses Passport, but this table exists and should be migrated if preserving full auth history matters

## 22. `password_resets`

Purpose:

- standard Laravel password reset tokens

Columns:

- `email` `varchar(255)` not null
- `token` `varchar(255)` not null
- `created_at` `timestamp` nullable

Index:

- `email`

## 23. `failed_jobs`

Purpose:

- Laravel failed queue jobs

Columns:

- `id` `bigint unsigned` PK
- `uuid` `varchar(255)` unique
- `connection` `text` not null
- `queue` `text` not null
- `payload` `longtext` not null
- `exception` `longtext` not null
- `failed_at` `timestamp` not null default current timestamp

## 24. `migrations`

Purpose:

- Laravel migration bookkeeping

Columns:

- `id` `int unsigned` PK
- `migration` `varchar(255)` not null
- `batch` `int` not null

## 25. `permissions`

Purpose:

- Spatie permission catalog

Columns:

- `id` `bigint unsigned` PK
- `name` `varchar(255)` not null
- `guard_name` `varchar(255)` not null
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

Constraints:

- unique `(name, guard_name)`

## 26. `roles`

Purpose:

- Spatie role catalog

Columns:

- `id` `bigint unsigned` PK
- `name` `varchar(255)` not null
- `guard_name` `varchar(255)` not null
- `created_at` `timestamp` nullable
- `updated_at` `timestamp` nullable

Constraints:

- unique `(name, guard_name)`

## 27. `model_has_roles`

Purpose:

- polymorphic role assignment

Columns:

- `role_id` `bigint unsigned` not null
- `model_type` `varchar(255)` not null
- `model_id` `bigint unsigned` not null

Constraints:

- PK `(role_id, model_id, model_type)`
- FK `role_id` -> `roles.id` cascade delete

Index:

- `(model_id, model_type)`

## 28. `model_has_permissions`

Purpose:

- polymorphic direct permission assignment

Columns:

- `permission_id` `bigint unsigned` not null
- `model_type` `varchar(255)` not null
- `model_id` `bigint unsigned` not null

Constraints:

- PK `(permission_id, model_id, model_type)`
- FK `permission_id` -> `permissions.id` cascade delete

Index:

- `(model_id, model_type)`

## 29. `role_has_permissions`

Purpose:

- role-to-permission join table

Columns:

- `permission_id` `bigint unsigned` not null
- `role_id` `bigint unsigned` not null

Constraints:

- PK `(permission_id, role_id)`
- FK `permission_id` -> `permissions.id` cascade delete
- FK `role_id` -> `roles.id` cascade delete

## ORM Modeling Recommendations

## Recommended ORM Entity Set

These should be first-class ORM models:

- `User`
- `Child`
- `LocationTrack`
- `ChildLocationShare`
- `DeviceId`
- `Plan`
- `PlanPurchase`
- `Notification`
- `Cms`
- `FeedBack`
- `StepCountMaster`

These can also be modeled if legacy/admin compatibility is needed:

- `Banner`
- `Category`
- `Product`
- `CourseAssignUser`

These are usually infra-only and may be omitted from app-domain ORM usage unless needed:

- `OauthAccessToken`
- `OauthAuthCode`
- `OauthClient`
- `OauthPersonalAccessClient`
- `OauthRefreshToken`
- `PersonalAccessToken`
- `FailedJob`
- `Migration`
- `Role`
- `Permission`
- `ModelHasRole`
- `ModelHasPermission`
- `RoleHasPermission`

## Relationship Recommendations In ORM

Define these relations even where the DB does not enforce every one:

- `User.hasMany(Child, { foreignKey: parent_id })`
- `Child.belongsTo(User, { foreignKey: parent_id })`
- `Child.hasMany(LocationTrack, { foreignKey: child_id })`
- `LocationTrack.belongsTo(Child, { foreignKey: child_id })`
- `Child.hasMany(ChildLocationShare, { foreignKey: child_id })`
- `ChildLocationShare.belongsTo(Child, { foreignKey: child_id })`
- `Plan.hasMany(PlanPurchase, { foreignKey: plan_id })`
- `PlanPurchase.belongsTo(Plan, { foreignKey: plan_id })`
- `PlanPurchase.belongsTo(Child, { foreignKey: child_id })` at ORM level even though the DB lacks the FK

Optional service-level relations:

- `Child.device_id` matched to `DeviceId.device`
- `Notification.user_id` matched to `User.id`

## Type Cautions For ORM

These columns are semantically typed but physically string-based:

- `users.otp_verify`
- `children.dob`
- `location_tracks.latitude`
- `location_tracks.longitude`
- `child_location_shares.start_time`
- `child_location_shares.end_time`
- `child_location_shares.minutes`
- `plans.month`
- `plan_purchases.amount`
- `plan_purchases.month`
- `plan_purchases.start_date`
- `plan_purchases.end_date`
- `step_count_master.step_count`
- `step_count_master.date`
- `products.price`
- `products.offer_price`

Treat them carefully in the domain layer.

## Integrity Gaps To Preserve

These are real characteristics of the legacy schema and should be documented rather than silently fixed during first-pass mapping:

- `users.email` has no DB uniqueness
- `children.device_id` has no DB uniqueness
- `device_ids.device` has no DB uniqueness
- `plan_purchases.child_id` is not protected by an FK
- share-link sessions are not unique per child
- string flags are used where booleans would be cleaner
- string dates are used where date/datetime would be cleaner

## Live Schema vs Code Mismatch Notes

These mismatches matter for migration planning:

1. Code references some legacy course/video/comment tables that are not present in the live schema dump.
2. The live DB contains extra columns in `users` beyond what earlier migrations showed.
3. Application validation assumes some uniqueness that the DB does not enforce.
4. The notification table still carries legacy `course_id` coupling.
5. The codebase mixes active child-tracking behavior with residue from an older domain.

## Final Recommendation For Migration Work

For ORM generation and migration planning, use this document as the canonical model inventory:

- first map the schema exactly as it exists
- then create a separate normalized target-schema proposal
- do not combine raw legacy mapping and target redesign into one layer

This document is the raw legacy baseline we should map from.
