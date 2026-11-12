# StepWhere Activity Phase Plan

## 1. Goal

Build and enable the Activity tab for the StepWhere mobile app. This screen lets a parent review a selected child's movement insights across Day, Week, Month, and Year periods.

This phase includes:

- Mobile Activity tab enablement.
- Full Activity page UI based on the provided reference, adjusted to StepWhere requirements.
- Shared DTOs used by both stub mode and real API mode.
- Victory Native charting setup.
- Redis infrastructure for live active-time counters.
- Durable Postgres schema for activity rollups and geocoding cache.
- Backend Activity API.
- Google reverse-geocoding cache for analytics-time location labels.
- Deterministic stub data mode for UI development.

The implementation should be cohesive: the mobile UI should not know whether data came from stubs or the API. Both paths must return the same `ChildActivityResponseDto`.

## 2. Current Repo Facts

Mobile:

- Expo React Native app lives in `apps/mobile`.
- Navigation uses `expo-router/unstable-native-tabs`.
- Activity route already exists at `apps/mobile/src/app/(app)/(tabs)/activity.tsx`, but it is currently a placeholder.
- Activity tab is currently disabled in `apps/mobile/src/app/(app)/(tabs)/_layout.tsx`.
- A custom nav config also exists in `apps/mobile/src/components/navigation/bottom-navigation-bar.tsx` and marks Activity disabled.
- Home top chrome is built from:
  - `AppTopBar` at `apps/mobile/src/components/layout/app-top-bar.tsx`
  - `ChildCarousel` at `apps/mobile/src/components/home/child-carousel.tsx`
- Existing bottom-sheet visual pattern exists in `apps/mobile/src/components/home/share-duration-sheet.tsx`.
- Existing app theme is in `apps/mobile/src/theme/tokens.ts`.

Server:

- Hono server lives in `apps/server`.
- Family-authenticated routes are registered through `familyV1App` in `apps/server/src/app.ts`.
- Existing telemetry ingest writes:
  - `location_events`
  - `child_status_snapshots`
  - `child_step_counts_hourly`
  - `step_counts_daily`
- There is no Redis integration today.
- There is no Docker Compose file today.
- Google Roads integration exists, but reverse geocoding does not.

Types:

- Shared package lives in `packages/types`.
- Add Activity DTOs there so mobile and server share the same contract.

## 3. Product Scope

Activity screen requirements:

- Top bar stays the same as Home in spirit:
  - Use `AppTopBar`.
  - Add `ChildCarousel` below it so the parent can switch children.
  - Do not include Home's map telemetry strip on Activity.
- Show Activity header below top chrome.
- Quick filters: `Day`, `Week`, `Month`, `Year`.
- Remove the reference image's `Insights` tab.
- Date/range selector:
  - Left arrow.
  - Center date/range component.
  - Right arrow.
  - No separate calendar icon on the right.
  - Tapping center date/range opens a custom period-aware bottom sheet.
- Quick insights banner:
  - Use `apps/mobile/assets/thumbnail.webp` on the right for now.
  - Green active mode.
  - Yellow inactive mode.
  - Exactly two points in either mode.
- Main metrics:
  - Three compact ring charts:
    - Steps
    - Active Time
    - Calories
  - Do not show the duplicated four metric boxes row from the reference.
- Final chart:
  - Activity Rhythm chart.
  - 24 hourly bars.
  - Based on steps.
  - This is the last chart on the screen.
- Omit Share Report in this phase.

## 4. Data Source Modes

Add a source switch in a constants file, not an env flag:

```ts
export const DEV_STUB_MODE = true;
```

Location:

`apps/mobile/src/features/activity/activity-constants.ts`

Behavior:

- `DEV_STUB_MODE === true`:
  - Mobile uses local deterministic stub data.
  - Stubs must return `ChildActivityResponseDto`.
  - Stub data should vary by selected child, period, and date/range so UI interactions can be tested.
- `DEV_STUB_MODE === false`:
  - Mobile calls real API.
  - API response must be `ChildActivityResponseDto`.

The screen component should consume only one hook:

```ts
useChildActivityQuery({
  childId,
  period,
  startDate,
  endDate,
  timezone,
  enabled,
});
```

The hook internally chooses stub vs API mode.

## 5. Victory Native Charting

Use current `victory-native`, not the legacy package.

Install:

```sh
pnpm --filter @stepwhere/mobile expo install @shopify/react-native-skia
pnpm --filter @stepwhere/mobile add victory-native
```

Why:

- The app already has `react-native-reanimated`, `react-native-gesture-handler`, and the Reanimated Babel plugin.
- Victory Native's current package uses Skia and works well for polished React Native charts.
- It avoids hand-writing all chart geometry with SVG.

Expected package changes:

`apps/mobile/package.json`

```json
{
  "dependencies": {
    "@shopify/react-native-skia": "<expo-compatible-version>",
    "victory-native": "^41.26.0"
  }
}
```

Run after install:

```sh
pnpm install
pnpm --filter @stepwhere/mobile lint
```

Native rebuild:

- Because Skia is a native dependency, rebuild the Expo dev client after installing.
- Use the repo's normal command:

```sh
pnpm --filter @stepwhere/mobile ios
# or
pnpm --filter @stepwhere/mobile android
```

Chart usage:

- Metric rings:
  - Use Victory Native polar/pie primitives when available.
  - Render each as a donut progress ring with foreground and muted remainder.
  - Clamp visual progress at `150%`; show actual percentage in text.
- Activity Rhythm:
  - Use `CartesianChart` and `Bar`.
  - Render 24 hourly bars.
  - Highlight the peak bucket.
  - Use subtle blue bars for normal buckets, green for peak.

Fallback rule:

- If Victory Native's polar API is awkward for the three rings, implement metric rings using `react-native-svg` while keeping Activity Rhythm on Victory Native. Do not block the whole screen on ring chart package limitations.

## 6. Mobile Constants

Create:

`apps/mobile/src/features/activity/activity-constants.ts`

```ts
export const DEV_STUB_MODE = true;

export const ACTIVITY_GOALS = {
  stepsPerDay: 8000,
  activeMinutesPerDay: 120,
};

export const CALORIE_ESTIMATE = {
  averageChildWeightKg: 30,
  kcalPerKgPerStep: 0.001,
};

export const ACTIVITY_CLASSIFICATION = {
  activeGoalRatio: 0.75,
};

export const ACTIVITY_UI = {
  ringSize: 108,
  ringStrokeWidth: 11,
  rhythmChartHeight: 156,
  bannerImageWidth: 118,
};
```

Keep goal and calorie constants easy to find and edit.

## 7. Shared Types

Create:

`packages/types/src/activity.ts`

```ts
export type ActivityPeriod = "day" | "week" | "month" | "year";

export type ActivityMetricKey = "steps" | "activeTime" | "calories";

export type ActivityRangeDto = {
  startDate: string;
  endDate: string;
  timezone: string;
  label: string;
};

export type ActivityInsightPointDto = {
  id: string;
  label: string;
  value: string;
  tone: "green" | "blue" | "yellow";
};

export type ActivityInsightBannerDto = {
  mode: "active" | "inactive";
  title: string;
  points: [ActivityInsightPointDto, ActivityInsightPointDto];
};

export type ActivityMetricDto = {
  key: ActivityMetricKey;
  label: string;
  value: number;
  formattedValue: string;
  unit: "steps" | "min" | "kcal";
  goalValue: number;
  formattedGoal: string;
  percentOfGoal: number;
  comparisonPercent: number | null;
  tone: "green" | "blue" | "orange";
};

export type ActivityHourlyBucketDto = {
  hour: number;
  label: string;
  steps: number;
  activeMinutes: number;
  isPeak: boolean;
};

export type ActivitySeriesPointDto = {
  date: string;
  label: string;
  steps: number;
  activeMinutes: number;
  calories: number;
};

export type ChildActivityResponseDto = {
  childId: string;
  period: ActivityPeriod;
  range: ActivityRangeDto;
  generatedAt: string;
  insightBanner: ActivityInsightBannerDto;
  metrics: ActivityMetricDto[];
  rhythm: ActivityHourlyBucketDto[];
  series: ActivitySeriesPointDto[];
};
```

Update:

`packages/types/src/index.ts`

```ts
export * from "./activity";
```

## 8. OpenAPI Schemas

Update:

`apps/server/src/openapi/schemas.ts`

Add zod schemas mirroring the shared DTO.

Schema names:

- `ActivityPeriodSchema`
- `ActivityRangeSchema`
- `ActivityInsightPointSchema`
- `ActivityInsightBannerSchema`
- `ActivityMetricSchema`
- `ActivityHourlyBucketSchema`
- `ActivitySeriesPointSchema`
- `ChildActivityResponseSchema`

Use:

```ts
export const ChildActivityResponseSchema = z.object({
  childId: UuidSchema,
  period: z.enum(["day", "week", "month", "year"]),
  range: ActivityRangeSchema,
  generatedAt: DateTimeSchema,
  insightBanner: ActivityInsightBannerSchema,
  metrics: z.array(ActivityMetricSchema),
  rhythm: z.array(ActivityHourlyBucketSchema),
  series: z.array(ActivitySeriesPointSchema),
}).openapi("ChildActivityResponse");
```

Keep DTO and OpenAPI schema in sync manually.

## 9. Redis Infrastructure

### 9.1 Local Redis Password

Generated local development Redis password:

```txt
fsXedgIGnx10U3bUan7uG46tw9hrwbmxnf6TYyC7kbJAKCrDbt7VACmpNWQUTJQs
```

Use this for local development only. Rotate before using shared, staging, or production infrastructure.

### 9.2 Docker Compose

Create root file:

`docker-compose.yml`

```yaml
services:
  redis:
    image: redis:7.4-alpine
    container_name: stepwhere-redis
    restart: unless-stopped
    command:
      - redis-server
      - --appendonly
      - "yes"
      - --requirepass
      - "${REDIS_PASSWORD}"
    ports:
      - "6379:6379"
    volumes:
      - stepwhere_redis_data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$${REDIS_PASSWORD}\" ping | grep PONG"]
      interval: 10s
      timeout: 3s
      retries: 10

volumes:
  stepwhere_redis_data:
```

Add root env example if needed:

`.env.example`

```env
REDIS_PASSWORD=replace-with-a-strong-local-password
```

For local use, create root `.env`:

```env
REDIS_PASSWORD=fsXedgIGnx10U3bUan7uG46tw9hrwbmxnf6TYyC7kbJAKCrDbt7VACmpNWQUTJQs
```

Start Redis:

```sh
docker compose up -d redis
```

Local server Redis URL:

```env
REDIS_URL=redis://:fsXedgIGnx10U3bUan7uG46tw9hrwbmxnf6TYyC7kbJAKCrDbt7VACmpNWQUTJQs@127.0.0.1:6379/0
```

### 9.3 Server Redis Dependency

Install:

```sh
pnpm --filter @stepwhere/server add ioredis
```

Update:

`apps/server/src/config/env.ts`

Add:

```ts
REDIS_URL: z.string().url().optional(),
GOOGLE_GEOCODING_API_KEY: z.string().min(1).optional(),
```

Update `apps/server/.env.example`:

```env
REDIS_URL=redis://:replace-with-password@127.0.0.1:6379/0
GOOGLE_GEOCODING_API_KEY=
```

Create:

`apps/server/src/infrastructure/redis.ts`

Behavior:

- Export `getRedisClient()` or `redisClient`.
- If `REDIS_URL` is missing:
  - In development/test: return `null` and log once.
  - In production: log a warning and return `null`.
- If connection errors happen:
  - Do not crash telemetry ingest.
  - Log failures in development.
- Use lazy connection if possible.

Suggested shape:

```ts
import Redis from "ioredis";
import { env } from "../config/env";

let client: Redis | null | undefined;

export function getRedisClient() {
  if (client !== undefined) {
    return client;
  }

  if (!env.REDIS_URL) {
    client = null;
    return client;
  }

  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  client.on("error", (error) => {
    if (env.NODE_ENV !== "test") {
      console.warn("[redis] connection error", error);
    }
  });

  return client;
}
```

## 10. Database Schema Changes

Update Drizzle schema:

`apps/server/src/db/schema/core.ts`

Add table `childActivityMinuteBuckets`.

Purpose:

- Durable active-time reporting source.
- Stores minute-level step and active-time rollup from location telemetry samples.
- Lets Day/Week/Month/Year reports survive Redis restarts.

Columns:

```ts
export const childActivityMinuteBuckets = pgTable("child_activity_minute_buckets", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  minuteStart: timestamp("minute_start", { withTimezone: true }).notNull(),
  eventDate: date("event_date").notNull(),
  totalSteps: integer("total_steps").notNull().default(0),
  activeSteps: integer("active_steps").notNull().default(0),
  activeSeconds: integer("active_seconds").notNull().default(0),
  sampleCount: integer("sample_count").notNull().default(0),
  representativeLatitude: numeric("representative_latitude", { precision: 9, scale: 6 }),
  representativeLongitude: numeric("representative_longitude", { precision: 9, scale: 6 }),
  sourceLocationEventId: uuid("source_location_event_id").references(() => locationEvents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  childDateIdx: index("child_activity_minute_child_date_idx").on(table.childId, table.eventDate),
  childMinuteIdx: index("child_activity_minute_child_minute_idx").on(table.childId, table.minuteStart),
  uniqueChildDeviceMinute: uniqueIndex("child_activity_minute_unique").on(table.childId, table.deviceId, table.minuteStart),
}));
```

Add table `activityLocationLabelCache`.

Purpose:

- Avoid repeated Google reverse-geocoding calls.
- Cache labels for rounded coordinates used only by analytics.

Columns:

```ts
export const activityLocationLabelCache = pgTable("activity_location_label_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  roundedLatitude: numeric("rounded_latitude", { precision: 9, scale: 4 }).notNull(),
  roundedLongitude: numeric("rounded_longitude", { precision: 9, scale: 4 }).notNull(),
  provider: text("provider").notNull().default("google"),
  displayLabel: text("display_label").notNull(),
  formattedAddress: text("formatted_address"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiresAtIdx: index("activity_location_label_cache_expires_idx").on(table.expiresAt),
  uniqueProviderCoordinate: uniqueIndex("activity_location_label_cache_unique").on(
    table.provider,
    table.roundedLatitude,
    table.roundedLongitude,
  ),
}));
```

Generate migration:

```sh
pnpm --filter @stepwhere/server db:generate
```

Review generated SQL before running migration.

Expected SQL shape:

```sql
CREATE TABLE "child_activity_minute_buckets" (...);
CREATE TABLE "activity_location_label_cache" (...);
CREATE INDEX ...;
CREATE UNIQUE INDEX ...;
```

Apply migration locally:

```sh
pnpm --filter @stepwhere/server db:migrate
```

## 11. Active Time Algorithm

Create:

`apps/server/src/modules/activity/activity.constants.ts`

```ts
export const ACTIVITY_STEP_RATE_THRESHOLD_PER_MINUTE = 50;
export const MAX_ACTIVE_INTERVAL_SECONDS = 300;

export const ACTIVITY_GOALS = {
  stepsPerDay: 8000,
  activeMinutesPerDay: 120,
};

export const CALORIE_ESTIMATE = {
  averageChildWeightKg: 30,
  kcalPerKgPerStep: 0.001,
};

export const GEOCODING_CACHE = {
  coordinatePrecision: 4,
  ttlDays: 90,
};
```

Integrate into:

`apps/server/src/modules/telemetry/telemetry.service.ts`

During `ingestLocation`:

1. Normalize hardware identifier as currently done.
2. Read active child/device binding as currently done.
3. Read previous `childStatusSnapshots` as currently done.
4. Compute `stepDelta` using existing `deriveStepDelta`.
5. Compute active interval only when previous snapshot exists:

```ts
const previousSeenAt = snapshot?.lastSeenAt;
const elapsedSeconds = previousSeenAt
  ? Math.floor((sampleAt.getTime() - previousSeenAt.getTime()) / 1000)
  : 0;

const stepsPerMinute = elapsedSeconds > 0
  ? stepDelta / (elapsedSeconds / 60)
  : 0;

const isActiveInterval =
  deviceState === "active"
  && stepDelta > 0
  && elapsedSeconds > 0
  && elapsedSeconds <= MAX_ACTIVE_INTERVAL_SECONDS
  && stepsPerMinute >= ACTIVITY_STEP_RATE_THRESHOLD_PER_MINUTE;
```

6. Always count total steps into minute buckets when `stepDelta > 0`.
7. Count active seconds and active steps only when `isActiveInterval`.
8. Split intervals across wall-clock minute buckets.

Important:

- Do not count huge stale intervals as active.
- Do not count sleep/offline state as active.
- Keep existing hourly and daily step writes.
- Postgres is the durable source for Activity reports.
- Redis is a live accelerator/counter, not the only source of truth.

### 11.1 Minute Bucket Distribution

Add helper:

`apps/server/src/modules/activity/activity-rollup.service.ts`

Functions:

```ts
type ActivityIntervalInput = {
  childId: string;
  deviceId: string;
  sourceLocationEventId: string;
  startAt: Date;
  endAt: Date;
  stepDelta: number;
  isActiveInterval: boolean;
  latitude: string | number | null;
  longitude: string | number | null;
};

export function splitActivityIntervalIntoMinuteBuckets(input: ActivityIntervalInput): ActivityMinuteBucketInput[];

export async function recordActivityInterval(input: ActivityIntervalInput, tx?: DbTransaction): Promise<void>;
```

Distribution rule:

- Split by overlap seconds with each minute.
- Allocate steps proportionally by overlap seconds.
- Ensure rounded allocated steps sum to `stepDelta`.
- `totalSteps` gets allocated steps.
- `activeSteps` gets allocated steps only if active.
- `activeSeconds` gets overlap seconds only if active.
- `sampleCount` increments by 1 per touched minute.
- Representative coordinates use latest event coordinates if present.
- `sourceLocationEventId` uses latest event id.

Upsert:

```ts
.onConflictDoUpdate({
  target: [
    childActivityMinuteBuckets.childId,
    childActivityMinuteBuckets.deviceId,
    childActivityMinuteBuckets.minuteStart,
  ],
  set: {
    totalSteps: sql`${childActivityMinuteBuckets.totalSteps} + ${allocatedTotalSteps}`,
    activeSteps: sql`${childActivityMinuteBuckets.activeSteps} + ${allocatedActiveSteps}`,
    activeSeconds: sql`${childActivityMinuteBuckets.activeSeconds} + ${allocatedActiveSeconds}`,
    sampleCount: sql`${childActivityMinuteBuckets.sampleCount} + 1`,
    representativeLatitude,
    representativeLongitude,
    sourceLocationEventId,
    updatedAt: sampleAt,
  },
})
```

### 11.2 Redis Live Counters

Redis keys:

```txt
activity:{childId}:{yyyy-mm-dd}:steps
activity:{childId}:{yyyy-mm-dd}:active_seconds
activity:{childId}:{yyyy-mm-dd}:hour:{HH}:steps
activity:{childId}:{yyyy-mm-dd}:hour:{HH}:active_seconds
```

TTL:

- Set TTL to 8 days for daily keys.
- Redis data is helpful for near-live reads but not trusted for historical reports.

Implementation:

- `recordActivityInterval` can call Redis after Postgres upsert.
- Redis failure must not fail telemetry ingest.
- Use pipelining for multi-key increments.

## 12. Activity API

Create module:

```txt
apps/server/src/modules/activity/
  activity.constants.ts
  activity.routes.ts
  activity.service.ts
  activity-rollup.service.ts
  google-geocoding.client.ts
  location-label-cache.service.ts
```

Register in:

`apps/server/src/app.ts`

```ts
import { activityRoutes } from "./modules/activity/activity.routes";

familyV1App.route("/", activityRoutes);
```

Route:

```http
GET /v1/children/{childId}/activity
```

Query:

```ts
period: "day" | "week" | "month" | "year";
startDate: "YYYY-MM-DD";
endDate: "YYYY-MM-DD";
timezone: string;
```

Validation:

- `childId` must be a UUID.
- `period` must be one of `day`, `week`, `month`, `year`.
- `startDate` and `endDate` must be valid dates.
- `endDate >= startDate`.
- `timezone` required.
- Max range:
  - Day: 1 day.
  - Week: 31 days.
  - Month: 370 days.
  - Year: 5 years.

Authorization:

- Use existing family auth middleware.
- Query child by `childId` and current `organization.id`.
- Return 404 if child is not in family.

Response:

`ChildActivityResponseDto`

## 13. Activity Aggregation Details

### 13.1 Date Handling

The mobile app sends date strings and timezone.

Server should:

- Treat `startDate` and `endDate` as local dates in the provided timezone.
- Convert to UTC boundaries for timestamp queries:
  - Start inclusive.
  - End exclusive as next local day midnight.
- Use `eventDate` for daily/date-range filters when possible.

If robust timezone utilities are not already available, add a minimal helper using JavaScript `Intl` carefully. Avoid pulling a heavy date library unless needed. If implementation gets complex, add `date-fns` and `date-fns-tz`.

### 13.2 Steps

For Day:

- Sum `child_activity_minute_buckets.total_steps` for selected date if available.
- Fallback to `child_step_counts_hourly.step_count` for the same UTC day range.

For Week/Month/Year:

- Prefer `child_activity_minute_buckets.total_steps` grouped by `event_date`.
- Fallback to `step_counts_daily` for dates where minute buckets are absent.

Avoid double-counting:

- If minute buckets exist for a date, do not add hourly/daily steps for that same date.
- If minute buckets do not exist, use existing daily/hourly source.

### 13.3 Active Time

- Sum `active_seconds`.
- Convert to minutes:

```ts
const activeMinutes = Math.round(activeSeconds / 60);
```

### 13.4 Calories

Formula:

```ts
calories = Math.round(steps * averageChildWeightKg * kcalPerKgPerStep);
```

Initial constants:

- `averageChildWeightKg = 30`
- `kcalPerKgPerStep = 0.001`

### 13.5 Goals

Goal scaling:

```ts
stepsGoal = ACTIVITY_GOALS.stepsPerDay * dayCount;
activeMinutesGoal = ACTIVITY_GOALS.activeMinutesPerDay * dayCount;
caloriesGoal = Math.round(stepsGoal * averageChildWeightKg * kcalPerKgPerStep);
```

For a custom range in Week/Month/Year mode, `dayCount` is number of inclusive dates in the range.

### 13.6 Rhythm

Always return 24 buckets:

```ts
[
  { hour: 0, label: "12 AM", steps: 0, activeMinutes: 0, isPeak: false },
  ...
  { hour: 23, label: "11 PM", steps: 0, activeMinutes: 0, isPeak: false }
]
```

Day:

- Sum each hour for that day.

Week/Month/Year:

- Aggregate by hour-of-day across every selected date.
- Example: bucket `15` is all steps from 3 PM to 3:59 PM across the range.

Peak:

- Mark the highest-step bucket as `isPeak: true`.
- If all buckets are zero, no bucket is peak.

### 13.7 Series

Return `series` for future chart use and internal summaries:

- Day:
  - One point for the day.
- Week/Month:
  - One point per date.
- Year:
  - One point per month or per date.
  - Recommended: one point per month for response size.

The first UI phase does not have to render a trends chart, but the DTO should support future charts.

## 14. Insight Rules

### 14.1 Active vs Inactive

Use:

```ts
isActive =
  steps >= stepsGoal * ACTIVITY_CLASSIFICATION.activeGoalRatio
  || comparisonPercent > 0;
```

Where comparison is against previous comparable range:

- Day: previous day.
- Week: immediately previous range with same number of days.
- Month: immediately previous range with same number of days.
- Year: immediately previous range with same number of days or previous year if exact calendar year.

### 14.2 Active Banner

Mode: `active`

Title:

```txt
{ChildFirstName} had a healthy activity day.
```

For non-day periods:

```txt
{ChildFirstName} stayed active in this period.
```

Points:

1. More active than previous comparable period.
   - Label: `More active`
   - Value: `+12% vs yesterday` or `+12% vs previous period`
2. Most active location.
   - Label: `Most active location`
   - Value: Google/cache label or fallback `Most active area`

### 14.3 Inactive Banner

Mode: `inactive`

Title:

```txt
{ChildFirstName} had a slower activity day.
```

For non-day periods:

```txt
{ChildFirstName} moved less in this period.
```

Points:

1. Least active in the last week, if selected day is the lowest step day among last 7 available days.
   - Label: `Least active`
   - Value: `in the last week`
2. Steps or decrease summary:
   - Prefer decrease summary when comparison is negative:
     - Label: `Steps decreased`
     - Value: `18% below last week`
   - Otherwise:
     - Label: `Steps recorded`
     - Value: `2,143 steps`

Exactly two points must always be returned.

## 15. Location Labeling And Google Geocoding

Do not reverse geocode on every location sample.

Do reverse geocoding only when Activity analytics needs a label.

Flow:

1. Activity service finds most active bucket.
2. Get representative lat/lng from `child_activity_minute_buckets`.
3. Round lat/lng to 4 decimals.
4. Query `activity_location_label_cache`.
5. If valid cache exists:
   - Update `lastUsedAt`.
   - Return cached label.
6. If cache miss and `GOOGLE_GEOCODING_API_KEY` exists:
   - Call Google reverse geocoding API.
   - Extract a short display label.
   - Save to cache with 90-day expiry.
7. If Google unavailable/fails:
   - Return fallback `Most active area`.

Create:

`apps/server/src/modules/activity/google-geocoding.client.ts`

Responsibilities:

- Build request URL.
- Use `env.GOOGLE_GEOCODING_API_KEY`.
- Timeout request.
- Return structured result:

```ts
type ReverseGeocodeResult = {
  displayLabel: string;
  formattedAddress: string | null;
};
```

Label extraction preference:

1. Premise/point of interest if present.
2. Neighborhood/sublocality.
3. Locality.
4. Formatted address first meaningful segment.
5. `Most active area`.

Create:

`apps/server/src/modules/activity/location-label-cache.service.ts`

Functions:

```ts
export async function getCachedActivityLocationLabel(input): Promise<string | null>;
export async function resolveActivityLocationLabel(input): Promise<string>;
```

## 16. Mobile API Client And Query Layer

Update:

`apps/mobile/src/lib/api-client.ts`

Add:

```ts
export function getChildActivity(
  childId: string,
  input: {
    period: ActivityPeriod;
    startDate: string;
    endDate: string;
    timezone: string;
  },
  options?: ApiRequestOptions,
) {
  const search = new URLSearchParams({
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: input.timezone,
  });

  return apiRequest<ChildActivityResponseDto>(
    `/v1/children/${childId}/activity?${search.toString()}`,
    undefined,
    options,
  );
}
```

Update:

`apps/mobile/src/query/query-keys.ts`

Add:

```ts
childActivity: (
  childId: string,
  period: string,
  startDate: string,
  endDate: string,
  timezone: string,
) => ["child-activity", childId, period, startDate, endDate, timezone] as const,
```

Update:

`apps/mobile/src/query/hooks.ts`

Add:

```ts
export function useChildActivityQuery(input: {
  childId: string | null;
  period: ActivityPeriod;
  startDate: string;
  endDate: string;
  timezone: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: input.childId
      ? queryKeys.childActivity(input.childId, input.period, input.startDate, input.endDate, input.timezone)
      : ["child-activity", "disabled"] as const,
    queryFn: ({ signal }) => {
      if (!input.childId) {
        throw new Error("Activity requested without a child id.");
      }

      if (DEV_STUB_MODE) {
        return getStubChildActivity(input);
      }

      return getChildActivity(input.childId, input, {
        operationName: "getChildActivity",
        signal,
      });
    },
    enabled: Boolean(input.childId) && (input.enabled ?? true),
  });
}
```

## 17. Mobile UI File Structure

Create:

```txt
apps/mobile/src/features/activity/
  activity-constants.ts
  activity-date.ts
  activity-stub-data.ts
  activity-screen.tsx
  activity-header.tsx
  activity-period-tabs.tsx
  activity-date-range-control.tsx
  activity-date-range-sheet.tsx
  activity-insight-banner.tsx
  activity-metric-rings.tsx
  activity-metric-ring.tsx
  activity-rhythm-chart.tsx
  activity-loading-state.tsx
  activity-empty-state.tsx
```

Route:

`apps/mobile/src/app/(app)/(tabs)/activity.tsx`

Should only wire theme transition and render `ActivityScreen`.

## 18. Activity Screen State

State:

```ts
const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
const [period, setPeriod] = useState<ActivityPeriod>("day");
const [range, setRange] = useState<ActivityDateRange>(() => getDefaultActivityRange("day"));
const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
```

Derived:

- Children from `useOverviewQuery`.
- Selected child uses:
  1. explicit `selectedChildId`
  2. overview selected child
  3. first child
- Timezone:
  - Use `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - fallback `Asia/Kolkata` if unavailable.

Period change behavior:

- When period changes, reset to default range for that period based on today.
- Day: today.
- Week: current week or last 7 days. Recommended for custom range sheet: current date through today if future blocked.
- Month: current calendar month to today.
- Year: current calendar year to today.

Arrow behavior:

- Previous arrow shifts selected range backward by same day count.
- Next arrow shifts forward by same day count, clamped to today.

## 19. Detailed UI Layout

### 19.1 Screen Container

Use:

- `SafeAreaView edges={["top"]}`
- `StatusBar`
- `ScrollView`
- `contentContainerStyle` padding bottom enough for native tab bar.

Top structure:

```tsx
<SafeAreaView edges={["top"]} style={styles.safeArea}>
  <StatusBar ... />
  <View style={styles.topBarBand}>
    <AppTopBar ... />
    <ChildCarousel ... />
  </View>
  <ScrollView ...>
    <ActivityHeader />
    <ActivityPeriodTabs />
    <ActivityDateRangeControl />
    <ActivityInsightBanner />
    <ActivityMetricRings />
    <ActivityRhythmChart />
  </ScrollView>
  <ActivityDateRangeSheet />
</SafeAreaView>
```

Top bar band:

- White surface.
- Border bottom using `theme.colors.chrome.topBarBorder`.
- Padding top consistent with Home.
- Child carousel horizontal scroll under AppTopBar.

### 19.2 Activity Header

Component:

`ActivityHeader`

Content:

- Title `Activity`
- No subtitle by default.
- No Share Report action.

Style:

- Horizontal padding `theme.spacing[5]`.
- Top margin `theme.spacing[4]`.
- Title uses display family.
- Font size around 28 if screen width supports; otherwise 24.
- Text color `theme.colors.text`.

### 19.3 Period Tabs

Component:

`ActivityPeriodTabs`

Props:

```ts
type ActivityPeriodTabsProps = {
  value: ActivityPeriod;
  onChange: (period: ActivityPeriod) => void;
};
```

Layout:

- Full-width segmented control.
- Four equal tabs.
- Height 48.
- Radius 14 or local pill radius.
- Background `theme.colors.surfaceMuted`.
- Active segment green.
- Active text white.
- Inactive text `theme.colors.textSecondary`.

Accessibility:

- Each tab is a button.
- Selected tab has `accessibilityState={{ selected: true }}`.

### 19.4 Date Range Control

Component:

`ActivityDateRangeControl`

Props:

```ts
type ActivityDateRangeControlProps = {
  label: string;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOpenSheet: () => void;
};
```

Layout:

- Row with three controls:
  - Left icon button.
  - Center pressable pill.
  - Right icon button.
- No standalone calendar icon.
- Center pill consumes remaining width.
- Height 54.
- Border color `theme.colors.chrome.cardBorder`.

Center label examples:

- Day: `Monday, 15 June`
- Week: `10 Jun - 16 Jun`
- Month: `1 Jun - 30 Jun`
- Year: `1 Jan - 31 Dec 2026`

### 19.5 Date Range Sheet

Component:

`ActivityDateRangeSheet`

Use React Native `Modal` similar to `ShareDurationSheet`.

Props:

```ts
type ActivityDateRangeSheetProps = {
  visible: boolean;
  period: ActivityPeriod;
  value: ActivityDateRange;
  maximumDate: Date;
  onApply: (range: ActivityDateRange) => void;
  onClose: () => void;
};
```

UI:

- Scrim.
- Bottom sheet.
- Header row:
  - Title: `Select date` or `Select range`
  - Close button.
- Period label chip.
- Calendar/month grid.
- For Day:
  - Selecting a date immediately updates local draft.
  - Apply button confirms.
- For Week/Month/Year:
  - Show start and end fields.
  - User selects start then end.
  - Start/end fields indicate which side is active.
  - Apply disabled until valid.

Validation:

- End must be on/after start.
- End cannot be future.
- Range must respect API max range.
- For invalid range, show compact inline error.

Minimum first pass calendar:

- Month grid for current visible month.
- Previous/next month controls.
- No external calendar dependency.
- Keep visuals simple and stable.

### 19.6 Insight Banner

Component:

`ActivityInsightBanner`

Props:

```ts
type ActivityInsightBannerProps = {
  banner: ActivityInsightBannerDto;
};
```

Layout:

- Full-width card.
- Height approximately 148 on regular phone widths.
- Green/yellow tinted background by mode.
- Left side:
  - Title.
  - Two point columns/rows.
- Right side:
  - `thumbnail.webp`.
  - Image width around 118.
  - Image aligns bottom/right.

Responsive:

- If width is narrow, points stack vertically.
- Image can shrink to 96 width.
- Text must never overlap image.

Colors:

- Active:
  - background soft green.
  - title dark text.
  - point one green.
  - point two blue.
- Inactive:
  - background soft yellow.
  - title dark text.
  - point one yellow/orange.
  - point two dark text or orange.

### 19.7 Metric Rings

Component:

`ActivityMetricRings`

Props:

```ts
type ActivityMetricRingsProps = {
  metrics: ActivityMetricDto[];
};
```

Layout:

- One card containing three rings.
- Three equal columns.
- Card padding 16.
- Gap 10-12.
- No nested cards.

Each ring:

- Icon at top or center.
- Donut ring.
- Center value:
  - Steps: `8,421`
  - Active Time: `2h 14m`
  - Calories: `312`
- Unit label below value.
- Goal below ring:
  - `Goal: 8,000`
  - `Goal: 2h`
  - `Goal: 240 kcal`
- Percent badge:
  - `105%`
  - Uses metric tone.

Ring colors:

- Steps: green.
- Active Time: blue.
- Calories: orange.
- Remainder: muted surface.

Victory implementation:

- Data shape per ring:

```ts
[
  { key: "complete", value: Math.min(percentOfGoal, 150) },
  { key: "remaining", value: Math.max(150 - Math.min(percentOfGoal, 150), 0) }
]
```

If using SVG fallback:

- Use circle stroke dash arrays.
- Keep same component API.

### 19.8 Activity Rhythm Chart

Component:

`ActivityRhythmChart`

Props:

```ts
type ActivityRhythmChartProps = {
  buckets: ActivityHourlyBucketDto[];
};
```

Layout:

- White card.
- Header row:
  - Title `Activity Rhythm`
  - Optional small info icon, no explanatory in-app text.
- Chart height 156.
- X-axis labels at:
  - 12 AM
  - 6 AM
  - 12 PM
  - 6 PM
  - 11 PM

Bar behavior:

- Normal bars: light blue.
- Peak bar: green.
- Zero bars still render as tiny baseline markers.
- Tooltip on press/drag:
  - `5 PM - 6 PM`
  - `Most active period`
  - `{steps} steps`

If Victory tooltip adds too much complexity in first pass:

- Implement selected bar state on press.
- Render a small callout above selected/peak bar.

Empty rhythm:

- Render 24 faint bars.
- Show small centered copy: `No movement recorded`.

## 20. Stub Data

Create:

`apps/mobile/src/features/activity/activity-stub-data.ts`

Function:

```ts
export async function getStubChildActivity(input: {
  childId: string;
  period: ActivityPeriod;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<ChildActivityResponseDto>
```

Rules:

- Deterministic by `childId + period + startDate + endDate`.
- Generate plausible hourly rhythm.
- For some dates generate active mode; for others inactive mode.
- Always return exactly three metrics.
- Always return 24 rhythm buckets.
- Ensure Week/Month/Year aggregate values scale with range.

Useful test scenarios:

- High active day.
- Low inactive day.
- No-data day.
- Large year range.

## 21. Navigation Enablement

Update:

`apps/mobile/src/app/(app)/(tabs)/_layout.tsx`

Remove `disabled` from Activity trigger:

```tsx
<NativeTabs.Trigger name="activity" disablePopToTop rippleColor={theme.colors.navRipple}>
```

Update if still relevant:

`apps/mobile/src/components/navigation/bottom-navigation-bar.tsx`

Change:

```ts
{ href: "/activity", icon: "activity", label: "Activity", enabled: true }
```

Logs can remain disabled.

## 22. Server File-Level Plan

Add:

```txt
apps/server/src/modules/activity/activity.constants.ts
apps/server/src/modules/activity/activity.routes.ts
apps/server/src/modules/activity/activity.service.ts
apps/server/src/modules/activity/activity-rollup.service.ts
apps/server/src/modules/activity/google-geocoding.client.ts
apps/server/src/modules/activity/location-label-cache.service.ts
apps/server/src/infrastructure/redis.ts
```

Modify:

```txt
apps/server/src/app.ts
apps/server/src/config/env.ts
apps/server/src/db/schema/core.ts
apps/server/src/db/schema/index.ts
apps/server/src/modules/telemetry/telemetry.service.ts
apps/server/src/openapi/schemas.ts
apps/server/.env.example
apps/server/package.json
```

Add migration under:

```txt
apps/server/drizzle/
```

## 23. Mobile File-Level Plan

Add:

```txt
apps/mobile/src/features/activity/activity-constants.ts
apps/mobile/src/features/activity/activity-date.ts
apps/mobile/src/features/activity/activity-stub-data.ts
apps/mobile/src/features/activity/activity-screen.tsx
apps/mobile/src/features/activity/activity-header.tsx
apps/mobile/src/features/activity/activity-period-tabs.tsx
apps/mobile/src/features/activity/activity-date-range-control.tsx
apps/mobile/src/features/activity/activity-date-range-sheet.tsx
apps/mobile/src/features/activity/activity-insight-banner.tsx
apps/mobile/src/features/activity/activity-metric-rings.tsx
apps/mobile/src/features/activity/activity-metric-ring.tsx
apps/mobile/src/features/activity/activity-rhythm-chart.tsx
apps/mobile/src/features/activity/activity-loading-state.tsx
apps/mobile/src/features/activity/activity-empty-state.tsx
```

Modify:

```txt
apps/mobile/src/app/(app)/(tabs)/activity.tsx
apps/mobile/src/app/(app)/(tabs)/_layout.tsx
apps/mobile/src/components/navigation/bottom-navigation-bar.tsx
apps/mobile/src/lib/api-client.ts
apps/mobile/src/query/hooks.ts
apps/mobile/src/query/query-keys.ts
apps/mobile/package.json
```

## 24. Testing Plan

Server unit tests:

- `splitActivityIntervalIntoMinuteBuckets`:
  - Single-minute interval.
  - Multi-minute interval.
  - Rounding ensures allocated steps sum to original step delta.
  - Active interval records active seconds.
  - Inactive interval records total steps but zero active seconds.
- Active threshold:
  - `50 steps/min` counts active.
  - `49 steps/min` does not.
  - `elapsedSeconds > 300` does not count active.
  - `deviceState = sleep/offline` does not count active.
- Activity API:
  - Rejects child from another organization.
  - Day response has 24 rhythm buckets.
  - Week response aggregates.
  - Month response aggregates.
  - Year response aggregates.
  - Metrics return steps, active time, calories.
- Geocoding:
  - Cache hit returns cached label.
  - Cache miss calls Google client.
  - Google failure returns fallback.

Mobile checks:

- TypeScript compiles.
- Lint passes.
- Activity tab is enabled.
- Stub mode renders full screen without server.
- API mode calls correct endpoint.
- Child carousel changes selected child and refetches.
- Day/Week/Month/Year tabs update selected period.
- Center date/range opens sheet.
- No separate calendar icon appears.
- Three rings render without text overlap.
- Activity Rhythm is the last chart.
- Small viewport layout does not overlap.

Commands:

```sh
pnpm --filter @stepwhere/server typecheck
pnpm --filter @stepwhere/server test
pnpm --filter @stepwhere/mobile lint
```

## 25. Implementation Order

1. Add shared Activity DTOs.
2. Add mobile constants and stub data.
3. Enable Activity tab.
4. Build Activity screen UI against stub data.
5. Add Victory Native and Skia.
6. Verify mobile UI in stub mode.
7. Add Docker Compose Redis plan files and server Redis infra.
8. Add database schema and migration.
9. Add active-time rollup service.
10. Integrate active-time rollup into telemetry ingest.
11. Add Activity API route/service/OpenAPI schema.
12. Add Google geocoding cache and client.
13. Wire mobile API mode.
14. Add tests.
15. Run verification commands.

## 26. Acceptance Criteria

The phase is complete when:

- Activity tab is tappable.
- Activity page uses Home-style top bar and child carousel.
- Period tabs show Day, Week, Month, Year.
- Date/range selector opens a custom sheet.
- Stub and API modes use the same DTO.
- Quick insights banner has active and inactive modes with exactly two points.
- `thumbnail.webp` is used on the banner right side.
- Main metrics are exactly three compact rings: Steps, Active Time, Calories.
- The duplicated reference metric boxes are not present.
- Activity Rhythm is the last chart.
- Redis can run locally with Docker Compose.
- Server can connect to Redis when `REDIS_URL` is set.
- Postgres stores durable activity minute buckets.
- Activity API returns real aggregated report data.
- Google geocoding is cached and not called for every location event.
- Tests and lint/typecheck pass.

