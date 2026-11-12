import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { and, asc, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type {
  ActivityHourlyBucketDto,
  ActivityMetricDto,
  ActivityPeriod,
  ActivitySeriesPointDto,
  ChildActivityResponseDto,
} from "@stepwhere/types";

import { db } from "../../db/client";
import {
  childActivityMinuteBuckets,
  childStatusSnapshots,
  childStepCountsHourly,
  stepCountsDaily,
} from "../../db/schema";
import { badRequest } from "../../shared/errors";
import { getChildForOrganization } from "../children/children.service";
import { readCurrentStepsToday } from "../telemetry/steps-today";
import { ACTIVITY_CLASSIFICATION, ACTIVITY_GOALS, CALORIE_ESTIMATE } from "./activity.constants";
import { resolveActivityLocationLabel } from "./location-label-cache.service";
import { childHasCoverage, coveragePredicate } from "../billing/billing-coverage.service";

type ActivityQueryInput = {
  period: ActivityPeriod;
  startDate: string;
  endDate: string;
  timezone: string;
};

type AggregatedActivity = {
  activeMinutes: number;
  rhythm: ActivityHourlyBucketDto[];
  series: ActivitySeriesPointDto[];
  steps: number;
};

const HOUR_LABELS = [
  "12 AM",
  "1 AM",
  "2 AM",
  "3 AM",
  "4 AM",
  "5 AM",
  "6 AM",
  "7 AM",
  "8 AM",
  "9 AM",
  "10 AM",
  "11 AM",
  "12 PM",
  "1 PM",
  "2 PM",
  "3 PM",
  "4 PM",
  "5 PM",
  "6 PM",
  "7 PM",
  "8 PM",
  "9 PM",
  "10 PM",
  "11 PM",
] as const;

function getDayCount(startDate: string, endDate: string) {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

function assertValidActivityRange(input: ActivityQueryInput) {
  const startDate = parseISO(input.startDate);
  const endDate = parseISO(input.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw badRequest("Invalid activity range.");
  }

  if (endDate < startDate) {
    throw badRequest("Activity end date must be on or after start date.");
  }

  const dayCount = getDayCount(input.startDate, input.endDate);

  if (input.period === "day" && dayCount !== 1) {
    throw badRequest("Day activity requires a single selected day.");
  }

  if (input.period === "week" && dayCount > 31) {
    throw badRequest("Week activity range cannot exceed 31 days.");
  }

  if (input.period === "month" && dayCount > 370) {
    throw badRequest("Month activity range cannot exceed 370 days.");
  }

  if (input.period === "year" && dayCount > (5 * 366)) {
    throw badRequest("Year activity range cannot exceed 5 years.");
  }
}

function buildUtcRange(input: ActivityQueryInput) {
  const startUtc = fromZonedTime(`${input.startDate}T00:00:00`, input.timezone);
  const endDateExclusive = format(addDays(parseISO(input.endDate), 1), "yyyy-MM-dd");
  const endUtcExclusive = fromZonedTime(`${endDateExclusive}T00:00:00`, input.timezone);

  return {
    startUtc,
    endUtcExclusive,
  };
}

function buildRangeLabel(input: ActivityQueryInput) {
  if (input.period === "day") {
    return formatInTimeZone(buildUtcRange(input).startUtc, input.timezone, "EEEE, d MMMM");
  }

  if (input.period === "month") {
    const start = parseISO(input.startDate);
    const end = parseISO(input.endDate);

    if (start.getUTCDate() === 1 && addDays(end, 1).getUTCDate() === 1) {
      return formatInTimeZone(buildUtcRange(input).startUtc, input.timezone, "MMMM yyyy");
    }
  }

  if (input.period === "year") {
    const start = parseISO(input.startDate);
    const end = parseISO(input.endDate);

    if (
      start.getUTCMonth() === 0
      && start.getUTCDate() === 1
      && end.getUTCMonth() === 11
      && end.getUTCDate() === 31
      && start.getUTCFullYear() === end.getUTCFullYear()
    ) {
      return String(start.getUTCFullYear());
    }
  }

  const { startUtc, endUtcExclusive } = buildUtcRange(input);
  const rangeEnd = new Date(endUtcExclusive.getTime() - 1);

  return `${formatInTimeZone(startUtc, input.timezone, "d MMM")} - ${formatInTimeZone(rangeEnd, input.timezone, "d MMM")}`;
}

function formatMetricValue(key: ActivityMetricDto["key"], value: number) {
  if (key === "steps") {
    return Intl.NumberFormat("en-US").format(value);
  }

  if (key === "calories") {
    return Intl.NumberFormat("en-US").format(value);
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatGoalValue(unit: ActivityMetricDto["unit"], value: number) {
  if (unit === "steps") {
    return `Goal: ${Intl.NumberFormat("en-US").format(value)}`;
  }

  if (unit === "kcal") {
    return `Goal: ${Intl.NumberFormat("en-US").format(value)} kcal`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0 && minutes > 0) {
    return `Goal: ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `Goal: ${hours}h`;
  }

  return `Goal: ${minutes}m`;
}

function buildEmptyRhythm() {
  return HOUR_LABELS.map((label, hour) => ({
    hour,
    label,
    steps: 0,
    activeMinutes: 0,
    isPeak: false,
  }));
}

function buildPreviousComparableRange(input: ActivityQueryInput): ActivityQueryInput {
  const dayCount = getDayCount(input.startDate, input.endDate);
  const previousEnd = subDays(parseISO(input.startDate), 1);
  const previousStart = subDays(previousEnd, dayCount - 1);

  return {
    ...input,
    startDate: format(previousStart, "yyyy-MM-dd"),
    endDate: format(previousEnd, "yyyy-MM-dd"),
  };
}

/**
 * Reads the running daily total maintained by telemetry ingest.
 *
 * Minute and hourly aggregates lag by design — the ingest guard skips the first
 * sample after a bind or a counter reset — so for the child's current local day the
 * snapshot is the more complete number. It is only used when it is *higher* than
 * the aggregate, so this can correct an undercount without ever inventing steps.
 *
 * Returns the local date the total belongs to, so the caller can attribute it to
 * the right series point. That date comes from the device's timezone, which may not
 * match the requesting phone's.
 */
async function loadLiveStepsToday(childId: string) {
  const [snapshot] = await db
    .select({
      stepsToday: childStatusSnapshots.stepsToday,
      stepsTodayDate: childStatusSnapshots.stepsTodayDate,
      stepsTodayTimezone: childStatusSnapshots.stepsTodayTimezone,
    })
    .from(childStatusSnapshots)
    .where(eq(childStatusSnapshots.childId, childId))
    .limit(1);

  if (!snapshot) {
    return null;
  }

  const stepsToday = readCurrentStepsToday({
    stepsToday: snapshot.stepsToday,
    stepsTodayDate: snapshot.stepsTodayDate,
    stepsTodayTimezone: snapshot.stepsTodayTimezone,
  });

  if (stepsToday === null || !snapshot.stepsTodayDate) {
    return null;
  }

  return {
    stepsToday,
    localDate: snapshot.stepsTodayDate,
  };
}

/** True when the requested range covers the requester's current local day. */
function isTodayRange(input: ActivityQueryInput) {
  const today = formatInTimeZone(new Date(), input.timezone, "yyyy-MM-dd");

  return input.startDate <= today && today <= input.endDate;
}

/**
 * `stepsRestricted` is true only when billing is enforced and the child is not
 * covered now. Covered children (and every child with enforcement off) read the
 * same step sources; the per-bucket coverage predicate still hides any unpaid
 * gap in their past, and is a no-op with enforcement off.
 */
async function loadAggregatedActivity(childId: string, input: ActivityQueryInput, organizationId: string, stepsRestricted: boolean): Promise<AggregatedActivity> {
  const { startUtc, endUtcExclusive } = buildUtcRange(input);
  const hourlyRows = await db
    .select({
      bucketStart: childStepCountsHourly.bucketStart,
      stepCount: childStepCountsHourly.stepCount,
    })
    .from(childStepCountsHourly)
    .where(and(
      eq(childStepCountsHourly.childId, childId),
      coveragePredicate(organizationId, childStepCountsHourly.deviceId, childStepCountsHourly.bucketStart, sql`${childStepCountsHourly.bucketStart} + interval '1 hour' - interval '1 microsecond'`),
      gte(childStepCountsHourly.bucketStart, startUtc),
      lt(childStepCountsHourly.bucketStart, endUtcExclusive),
    ))
    .orderBy(asc(childStepCountsHourly.bucketStart));

  const fallbackDailyRows = hourlyRows.length === 0 && !stepsRestricted
    ? await db
      .select({
        eventDate: stepCountsDaily.eventDate,
        stepCount: stepCountsDaily.stepCount,
      })
      .from(stepCountsDaily)
      .where(and(
        eq(stepCountsDaily.childId, childId),
        // A daily total is shown only when its whole local day was covered.
        coveragePredicate(
          organizationId,
          stepCountsDaily.deviceId,
          sql`(${stepCountsDaily.eventDate}::timestamp at time zone ${input.timezone})`,
          sql`((${stepCountsDaily.eventDate}::timestamp + interval '1 day') at time zone ${input.timezone}) - interval '1 microsecond'`,
        ),
        gte(stepCountsDaily.eventDate, input.startDate),
        lt(stepCountsDaily.eventDate, format(addDays(parseISO(input.endDate), 1), "yyyy-MM-dd")),
      ))
      .orderBy(asc(stepCountsDaily.eventDate))
    : [];

  /*
   * One grouped read, folded into per-day and per-hour totals in JS.
   *
   * This replaced two hand-written `db.execute(sql...)` queries. Two things went
   * wrong with those, worth recording so they are not reintroduced:
   *
   * 1. Raw `db.execute` routes through postgres.js `unsafe()`, which disables
   *    prepared statements. Without a type descriptor a `Date` bind is stringified
   *    via `Buffer.byteLength` and throws `ERR_INVALID_ARG_TYPE`. The query builder
   *    applies the column's timestamptz mapper, so Dates bind correctly.
   * 2. Repeating a `sql` expression in both `select` and `groupBy` emits it twice
   *    with *differently qualified* column references, so Postgres does not treat
   *    them as the same expression and rejects it with 42803. Aliasing the
   *    expressions in a subquery and grouping by the alias avoids that entirely.
   *
   * Grouping by (local date, local hour) is the finest granularity either consumer
   * needs, so the daily series and hourly rhythm are both derived from this single
   * result rather than issuing a query each.
   */
  const bucketsByLocalTime = db
    .select({
      localDate: sql<string>`to_char((${childActivityMinuteBuckets.minuteStart} at time zone ${input.timezone})::date, 'YYYY-MM-DD')`.as("local_date"),
      localHour: sql<number>`extract(hour from (${childActivityMinuteBuckets.minuteStart} at time zone ${input.timezone}))::int`.as("local_hour"),
      activeSeconds: childActivityMinuteBuckets.activeSeconds,
      totalSteps: childActivityMinuteBuckets.totalSteps,
    })
    .from(childActivityMinuteBuckets)
    .where(and(
      eq(childActivityMinuteBuckets.childId, childId),
      coveragePredicate(organizationId, childActivityMinuteBuckets.deviceId, childActivityMinuteBuckets.minuteStart, sql`${childActivityMinuteBuckets.minuteStart} + interval '1 minute' - interval '1 microsecond'`),
      gte(childActivityMinuteBuckets.minuteStart, startUtc),
      lt(childActivityMinuteBuckets.minuteStart, endUtcExclusive),
    ))
    .as("buckets");

  const minuteRows = await db
    .select({
      localDate: bucketsByLocalTime.localDate,
      localHour: bucketsByLocalTime.localHour,
      activeSeconds: sql<number>`coalesce(sum(${bucketsByLocalTime.activeSeconds}), 0)::int`,
      steps: sql<number>`coalesce(sum(${bucketsByLocalTime.totalSteps}), 0)::int`,
    })
    .from(bucketsByLocalTime)
    .groupBy(bucketsByLocalTime.localDate, bucketsByLocalTime.localHour)
    .orderBy(asc(bucketsByLocalTime.localDate), asc(bucketsByLocalTime.localHour));

  // Accumulate seconds and round once at the end. Rounding per group first (as the
  // old queries did) let the daily series and the hourly rhythm disagree on totals.
  const activeSecondsByDate = new Map<string, number>();
  const activeSecondsByHour = new Map<number, number>();
  const minuteStepsByHour = new Map<number, number>();

  for (const row of minuteRows) {
    const localDate = row.localDate;
    const localHour = Number(row.localHour);
    const activeSeconds = Number(row.activeSeconds);
    const steps = Number(row.steps);

    activeSecondsByDate.set(localDate, (activeSecondsByDate.get(localDate) ?? 0) + activeSeconds);
    activeSecondsByHour.set(localHour, (activeSecondsByHour.get(localHour) ?? 0) + activeSeconds);
    minuteStepsByHour.set(localHour, (minuteStepsByHour.get(localHour) ?? 0) + steps);
  }

  const stepsByDate = new Map<string, number>();
  const stepsByHour = new Map<number, number>();

  if (stepsRestricted) {
    // Uncovered child: only minute-level data from past covered intervals.
    // Daily and hour totals can include samples from unpaid boundary minutes.
    for (const row of minuteRows) {
      stepsByDate.set(row.localDate, (stepsByDate.get(row.localDate) ?? 0) + Number(row.steps));
      stepsByHour.set(Number(row.localHour), (stepsByHour.get(Number(row.localHour)) ?? 0) + Number(row.steps));
    }
  } else if (hourlyRows.length > 0) {
    for (const row of hourlyRows) {
      const localDate = formatInTimeZone(row.bucketStart, input.timezone, "yyyy-MM-dd");
      const localHour = Number(formatInTimeZone(row.bucketStart, input.timezone, "H"));

      stepsByDate.set(localDate, (stepsByDate.get(localDate) ?? 0) + row.stepCount);
      stepsByHour.set(localHour, (stepsByHour.get(localHour) ?? 0) + row.stepCount);
    }
  } else {
    for (const row of fallbackDailyRows) {
      stepsByDate.set(row.eventDate, (stepsByDate.get(row.eventDate) ?? 0) + row.stepCount);
    }
  }

  const activeMinutesByDate = new Map<string, number>();
  const activeMinutesByHour = new Map<number, number>();

  for (const [localDate, seconds] of activeSecondsByDate) {
    activeMinutesByDate.set(localDate, Math.round(seconds / 60));
  }

  for (const [localHour, seconds] of activeSecondsByHour) {
    activeMinutesByHour.set(localHour, Math.round(seconds / 60));
  }

  // Minute buckets only backfill an hour the hourly table has no entry for; hourly
  // is authoritative for steps because it also captures the first sample after a
  // bind or counter reset, which minute buckets skip.
  for (const [localHour, steps] of minuteStepsByHour) {
    if (!stepsByHour.has(localHour)) {
      stepsByHour.set(localHour, steps);
    }
  }

  const dayCount = getDayCount(input.startDate, input.endDate);
  const series: ActivitySeriesPointDto[] = [];
  let totalSteps = 0;
  let totalActiveMinutes = 0;

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(parseISO(input.startDate), offset);
    const dateKey = format(date, "yyyy-MM-dd");
    const steps = stepsByDate.get(dateKey) ?? 0;
    const activeMinutes = activeMinutesByDate.get(dateKey) ?? 0;
    const calories = Math.round(steps * CALORIE_ESTIMATE.averageChildWeightKg * CALORIE_ESTIMATE.kcalPerKgPerStep);

    totalSteps += steps;
    totalActiveMinutes += activeMinutes;
    series.push({
      date: dateKey,
      label: input.period === "year"
        ? format(date, "MMM")
        : format(date, "d MMM"),
      steps,
      activeMinutes,
      calories,
    });
  }

  const rhythm = buildEmptyRhythm().map((bucket) => ({
    ...bucket,
    steps: stepsByHour.get(bucket.hour) ?? 0,
    activeMinutes: activeMinutesByHour.get(bucket.hour) ?? 0,
  }));
  const peakSteps = Math.max(...rhythm.map((bucket) => bucket.steps), 0);
  const peakHour = peakSteps > 0 ? rhythm.find((bucket) => bucket.steps === peakSteps)?.hour ?? null : null;

  return {
    steps: totalSteps,
    activeMinutes: totalActiveMinutes,
    rhythm: rhythm.map((bucket) => ({
      ...bucket,
      isPeak: peakHour !== null && bucket.hour === peakHour,
    })),
    series,
  };
}

/**
 * Lifts today's step figures to the live running total when the aggregate is behind.
 *
 * Applied to both the range total and today's series point so the metric cards and
 * the daily chart agree. Never lowers a value: the aggregate is authoritative for
 * anything the snapshot cannot see.
 */
function applyLiveStepsToday(input: {
  aggregated: AggregatedActivity;
  liveStepsToday: number | null;
  todayDateKey: string;
}): AggregatedActivity {
  if (input.liveStepsToday === null) {
    return input.aggregated;
  }

  const todayPoint = input.aggregated.series.find(
    (point) => point.date === input.todayDateKey,
  );

  if (!todayPoint) {
    return input.aggregated;
  }

  const additionalSteps = input.liveStepsToday - todayPoint.steps;

  if (additionalSteps <= 0) {
    return input.aggregated;
  }

  return {
    ...input.aggregated,
    steps: input.aggregated.steps + additionalSteps,
    series: input.aggregated.series.map((point) => (
      point.date === input.todayDateKey
        ? {
          ...point,
          steps: input.liveStepsToday!,
          calories: Math.round(
            input.liveStepsToday!
            * CALORIE_ESTIMATE.averageChildWeightKg
            * CALORIE_ESTIMATE.kcalPerKgPerStep,
          ),
        }
        : point
    )),
  };
}

/** Exported for tests; the reconciliation rule is easy to get subtly wrong. */
export const applyLiveStepsTodayForTest = applyLiveStepsToday;

async function loadMostActiveLocationLabel(childId: string, input: ActivityQueryInput, organizationId: string) {
  const { startUtc, endUtcExclusive } = buildUtcRange(input);
  // Query builder for the same reason as above: raw `db.execute` cannot bind Dates.
  const [topRow] = await db
    .select({
      latitude: childActivityMinuteBuckets.representativeLatitude,
      longitude: childActivityMinuteBuckets.representativeLongitude,
    })
    .from(childActivityMinuteBuckets)
    .where(and(
      eq(childActivityMinuteBuckets.childId, childId),
      coveragePredicate(organizationId, childActivityMinuteBuckets.deviceId, childActivityMinuteBuckets.minuteStart, sql`${childActivityMinuteBuckets.minuteStart} + interval '1 minute' - interval '1 microsecond'`),
      gte(childActivityMinuteBuckets.minuteStart, startUtc),
      lt(childActivityMinuteBuckets.minuteStart, endUtcExclusive),
      isNotNull(childActivityMinuteBuckets.representativeLatitude),
      isNotNull(childActivityMinuteBuckets.representativeLongitude),
    ))
    .orderBy(
      desc(childActivityMinuteBuckets.totalSteps),
      desc(childActivityMinuteBuckets.activeSeconds),
      desc(childActivityMinuteBuckets.minuteStart),
    )
    .limit(1);

  return resolveActivityLocationLabel({
    latitude: topRow?.latitude ? Number(topRow.latitude) : null,
    longitude: topRow?.longitude ? Number(topRow.longitude) : null,
  });
}

function toComparisonPercent(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? 100 : null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function buildMetrics(
  input: ActivityQueryInput,
  current: AggregatedActivity,
  previous: AggregatedActivity,
): ActivityMetricDto[] {
  const dayCount = getDayCount(input.startDate, input.endDate);
  const stepsGoal = ACTIVITY_GOALS.stepsPerDay * dayCount;
  const activeGoal = ACTIVITY_GOALS.activeMinutesPerDay * dayCount;
  const calories = Math.round(current.steps * CALORIE_ESTIMATE.averageChildWeightKg * CALORIE_ESTIMATE.kcalPerKgPerStep);
  const caloriesGoal = Math.round(stepsGoal * CALORIE_ESTIMATE.averageChildWeightKg * CALORIE_ESTIMATE.kcalPerKgPerStep);
  const stepsComparison = toComparisonPercent(current.steps, previous.steps);
  const activeComparison = toComparisonPercent(current.activeMinutes, previous.activeMinutes);
  const previousCalories = Math.round(previous.steps * CALORIE_ESTIMATE.averageChildWeightKg * CALORIE_ESTIMATE.kcalPerKgPerStep);
  const caloriesComparison = toComparisonPercent(calories, previousCalories);

  return [
    {
      key: "steps",
      label: "Steps",
      value: current.steps,
      formattedValue: formatMetricValue("steps", current.steps),
      unit: "steps",
      goalValue: stepsGoal,
      formattedGoal: formatGoalValue("steps", stepsGoal),
      percentOfGoal: stepsGoal > 0 ? Math.round((current.steps / stepsGoal) * 100) : 0,
      comparisonPercent: stepsComparison,
      tone: "green",
    },
    {
      key: "activeTime",
      label: "Active Time",
      value: current.activeMinutes,
      formattedValue: formatMetricValue("activeTime", current.activeMinutes),
      unit: "min",
      goalValue: activeGoal,
      formattedGoal: formatGoalValue("min", activeGoal),
      percentOfGoal: activeGoal > 0 ? Math.round((current.activeMinutes / activeGoal) * 100) : 0,
      comparisonPercent: activeComparison,
      tone: "blue",
    },
    {
      key: "calories",
      label: "Calories",
      value: calories,
      formattedValue: formatMetricValue("calories", calories),
      unit: "kcal",
      goalValue: caloriesGoal,
      formattedGoal: formatGoalValue("kcal", caloriesGoal),
      percentOfGoal: caloriesGoal > 0 ? Math.round((calories / caloriesGoal) * 100) : 0,
      comparisonPercent: caloriesComparison,
      tone: "orange",
    },
  ];
}

function buildInsightTitle(childName: string, isActive: boolean, period: ActivityPeriod) {
  const firstName = childName.split(/\s+/)[0] ?? childName;

  if (isActive) {
    return period === "day"
      ? `${firstName} had an active day today.`
      : `${firstName} stayed active this period.`;
  }

  return period === "day"
    ? `${firstName} had a slower day today.`
    : `${firstName} moved less this period.`;
}

function isLeastActiveInLastWeek(series: ActivitySeriesPointDto[], selectedSteps: number) {
  if (series.length === 0) {
    return false;
  }

  const recent = series.slice(-7);
  const minimum = Math.min(...recent.map((item) => item.steps));

  return recent.length > 0 && selectedSteps === minimum && minimum < Math.max(...recent.map((item) => item.steps));
}

export async function getChildActivityForOrganization(
  organizationId: string,
  childId: string,
  input: ActivityQueryInput,
): Promise<ChildActivityResponseDto> {
  assertValidActivityRange(input);

  const child = await getChildForOrganization(organizationId, childId);
  const isLive = isTodayRange(input);
  // Same coverage check as the live/share/trail gates (always true with
  // enforcement off).
  const stepsRestricted = !await childHasCoverage(organizationId, childId);
  const aggregated = await loadAggregatedActivity(childId, input, organizationId, stepsRestricted);
  // Only the child's current local day can be behind the snapshot; historical
  // ranges are fully materialised. The live total carries its own local date,
  // resolved in the device's timezone, so it is attributed to the correct series
  // point even when the parent's phone is in a different zone.
  const live = isLive && !stepsRestricted ? await loadLiveStepsToday(childId) : null;
  const current = live
    ? applyLiveStepsToday({
      aggregated,
      liveStepsToday: live.stepsToday,
      todayDateKey: live.localDate,
    })
    : aggregated;
  const previousRange = buildPreviousComparableRange(input);
  const previous = await loadAggregatedActivity(childId, previousRange, organizationId, stepsRestricted);
  const metrics = buildMetrics(input, current, previous);
  const dayCount = getDayCount(input.startDate, input.endDate);
  const stepsGoal = ACTIVITY_GOALS.stepsPerDay * dayCount;
  const comparisonPercent = metrics[0]?.comparisonPercent ?? null;
  const activeMode = current.steps >= stepsGoal * ACTIVITY_CLASSIFICATION.activeGoalRatio || (comparisonPercent ?? 0) > 0;
  const mostActiveLocation = await loadMostActiveLocationLabel(childId, input, organizationId);
  const inactiveSecondaryValue = comparisonPercent !== null && comparisonPercent < 0
    ? `${Math.abs(comparisonPercent)}% below previous period`
    : `${Intl.NumberFormat("en-US").format(current.steps)} steps`;

  return {
    childId,
    period: input.period,
    range: {
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: input.timezone,
      label: buildRangeLabel(input),
    },
    generatedAt: new Date().toISOString(),
    insightBanner: activeMode
      ? {
        mode: "active",
        title: buildInsightTitle(child.name, true, input.period),
        points: [
          {
            id: "more-active",
            label: "More active",
            value: comparisonPercent !== null ? `${comparisonPercent > 0 ? "+" : ""}${comparisonPercent}% vs previous period` : "No previous comparison",
            tone: "green",
          },
          {
            id: "most-active-location",
            label: "Most active location",
            value: mostActiveLocation,
            tone: "blue",
          },
        ],
      }
      : {
        mode: "inactive",
        title: buildInsightTitle(child.name, false, input.period),
        points: [
          {
            id: "least-active",
            label: "Least active",
            value: isLeastActiveInLastWeek(current.series, current.steps) ? "in the last week" : "Lower than recent average",
            tone: "yellow",
          },
          {
            id: "steps-decrease",
            label: comparisonPercent !== null && comparisonPercent < 0 ? "Steps decreased" : "Steps recorded",
            value: inactiveSecondaryValue,
            tone: "yellow",
          },
        ],
      },
    metrics,
    rhythm: current.rhythm,
    series: current.series,
    isLive,
  };
}
