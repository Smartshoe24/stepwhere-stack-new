import { and, asc, desc, gte, inArray } from "drizzle-orm";
import type { AdminDeviceTelemetryReliabilityDto } from "@stepwhere/types";

import { db } from "../../db/client";
import { locationEvents } from "../../db/schema";

export const TELEMETRY_RELIABILITY_WINDOW_MINUTES = 30;
export const EXPECTED_PACKET_INTERVAL_SECONDS = 8;
export const PACKET_LATE_AT_SECONDS = 10;
export const PACKET_MISSING_AT_SECONDS = 17;

const RELIABILITY_WINDOW_MS = TELEMETRY_RELIABILITY_WINDOW_MINUTES * 60 * 1000;
const EXPECTED_PACKET_INTERVAL_MS = EXPECTED_PACKET_INTERVAL_SECONDS * 1000;

type ReliabilityDevice = {
  id: string;
  lastSeenAt: Date | null;
};

type ReliabilityEvent = {
  deviceId: string;
  deviceState: "active" | "sleep" | "offline";
  receivedAt: Date;
};

function scoreCompletedActiveIntervals(events: ReliabilityEvent[]) {
  let completedOnTimePackets = 0;
  let completedLatePackets = 0;
  let completedMissedPackets = 0;
  let lastCompletedIntervalSeconds: number | null = null;

  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];

    if (!previous || !current || previous.deviceState !== "active" || current.deviceState !== "active") {
      continue;
    }

    const intervalMs = Math.max(0, current.receivedAt.getTime() - previous.receivedAt.getTime());
    const intervalSeconds = Math.floor(intervalMs / 1000);
    lastCompletedIntervalSeconds = intervalMs / 1000;

    if (intervalSeconds < PACKET_LATE_AT_SECONDS) {
      completedOnTimePackets += 1;
      continue;
    }

    completedLatePackets += 1;

    if (intervalSeconds >= PACKET_MISSING_AT_SECONDS) {
      completedMissedPackets += Math.max(
        1,
        Math.floor(intervalMs / EXPECTED_PACKET_INTERVAL_MS) - 1,
      );
    }
  }

  return {
    completedOnTimePackets,
    completedLatePackets,
    completedMissedPackets,
    lastCompletedIntervalSeconds,
  };
}

export async function getAdminDeviceTelemetryReliability(
  devices: ReliabilityDevice[],
  now = new Date(),
) {
  const deviceIds = devices.map((device) => device.id);
  const windowStartedAt = new Date(now.getTime() - RELIABILITY_WINDOW_MS);
  const result = new Map<string, AdminDeviceTelemetryReliabilityDto>();

  if (deviceIds.length === 0) {
    return result;
  }

  const [recentEvents, latestEvents] = await Promise.all([
    db
      .select({
        deviceId: locationEvents.deviceId,
        deviceState: locationEvents.deviceState,
        receivedAt: locationEvents.ingestedAt,
      })
      .from(locationEvents)
      .where(and(
        inArray(locationEvents.deviceId, deviceIds),
        gte(locationEvents.ingestedAt, windowStartedAt),
      ))
      .orderBy(asc(locationEvents.deviceId), asc(locationEvents.ingestedAt)),
    db
      .selectDistinctOn([locationEvents.deviceId], {
        deviceId: locationEvents.deviceId,
        deviceState: locationEvents.deviceState,
        receivedAt: locationEvents.ingestedAt,
      })
      .from(locationEvents)
      .where(inArray(locationEvents.deviceId, deviceIds))
      .orderBy(locationEvents.deviceId, desc(locationEvents.ingestedAt)),
  ]);

  const eventsByDevice = new Map<string, ReliabilityEvent[]>();
  for (const event of recentEvents) {
    const events = eventsByDevice.get(event.deviceId) ?? [];
    events.push(event);
    eventsByDevice.set(event.deviceId, events);
  }

  const latestEventByDevice = new Map(
    latestEvents.map((event) => [event.deviceId, event] as const),
  );

  for (const device of devices) {
    const events = eventsByDevice.get(device.id) ?? [];
    const latestEvent = latestEventByDevice.get(device.id);
    const completed = scoreCompletedActiveIntervals(events);

    result.set(device.id, {
      windowMinutes: TELEMETRY_RELIABILITY_WINDOW_MINUTES,
      windowStartedAt: windowStartedAt.toISOString(),
      calculatedAt: now.toISOString(),
      expectedIntervalSeconds: EXPECTED_PACKET_INTERVAL_SECONDS,
      lateAtSeconds: PACKET_LATE_AT_SECONDS,
      missingAtSeconds: PACKET_MISSING_AT_SECONDS,
      latestDeviceState: latestEvent?.deviceState ?? null,
      lastPacketAt: latestEvent?.receivedAt.toISOString()
        ?? device.lastSeenAt?.toISOString()
        ?? null,
      lastCompletedIntervalSeconds: completed.lastCompletedIntervalSeconds,
      completedOnTimePackets: completed.completedOnTimePackets,
      completedLatePackets: completed.completedLatePackets,
      completedMissedPackets: completed.completedMissedPackets,
    });
  }

  return result;
}
