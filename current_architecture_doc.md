# Current Architecture: Legacy Stepwhere Backend

## Purpose

This document captures the current or original state of the legacy Stepwhere backend as reverse-engineered from the codebase located at:

- `/Users/vael/Downloads/child-tracking`

This is a baseline architecture and behavior document for migration planning. It describes:

- the current runtime architecture
- the tech stack and platforms in use
- the API surface
- the business logic currently implemented
- admin-side operational behavior
- data model and storage assumptions
- legacy code contamination and known risks

This document reflects the implementation as it exists in code, including weak, incomplete, or inconsistent behavior. It is not a recommended target architecture.

## Executive Summary

The legacy backend is primarily a Laravel application backed by MySQL, with a separate lightweight Node.js service used as a realtime broadcast relay.

At a high level:

- Laravel is the main backend and system of record.
- MySQL is the primary database.
- Laravel Passport is used for API token authentication.
- Laravel session auth is used for the admin web panel.
- A modular Laravel admin area manages users, children, devices, plans, CMS pages, and notifications.
- Child location updates are written into Laravel, then pushed to a separate Express + Socket.IO service for realtime fan-out.
- Firebase is not used as a database.
- Firebase Cloud Messaging appears to be used only for push notifications.
- Vite is only used to build frontend assets for the Laravel app and admin module. It is not a backend runtime.

The codebase also contains clear remnants from another product domain, including courses, products, videos, comments, and related helpers/controllers. These are important because they introduce ambiguity and migration risk.

## Architecture Overview

## Runtime Components

### 1. Laravel Application

Laravel is the primary application runtime.

Responsibilities:

- user registration and login
- OTP verification flow
- password setup
- Passport token issuance
- authenticated parent profile management
- child record management
- child location persistence
- location history retrieval
- share link generation for public child tracking
- CMS and notification APIs
- admin CRUD operations
- file upload handling for user and child images

Relevant locations:

- `routes/api.php`
- `routes/web.php`
- `app/Http/Controllers/Api/*`
- `Modules/Admin/*`
- `app/Models/*`
- `database/migrations/*`

### 2. Node.js Realtime Relay

There is a separate Node.js service under `socket/`.

Responsibilities:

- receives HTTP POST payloads from Laravel
- broadcasts child location snapshots to connected websocket clients

Implementation:

- `socket/app.js`

Flow:

1. Laravel receives a child location update.
2. Laravel stores the location in MySQL.
3. Laravel builds the latest snapshot for all children belonging to the same parent.
4. Laravel POSTs that payload to the Node service at `101.53.148.75:8003/child-live-data`.
5. The Node service emits a Socket.IO event keyed by `child_id-{parent_id}`.

This service is not a source of truth. It is only a relay.

### 3. Vite Build Pipelines

There are two Vite setups:

- root `vite.config.js`
- `Modules/Admin/vite.config.js`

Responsibilities:

- compile frontend JS and Sass assets
- build Laravel web assets
- build admin module assets

Vite does not own business logic or persistence.

### 4. Web and Public Pages

The Laravel app also serves:

- the main website entry page
- static policy pages
- a public child live-location share page
- a feedback/contact form

### 5. Storage

Laravel filesystem storage is used for uploaded assets.

Observed storage targets:

- `public/user_image/`
- `public/image/`
- `public/admin_image/`
- `public/notification_logo/`

## Tech Stack / Platform Matrix

| Area | Responsibility | Tech Stack / Platform | Notes |
| --- | --- | --- | --- |
| Primary backend | Core business logic and APIs | Laravel 9, PHP 8 | Main application runtime |
| API authentication | Token-based auth for mobile/API consumers | Laravel Passport | Configured via `auth:api` |
| Web/admin authentication | Session-based login | Laravel web guard | Used by admin panel |
| Roles and permissions | Role management | `spatie/laravel-permission` | Used for Admin/User roles |
| ORM / DB access | Model persistence | Eloquent ORM | Used across the app |
| Database | Primary persistence | MySQL | Configured in `.env.example` |
| Admin module system | Modular admin panel | `nwidart/laravel-modules` | Admin lives under `Modules/Admin` |
| Frontend asset build | Main web asset bundling | Vite | Root `vite.config.js` |
| Admin asset build | Admin asset bundling | Vite | Separate module config |
| Realtime relay | Broadcast parent child-location snapshots | Node.js, Express, Socket.IO | `socket/app.js` |
| Push notifications | Mobile push delivery | Firebase Cloud Messaging | FCM server key based send path |
| Legacy realtime/event support | Event broadcasting remnants | Pusher | Present in code but not the main child tracking live path |
| Client scripting | Public/admin frontend scripting | jQuery | Used in share page and admin pages |
| UI/CSS | Frontend styling | Bootstrap, Sass | Used for Laravel/admin views |
| Maps | Public location rendering | Google Maps JavaScript API | Used in share-link page |
| File storage | Uploaded images and files | Laravel filesystem | Public storage-backed files |

## Is Firebase Used as the Database?

No.

From the code inspected:

- database configuration points to MySQL
- persistence is implemented with Laravel Eloquent models and migrations
- there is no evidence of Firebase Realtime Database or Firestore usage

Firebase appears only in the context of push notification delivery using FCM.

## Repository Structure

High-value areas in the legacy codebase:

- `app/Http/Controllers/Api/`
- `app/Models/`
- `routes/api.php`
- `routes/web.php`
- `database/migrations/`
- `Modules/Admin/`
- `socket/`
- `resources/views/`

Observed high-level structure:

- Laravel root app
- modular admin package under `Modules/Admin`
- separate socket service under `socket`

## Current Responsibilities by Layer

## Laravel API Layer

Defined primarily in `routes/api.php`.

Responsibilities:

- auth flows
- user profile operations
- child CRUD
- latest location aggregation
- location history retrieval
- share link creation
- FCM token storage
- CMS retrieval
- notification retrieval
- plan listing

## Laravel Web Layer

Defined in `routes/web.php`.

Responsibilities:

- root website pages
- privacy/terms/refund/about pages
- share-link location page
- share-link location JSON endpoint
- contact-us feedback form

## Admin Module Layer

Defined in `Modules/Admin/Routes/web.php`.

Responsibilities:

- admin dashboard
- admin profile management
- user CRUD
- child CRUD
- device registry CRUD
- plan CRUD
- plan-to-child assignment
- CMS CRUD
- notification CRUD
- feedback viewing
- banner and product-related legacy management

## Realtime Layer

Defined in `socket/app.js`.

Responsibilities:

- receive child location payload snapshots from Laravel
- broadcast to connected listeners grouped by parent

## Authentication and Authorization

## API Authentication

The API uses:

- guard: `api`
- driver: `passport`

This means mobile or API clients authenticate using Laravel Passport access tokens.

Observed behavior:

- `PasswordSet` issues a token after setting a password
- `login` issues a token on successful email/password login
- authenticated routes are wrapped in `Route::middleware('auth:api')`

## Admin Authentication

The admin panel uses:

- Laravel session/web auth
- custom middleware `IsAdmin`

Observed rule:

- if logged in and first role is not `User`, request may proceed
- otherwise redirect back with no permission
- unauthenticated users are redirected to `/login`

This is a coarse role-based gate, not a granular permission system in the paths reviewed.

## User Roles

Observed roles:

- `Admin`
- `User`

New API-registered users are assigned role:

- `User`

A seeded admin user exists in the seeders.

## Data Model

## Confirmed Tables from Migrations

The following tables are confirmed by migrations present in the repo:

### `users`

Important columns:

- `id`
- `slug`
- `name`
- `email`
- `mobile_number`
- `password`
- `fcm_token`
- `lat`
- `long`
- `otp`
- `otp_verify`
- `status`
- `image`
- timestamps

Business meaning:

- represents both parent users and admins
- stores OTP state and password state
- stores API push token

### `children`

Important columns:

- `id`
- `parent_id`
- `slug`
- `image`
- `child_name`
- `device_id`
- `gender`
- `dob`
- timestamps

Business meaning:

- child profile belonging to a parent user
- linked to a whitelisted device identifier

### `location_tracks`

Important columns:

- `id`
- `child_id`
- `slug`
- `latitude`
- `longitude`
- `device_name`
- `location`
- timestamps

Business meaning:

- append-only child location history
- latest row is treated as current location

### `child_location_shares`

Important columns:

- `id`
- `child_id`
- `slug`
- `start_time`
- `end_time`
- `minutes`
- `status`
- timestamps

Business meaning:

- time-bounded public location sharing session

### `notifications`

Important columns:

- `id`
- `slug`
- `title`
- `logo`
- `description`
- `user_id`
- `role`
- `status`
- timestamps

Business meaning:

- notification records exposed through API and managed in admin

### `cms`

Important columns:

- `id`
- `slug`
- `title`
- `description`
- `status`
- timestamps

Business meaning:

- basic CMS content records exposed through API and static pages

## Inferred Tables Referenced in Code but Missing Migrations

These tables are referenced in runtime logic, but their migrations were not found in the repo:

### `device_ids`

Used by:

- `App\Models\DeviceId`
- `Modules/Admin/Http/Controllers/DevicesController.php`
- `app/Http/Controllers/Api/ChildController.php`

Inferred business meaning:

- registry of approved or known device identifiers
- a child cannot be added unless its `device_id` exists here

Inferred probable fields:

- `id`
- `slug`
- `device`
- `status`
- timestamps

### `plans`

Used by:

- `App\Models\Plan`
- `Modules/Admin/Http/Controllers/PlanController.php`
- API plan listing and child plan enrichment

Inferred business meaning:

- plan catalog available for child assignment

Inferred probable fields:

- `id`
- `slug`
- `title`
- `description`
- `month`
- `status`
- timestamps

### `plan_purchases`

Used by:

- `App\Models\PlanPurchase`
- API child listing
- admin child plan assignment

Inferred business meaning:

- assigned or purchased plan per child

Inferred probable fields:

- `id`
- `slug`
- `plan_id`
- `child_id`
- `amount`
- `order_id`
- `purchase_id`
- `status`
- `start_date`
- `end_date`
- `month`
- timestamps

These three tables must be validated against the live DB later before final migration design.

## Slug Strategy

Several models use slugs via `Cviebrock\EloquentSluggable`.

Observed sources:

- user slug from `mobile_number`
- child slug from `child_name`
- plan slug from `title`
- device slug from `device`
- notification slug from `title`
- CMS slug from `title`
- location track slug from `device_name`
- child share slug from `child_id`

There is also explicit manual slug assignment in location sharing:

- `child-location-share{child_id}`

This means some slugs are predictable and not security-grade tokens.

## API Surface

## Public / Unauthenticated API

### `POST /api/register`

Controller:

- `CommanController@RegisterUser`

Tech Stack / Platform:

- Laravel API
- MySQL
- Spatie roles

Request validation:

- `mobile_number`: required, unique, exactly 10 digits
- `email`: required, unique

Behavior:

- creates a user with empty password
- sets `status = inactive`
- sets OTP from `getotp()`
- sets `otp_verify = 0`
- assigns role `User`

Important note:

- `getotp()` returns hardcoded `1234`

Response behavior:

- success body contains message asking for OTP verification
- validation errors return `status_code: 500` in body

### `POST /api/otp-verify-login`

Controller:

- `CommanController@VerifyOtpLogin`

Tech Stack / Platform:

- Laravel API
- MySQL

Request validation:

- `mobile_number`: required, 10 digits
- `email`: required
- `otp`: required, 4 digits

Behavior:

- verifies user by mobile number, email, and OTP
- sets `otp_verify = 1`
- clears OTP
- does not issue token
- does not set password

### `POST /api/password-set`

Controller:

- `CommanController@PasswordSet`

Tech Stack / Platform:

- Laravel API
- Laravel Passport
- MySQL

Request validation:

- `mobile_number`: required, 10 digits
- `password`: required

Behavior:

- looks up user by mobile number
- hashes password
- sets `status = active`
- attempts login using mobile number + password
- if login works, creates Passport token

Response payload on success:

- `token`

### `POST /api/login`

Controller:

- `CommanController@authenticate`

Tech Stack / Platform:

- Laravel API
- Laravel Passport
- MySQL

Request validation:

- `email`: required
- `password`: required

Behavior:

- attempts auth by email + password
- creates Passport token if valid
- returns token and current profile object

Important inconsistency:

- success response message says `"Login credentials are invalid."` even when login succeeds

### `POST /api/location-share-link-get`

Controller:

- `ChildController@LocationShareLinkGet`

Tech Stack / Platform:

- Laravel API
- MySQL

Request validation:

- `child_id`: required
- `minutes`: required

Behavior:

- calculates `start_time` as current server time
- calculates `end_time` as current time plus requested minutes
- sets slug to `child-location-share{child_id}`
- updates existing share record or creates one
- returns link for public viewing

Response:

- returns URL under `/child-seen/{slug}`

### `POST /api/location-store`

Controller:

- `ChildController@LocationStore`

Tech Stack / Platform:

- Laravel API
- MySQL
- PHP cURL
- Express
- Socket.IO

Request validation:

- `latitude`: required
- `longitude`: required
- `device_name`: required
- `location`: required

Behavior:

1. finds child where `children.device_id == request.device_name`
2. if no child found, request fails
3. creates a `location_tracks` record with resolved `child_id`
4. loads all children for the same parent
5. for each child, finds latest location record
6. builds aggregated live payload
7. sends payload to `101.53.148.75:8003/child-live-data`
8. returns success to caller

Important identity rule:

- `device_name` in the incoming payload is treated as the device identifier for child lookup

### `ANY /api/cms-list`

Controller:

- `HomeController@CmsPageList`

Tech Stack / Platform:

- Laravel API
- MySQL

Behavior:

- returns all CMS rows ordered by latest first

## Authenticated API

These are protected by `auth:api`.

### `ANY /api/profile-get`

Controller:

- `CommanController@ProfileGet`

Tech Stack / Platform:

- Laravel API
- MySQL
- Laravel storage URLs

Behavior:

- returns current authenticated user
- appends `total_child`
- rewrites image field to asset URL if present

### `POST /api/profile-update`

Controller:

- `CommanController@ProfileUpdate`

Tech Stack / Platform:

- Laravel API
- MySQL
- Laravel filesystem

Request validation:

- `name`: required

Behavior:

- optionally stores uploaded user image
- updates current user with request data

### `ANY /api/my-child`

Controller:

- `ChildController@MyChild`

Tech Stack / Platform:

- Laravel API
- MySQL
- inferred plans tables
- Laravel storage URLs

Behavior:

- loads children owned by current parent
- attaches image URL
- attaches formatted created date
- looks up latest plan purchase per child
- if plan exists, attaches:
  - `start_date`
  - `end_date`
  - `expire_days`
  - `plan_name`

Important detail:

- `expire_days` is calculated as `end_date - start_date`, not remaining days from now

### `POST /api/child-add`

Controller:

- `ChildController@ChildAdd`

Tech Stack / Platform:

- Laravel API
- MySQL
- inferred `device_ids` table
- Laravel filesystem

Request validation:

- `child_name`: required
- `device_id`: unique in `children.device_id`

Behavior:

- verifies given `device_id` exists in `device_ids.device`
- if missing, returns `"Device Not Found !."`
- sets `parent_id` from authenticated user
- optionally stores image
- creates child

### `POST /api/child-update`

Controller:

- `ChildController@ChildUpdate`

Tech Stack / Platform:

- Laravel API
- MySQL
- Laravel filesystem

Request validation:

- `child_name`: required
- `device_id`: unique except current child

Behavior:

- resolves child by slug
- optionally uploads new image
- otherwise keeps existing image
- updates child record

### `POST /api/child-delete`

Controller:

- `ChildController@destroy`

Tech Stack / Platform:

- Laravel API
- MySQL

Behavior:

- deletes child by slug

### `ANY /api/home`

Controller:

- `HomeController@Home`

Tech Stack / Platform:

- Laravel API
- MySQL

Behavior:

- returns all children for current parent
- for each child, attaches latest known:
  - `latitude`
  - `longitude`
  - `location`
  - `device_name`

This is effectively a parent dashboard latest-location endpoint.

### `ANY /api/past-location`

Controller:

- `HomeController@PastLocation`

Tech Stack / Platform:

- Laravel API
- MySQL

Request validation:

- `child_id`: required

Behavior:

- paginates `location_tracks` for a child, 20 per page
- sorted newest first
- appends formatted datetime string

### `ANY /api/notification-list`

Controller:

- `HomeController@NotificationGet`

Tech Stack / Platform:

- Laravel API
- MySQL
- Laravel storage URLs

Behavior:

- returns active notifications only
- rewrites logo to asset URL if present
- strips HTML tags from description

### `POST /api/fcm-token-store`

Controller:

- `CommanController@FcmTokenUpdate`

Tech Stack / Platform:

- Laravel API
- MySQL
- Firebase Cloud Messaging integration support

Request validation:

- `fcm_token`: required

Behavior:

- stores current user’s FCM token in `users.fcm_token`

### `GET /api/plan-list`

Controller:

- `HomeController@PlanListGet`

Tech Stack / Platform:

- Laravel API
- MySQL
- inferred `plans` table

Behavior:

- returns active plans only

## Web Routes with Business Relevance

### `GET /child-seen/{slug}`

Purpose:

- serves public child location share page

Tech Stack / Platform:

- Laravel Blade
- jQuery
- Google Maps JS API

Behavior:

- renders page that polls backend every 20 seconds
- shows child name, device id, timer, and map marker

### `GET /child-live-location-get/{slug}`

Purpose:

- JSON endpoint used by the public share page

Tech Stack / Platform:

- Laravel web route
- MySQL

Behavior:

- finds share session by slug
- loads latest location record for associated child
- enriches response with child name and latest coordinates
- if `end_time` has passed, returns session-expired style response
- else returns active location payload

### `POST /contact-us`

Purpose:

- feedback capture

Tech Stack / Platform:

- Laravel web route
- MySQL

Behavior:

- creates a feedback record from request body
- redirects back with success or error flash

## Admin Module

## Admin Routing

Admin routes live in:

- `Modules/Admin/Routes/web.php`

All admin routes are under:

- prefix: `admin`
- middleware: `Isadmin`

## Admin Functional Areas

### Admin Dashboard

Tech Stack / Platform:

- Laravel
- Blade
- Laravel modules

Capabilities:

- dashboard landing page
- admin profile edit
- password change screen

Important note:

- password update logic appears effectively non-functional in inspected code

### User Management

Controller:

- `Modules/Admin/Http/Controllers/UserController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL
- Spatie roles

Capabilities:

- list users
- create user
- edit user
- view user
- delete user
- toggle user status
- reset device fields on user
- view child count per user

Observed business details:

- created users are assigned role `User`
- some fields referenced in queries, like `unique_device_model`, are not confirmed by the visible migrations

### Child Management

Controller:

- `Modules/Admin/Http/Controllers/ChildController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL
- inferred plans tables

Capabilities:

- list children for a given parent
- create child
- edit child
- delete child
- view tracking history
- assign or remove plans on a child

Important plan behavior:

- selecting plan `0` removes current child plan
- selecting a plan computes:
  - `start_date = today`
  - `end_date = now + plan.month months`
- assignment values like `amount`, `order_id`, and `purchase_id` are hardcoded to `'admin'`

### Device Registry Management

Controller:

- `Modules/Admin/Http/Controllers/DevicesController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL

Capabilities:

- list devices
- create device
- edit device
- delete device
- toggle status

Business meaning:

- device records act as a whitelist or registry of valid child devices

### Plan Management

Controller:

- `Modules/Admin/Http/Controllers/PlanController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL

Capabilities:

- list plans
- create plan
- edit plan
- delete plan
- toggle plan status

### CMS Management

Controller:

- `Modules/Admin/Http/Controllers/CmsController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL

Capabilities:

- list CMS items
- create CMS items
- edit CMS items
- delete CMS items
- toggle status

### Notification Management

Controller:

- `Modules/Admin/Http/Controllers/NotificationController.php`

Tech Stack / Platform:

- Laravel admin
- MySQL
- Firebase Cloud Messaging

Capabilities:

- list notifications
- create notifications
- edit notifications
- delete notifications
- toggle status
- initiate push notification sends

Observed integration pattern:

- uses stored user `fcm_token` values
- sends to FCM endpoint using server key

## Realtime Location Flow

This is the most important business runtime path in the system.

## End-to-End Flow

1. A device submits `latitude`, `longitude`, `device_name`, and `location` to `POST /api/location-store`.
2. Laravel treats `device_name` as the child device identifier and looks up `children.device_id`.
3. Laravel inserts a new `location_tracks` row.
4. Laravel loads every child owned by the same parent.
5. Laravel finds the latest location row for each of those children.
6. Laravel builds a single payload containing the parent id and latest location per child.
7. Laravel sends that payload over HTTP POST to the Node relay service.
8. The Node relay broadcasts the payload using Socket.IO on event `child_id-{parent_id}`.

## Realtime Contract

### Internal Laravel to Node HTTP

Endpoint:

- `POST /child-live-data`

Host:

- `101.53.148.75:8003`

Payload shape:

```json
{
  "parent_id": 123,
  "data": [
    {
      "id": 1,
      "child_name": "Example",
      "latitude": "26.9",
      "longitude": "75.8",
      "location": "Jaipur",
      "device_name": "DEVICE123"
    }
  ]
}
```

### Node to Websocket Clients

Socket behavior:

- joins every client into room `child_list`
- emits event named `child_id-{parent_id}`
- payload is forwarded unchanged

Implication:

- listeners subscribe by parent-specific event name
- the relay itself does not perform auth or authorization checks in the observed code

## Public Share Link Flow

## Purpose

Allows temporary public access to a child’s current location.

## Generation

Through:

- `POST /api/location-share-link-get`

Inputs:

- `child_id`
- `minutes`

Stored state:

- `start_time`
- `end_time`
- `minutes`
- predictable slug

## Consumption

The share page polls:

- `GET /child-live-location-get/{slug}`

every 20 seconds.

Returned data includes:

- share record fields
- latest latitude/longitude
- device name
- child name

If expired:

- page displays session expired state

## Business Logic by Domain

## User Lifecycle

1. User registers with mobile number and email.
2. User receives or is expected to receive OTP, but code uses hardcoded `1234`.
3. User verifies OTP using mobile, email, and OTP.
4. User sets password in a separate step.
5. User is activated and receives Passport token.
6. User later logs in via email and password.

## Child Lifecycle

1. Parent must be authenticated.
2. Parent can add a child only if the `device_id` exists in the device registry.
3. Child may have image, gender, DOB, and name.
4. Child belongs to exactly one parent.
5. Child may optionally have a plan assignment.

## Device Validation Logic

The system currently assumes:

- a child device is pre-registered in `device_ids`
- incoming location payload uses `device_name` that equals the child’s `device_id`

This is the current device trust model.

## Plan Logic

Plan logic is partly inferred because migrations are missing.

Observed behavior:

- plans have active/inactive states
- a child can have a plan purchase/assignment
- admin can assign a plan directly
- direct admin assignment writes synthetic purchase fields with `'admin'`
- end date is derived from plan month count

## Location History Logic

Each location update creates a new row in `location_tracks`.

Current location is always derived as:

- latest row by descending `id`

There is no evidence of:

- deduplication
- geofence evaluation
- device signature verification
- rate limiting

## CMS Logic

The API simply returns CMS rows.

There is no observed content targeting, localization, versioning, or publication workflow beyond status fields.

## Notification Logic

Two notification concepts are present:

1. database-stored notification records returned through the API
2. push notification delivery through FCM

The database records and push sending capabilities are related operationally but not tightly modeled in the reviewed code.

## Legacy Code Contamination

The codebase appears to have been adapted from another application.

Evidence includes references to:

- courses
- videos
- products
- product assignment
- comments
- comment realtime events

Examples:

- `CommentController`
- helper functions referencing courses/products
- admin routes for banners/products/comments

Migration implication:

- not every model/controller in the repo belongs to the child-tracking domain
- rewrite scoping must explicitly separate child-tracking behavior from inherited legacy modules

## Known Inconsistencies and Defects

The current implementation contains several issues that should be preserved in documentation as part of original-state truth.

### Security and Identity Risks

- OTP is hardcoded to `1234`
- share link slug is predictable
- device identity is trusted by a plain string comparison
- realtime relay does not appear to enforce auth on broadcast

### API Design Issues

- body-level `status_code` values are used inconsistently
- some failures return `500` in JSON body for validation issues
- successful login returns an invalid failure message string
- route methods use `ANY` where `GET` would be more explicit

### Data / Schema Issues

- migrations for `device_ids`, `plans`, and `plan_purchases` are missing
- some user fields referenced by admin code are not visible in current migrations

### Code Quality Issues

- there are `dd($e)` debug paths in controllers
- legacy product/course logic remains mixed into the repo
- some methods are commented out or partially implemented
- admin password update flow appears incomplete

### Business Logic Ambiguities

- `expire_days` on child plans is total plan duration, not remaining duration
- user lifecycle requires separate OTP verify and password set steps
- notification behavior is partly operational and partly content-oriented

## Technology and Platform Dependencies

Current external or platform dependencies that matter for migration:

- MySQL
- PHP 8
- Laravel 9
- Laravel Passport
- Spatie permission package
- Node.js
- Express
- Socket.IO
- Firebase Cloud Messaging
- Google Maps JavaScript API
- Vite
- Bootstrap
- jQuery

## Original-State System Boundaries

## What Laravel Owns

- authentication
- authorization
- database writes and reads
- child management
- plan assignment state
- share link state
- file uploads
- CMS and notification records
- admin views

## What the Node Service Owns

- websocket connection handling
- live broadcast fan-out

## What the Database Owns

- users
- children
- location history
- share session state
- plans and plan assignment state
- CMS records
- notification records
- device registry

## What Frontend Assets Own

- admin page interactivity
- public share-page polling and map rendering

## Open Gaps Requiring Later Validation

These should be resolved before final migration implementation planning:

1. exact schema for `device_ids`
2. exact schema for `plans`
3. exact schema for `plan_purchases`
4. whether a live production DB contains additional columns not present in migrations
5. actual consumers of the Socket.IO `child_id-{parent_id}` events
6. whether FCM sends are actively used in production or are partially dormant
7. whether any legacy product/course modules are still in production use

## Migration Baseline Conclusions

The legacy Stepwhere backend is best understood as:

- a Laravel monolith with a modular admin area
- backed by MySQL
- extended with a very small external Node.js realtime relay
- using Passport for API auth
- using FCM for push delivery
- using Vite only for frontend asset builds

The core business capability is:

- parent-managed child registration tied to a known device identifier
- child location ingestion and history storage
- latest-location aggregation per parent
- temporary public share links for child location
- admin-managed plan, device, CMS, and notification operations

This document should be treated as the original-state reference for all future migration and rewrite planning.
