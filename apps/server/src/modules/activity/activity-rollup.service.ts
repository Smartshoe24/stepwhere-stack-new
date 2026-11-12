import { format } from "date-fns";
import type Redis from "ioredis";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { childActivityMinuteBuckets } from "../../db/schema";
import { getRedisClient } from "../../infrastructure/redis";
import { ACTIVITY_COUNTER_TTL_SECONDS } from "./activity.constants";

type DbExecutor = typeof db | any;

export type ActivityIntervalInput = {
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

type MinuteBucketRecord = {
  minuteStart: Date;
  eventDate: string;
  totalSteps: number;
  activeSteps: number;
  activeSeconds: number;
};

function getMinuteStart(date: Date) {
  const next = new Date(date);
  next.setUTCSeconds(0, 0);
  return next;
}

function getRoundedNumeric(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value).toFixed(6);
}

function distributeIntegerTotal(total: number, weights: number[]) {
  if (total <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const weightSum = weights.reduce((sum, value) => sum + value, 0);

  if (weightSum <= 0) {
    const result = new Array(weights.length).fill(0);
    result[weights.length - 1] = total;
    return result;
  }

  const raw = weights.map((weight) => (total * weight) / weightSum);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = total - floors.reduce((sum, value) => sum + value, 0);
  const ranked = raw
    .map((value, index) => ({ index, fraction: value - floors[index]! }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const entry of ranked) {
    if (remainder <= 0) {
      break;
    }

    floors[entry.index] = (floors[entry.index] ?? 0) + 1;
    remainder -= 1;
  }

  return floors;
}

export function splitActivityIntervalIntoMinuteBuckets(input: ActivityIntervalInput): MinuteBucketRecord[] {
  const totalDurationSeconds = Math.max(0, Math.floor((input.endAt.getTime() - input.startAt.getTime()) / 1000));

  if (totalDurationSeconds <= 0) {
    return [];
  }

  const segments: Array<{ minuteStart: Date; overlapSeconds: number }> = [];
  let cursor = new Date(input.startAt);

  while (cursor < input.endAt) {
    const minuteStart = getMinuteStart(cursor);
    const minuteEnd = new Date(minuteStart.getTime() + 60_000);
    const segmentEnd = minuteEnd < input.endAt ? minuteEnd : input.endAt;
    const overlapSeconds = Math.max(0, Math.floor((segmentEnd.getTime() - cursor.getTime()) / 1000));

    if (overlapSeconds > 0) {
      segments.push({ minuteStart, overlapSeconds });
    }

    cursor = segmentEnd;
  }

  if (segments.length === 0) {
    return [];
  }

  const weights = segments.map((segment) => segment.overlapSeconds);
  const distributedSteps = distributeIntegerTotal(Math.max(0, input.stepDelta), weights);

  return segments.map((segment, index) => ({
    minuteStart: segment.minuteStart,
    eventDate: format(segment.minuteStart, "yyyy-MM-dd"),
    totalSteps: distributedSteps[index] ?? 0,
    activeSteps: input.isActiveInterval ? (distributedSteps[index] ?? 0) : 0,
    activeSeconds: input.isActiveInterval ? segment.overlapSeconds : 0,
  }));
}

async function writeRedisCounters(redis: Redis | null, input: ActivityIntervalInput, buckets: MinuteBucketRecord[]) {
  if (!redis || buckets.length === 0) {
    return;
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }

    const pipeline = redis.pipeline();

    for (const bucket of buckets) {
      const dayKeyPrefix = `activity:${input.childId}:${bucket.eventDate}`;
      const hour = bucket.minuteStart.getUTCHours().toString().padStart(2, "0");

      if (bucket.totalSteps > 0) {
        pipeline.incrby(`${dayKeyPrefix}:steps`, bucket.totalSteps);
        pipeline.expire(`${dayKeyPrefix}:steps`, ACTIVITY_COUNTER_TTL_SECONDS);
        pipeline.incrby(`${dayKeyPrefix}:hour:${hour}:steps`, bucket.totalSteps);
        pipeline.expire(`${dayKeyPrefix}:hour:${hour}:steps`, ACTIVITY_COUNTER_TTL_SECONDS);
      }

      if (bucket.activeSeconds > 0) {
        pipeline.incrby(`${dayKeyPrefix}:active_seconds`, bucket.activeSeconds);
        pipeline.expire(`${dayKeyPrefix}:active_seconds`, ACTIVITY_COUNTER_TTL_SECONDS);
        pipeline.incrby(`${dayKeyPrefix}:hour:${hour}:active_seconds`, bucket.activeSeconds);
        pipeline.expire(`${dayKeyPrefix}:hour:${hour}:active_seconds`, ACTIVITY_COUNTER_TTL_SECONDS);
      }
    }

    await pipeline.exec();
  } catch (error) {
    console.warn("[activity-rollup] redis write failed", error);
  }
}

export async function recordActivityInterval(input: ActivityIntervalInput, tx: DbExecutor = db) {
  const buckets = splitActivityIntervalIntoMinuteBuckets(input);

  if (buckets.length === 0) {
    return;
  }

  const representativeLatitude = getRoundedNumeric(input.latitude);
  const representativeLongitude = getRoundedNumeric(input.longitude);

  for (const bucket of buckets) {
    await tx
      .insert(childActivityMinuteBuckets)
      .values({
        childId: input.childId,
        deviceId: input.deviceId,
        minuteStart: bucket.minuteStart,
        eventDate: bucket.eventDate,
        totalSteps: bucket.totalSteps,
        activeSteps: bucket.activeSteps,
        activeSeconds: bucket.activeSeconds,
        sampleCount: 1,
        representativeLatitude,
        representativeLongitude,
        sourceLocationEventId: input.sourceLocationEventId,
        createdAt: input.endAt,
        updatedAt: input.endAt,
      })
      .onConflictDoUpdate({
        target: [
          childActivityMinuteBuckets.childId,
          childActivityMinuteBuckets.deviceId,
          childActivityMinuteBuckets.minuteStart,
        ],
        set: {
          totalSteps: sql`${childActivityMinuteBuckets.totalSteps} + ${bucket.totalSteps}`,
          activeSteps: sql`${childActivityMinuteBuckets.activeSteps} + ${bucket.activeSteps}`,
          activeSeconds: sql`${childActivityMinuteBuckets.activeSeconds} + ${bucket.activeSeconds}`,
          sampleCount: sql`${childActivityMinuteBuckets.sampleCount} + 1`,
          representativeLatitude,
          representativeLongitude,
          sourceLocationEventId: input.sourceLocationEventId,
          updatedAt: input.endAt,
        },
      });
  }

  void writeRedisCounters(getRedisClient(), input, buckets);
}

export async function getLatestRepresentativeCoordinates(childId: string, tx: DbExecutor = db) {
  const [row] = await tx
    .select({
      representativeLatitude: childActivityMinuteBuckets.representativeLatitude,
      representativeLongitude: childActivityMinuteBuckets.representativeLongitude,
    })
    .from(childActivityMinuteBuckets)
    .where(and(
      eq(childActivityMinuteBuckets.childId, childId),
      sql`${childActivityMinuteBuckets.representativeLatitude} IS NOT NULL`,
      sql`${childActivityMinuteBuckets.representativeLongitude} IS NOT NULL`,
    ))
    .orderBy(sql`${childActivityMinuteBuckets.minuteStart} DESC`)
    .limit(1);

  return row ?? null;
}
