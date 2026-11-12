import {
  and,
  asc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../../db/client";
import {
  historyEnrichmentJobs,
  historyEvents,
  historyProcessingStates,
  locationEvents,
} from "../../db/schema";
import {
  HISTORY_ALGORITHM_VERSION,
  TELEMETRY_GAP_SECONDS,
} from "./history.constants";
import { detectHistoryEvents, type DetectedHistoryEvent } from "./history-detector";
import { distanceMeters, type HistorySample } from "./history-path";
import { resolveInitialHistoryPlace } from "./history-place.service";
import { isHistoryRoadSnappingEnabled } from "./history-roads.service";

const PROCESSING_LEASE_MILLISECONDS = 30_000;
const HISTORY_LOCATION_EVENT_BATCH_SIZE = 1_000;
const STALE_HISTORY_EVENT_BATCH_SIZE = 100;
const REENRICH_MEDOID_DISTANCE_METERS = 15;

type HistoryEventRow = typeof historyEvents.$inferSelect;

export type HistoryMaterializationResult = {
  childId: string;
  organizationId: string;
  processedThrough: Date;
};

export async function finalizeStaleOngoingHistoryEvents(
  limit = STALE_HISTORY_EVENT_BATCH_SIZE,
  now = new Date(),
): Promise<HistoryMaterializationResult[]> {
  const staleCutoff = new Date(now.getTime() - TELEMETRY_GAP_SECONDS * 1_000);
  const batchSize = Math.max(0, Math.min(limit, STALE_HISTORY_EVENT_BATCH_SIZE));

  return db.transaction(async tx => {
    const staleEvents = await tx
      .select({
        event: historyEvents,
        lastTelemetryAt: locationEvents.occurredAt,
      })
      .from(historyEvents)
      .innerJoin(locationEvents, eq(locationEvents.id, historyEvents.lastLocationEventId))
      .where(and(
        eq(historyEvents.status, "ongoing"),
        isNull(historyEvents.endedAt),
        lt(locationEvents.occurredAt, staleCutoff),
      ))
      .orderBy(asc(locationEvents.occurredAt), asc(historyEvents.id))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    const resultsByChild = new Map<string, HistoryMaterializationResult>();

    for (const { event, lastTelemetryAt } of staleEvents) {
      const [finalized] = await tx
        .update(historyEvents)
        .set({
          status: "finalized",
          endedAt: lastTelemetryAt,
          updatedAt: now,
        })
        .where(and(
          eq(historyEvents.id, event.id),
          eq(historyEvents.status, "ongoing"),
          isNull(historyEvents.endedAt),
        ))
        .returning({ id: historyEvents.id });

      if (!finalized) {
        continue;
      }

      if (event.kind === "trip") {
        await tx
          .update(historyProcessingStates)
          .set({ openTripId: null, updatedAt: now })
          .where(and(
            eq(historyProcessingStates.childId, event.childId),
            eq(historyProcessingStates.openTripId, event.id),
          ));

        if (event.tripMode === "vehicle" && isHistoryRoadSnappingEnabled()) {
          await enqueueEnrichment(tx, event.id, "roads");
        }
      } else if (event.kind === "stay") {
        await tx
          .update(historyProcessingStates)
          .set({ openStayId: null, updatedAt: now })
          .where(and(
            eq(historyProcessingStates.childId, event.childId),
            eq(historyProcessingStates.openStayId, event.id),
          ));
      }

      const previous = resultsByChild.get(event.childId);

      if (!previous || previous.processedThrough < lastTelemetryAt) {
        resultsByChild.set(event.childId, {
          childId: event.childId,
          organizationId: event.organizationId,
          processedThrough: lastTelemetryAt,
        });
      }
    }

    return [...resultsByChild.values()];
  });
}

export async function markHistoryDirty(input: {
  childId: string;
  organizationId: string;
  deviceId: string;
  locationEventId: string;
  occurredAt: Date;
}, tx: typeof db = db) {
  const occurredAtIso = input.occurredAt.toISOString();

  await tx
    .insert(historyProcessingStates)
    .values({
      childId: input.childId,
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      processingStartedAt: input.occurredAt,
      dirtyThroughLocationEventId: input.locationEventId,
      dirtyThroughAt: input.occurredAt,
      algorithmVersion: HISTORY_ALGORITHM_VERSION,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: historyProcessingStates.childId,
      set: {
        deviceId: input.deviceId,
        dirtyThroughLocationEventId: sql`
          case
            when ${historyProcessingStates.dirtyThroughAt} is null
              or (${occurredAtIso}::timestamptz, ${input.locationEventId}::uuid)
                >= (${historyProcessingStates.dirtyThroughAt}, ${historyProcessingStates.dirtyThroughLocationEventId})
            then ${input.locationEventId}::uuid
            else ${historyProcessingStates.dirtyThroughLocationEventId}
          end
        `,
        dirtyThroughAt: sql`
          greatest(
            coalesce(${historyProcessingStates.dirtyThroughAt}, ${occurredAtIso}::timestamptz),
            ${occurredAtIso}::timestamptz
          )
        `,
        updatedAt: new Date(),
      },
    });
}

export async function materializeChildHistory(
  childId: string,
): Promise<HistoryMaterializationResult | null> {
  const state = await claimHistoryProcessingState(childId);

  if (!state) {
    return null;
  }

  try {
    const newRows = await db
      .select()
      .from(locationEvents)
      .where(state.processedThroughAt && state.processedLocationEventId
        ? and(
          eq(locationEvents.childId, childId),
          ne(locationEvents.locationSource, "none"),
          or(
            gt(locationEvents.occurredAt, state.processedThroughAt),
            and(
              eq(locationEvents.occurredAt, state.processedThroughAt),
              gt(locationEvents.id, state.processedLocationEventId),
            ),
          ),
        )
        : and(
          eq(locationEvents.childId, childId),
          ne(locationEvents.locationSource, "none"),
          gte(locationEvents.occurredAt, state.processingStartedAt),
        ))
      .orderBy(asc(locationEvents.occurredAt), asc(locationEvents.id))
      .limit(HISTORY_LOCATION_EVENT_BATCH_SIZE);
    const lastRow = newRows[newRows.length - 1];
    const replaySamples = deserializeReplaySamples(state.candidateState);
    const newSamples: HistorySample[] = newRows.map(row => ({
      id: row.id,
      deviceId: row.deviceId,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyMeters: row.accuracyMeters == null ? null : Number(row.accuracyMeters),
      stepCounter: row.stepCounter,
      deviceState: row.deviceState,
      occurredAt: row.occurredAt,
    }));
    const samples = mergeReplaySamples(replaySamples, newSamples);
    const detected = detectHistoryEvents(samples);
    const nextReplaySamples = trimReplaySamples(samples, detected);
    const relevantFirstLocationEventIds = Array.from(
      new Set(detected.map(event => event.firstLocationEventId)),
    );
    const relevantExistingWhere = relevantFirstLocationEventIds.length > 0
      ? or(
        eq(historyEvents.status, "ongoing"),
        inArray(historyEvents.firstLocationEventId, relevantFirstLocationEventIds),
      )
      : eq(historyEvents.status, "ongoing");
    const existing = await db
      .select()
      .from(historyEvents)
      .where(and(
        eq(historyEvents.childId, childId),
        relevantExistingWhere,
      ))
      .orderBy(asc(historyEvents.startedAt));
    const existingByStableKey = new Map(
      existing
        .filter(event => event.firstLocationEventId)
        .map(event => [stableEventKey(event.kind, event.firstLocationEventId!), event]),
    );

    await db.transaction(async tx => {
      const retainedIds = new Set<string>();
      let openStayId: string | null = null;
      let openTripId: string | null = null;

      for (const event of detected) {
        const existingEvent = existingByStableKey.get(
          stableEventKey(event.kind, event.firstLocationEventId),
        );
        const persisted = await persistDetectedEvent({
          childId,
          event,
          existingEvent,
          organizationId: state.organizationId,
          tx,
        });

        retainedIds.add(persisted.id);

        if (event.status === "ongoing" && event.kind === "stay") {
          openStayId = persisted.id;
        } else if (event.status === "ongoing" && event.kind === "trip") {
          openTripId = persisted.id;
        }
      }

      for (const staleEvent of existing) {
        if (staleEvent.status === "ongoing" && !retainedIds.has(staleEvent.id)) {
          await tx.delete(historyEvents).where(eq(historyEvents.id, staleEvent.id));
        }
      }

      const [advancedState] = await tx
        .update(historyProcessingStates)
        .set({
          processedLocationEventId: lastRow?.id ?? state.processedLocationEventId,
          processedThroughAt: lastRow?.occurredAt ?? state.processedThroughAt,
          openStayId,
          openTripId,
          candidateState: {
            replaySamples: nextReplaySamples.map(serializeReplaySample),
          },
          isProcessing: false,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(historyProcessingStates.childId, childId),
          eq(historyProcessingStates.isProcessing, true),
          eq(historyProcessingStates.leaseExpiresAt, state.leaseExpiresAt!),
        ))
        .returning({ childId: historyProcessingStates.childId });

      if (!advancedState) {
        throw new Error("History processing lease expired before the cursor could be advanced.");
      }
    });

    return lastRow
      ? {
        childId,
        organizationId: state.organizationId,
        processedThrough: lastRow.occurredAt,
      }
      : null;
  } catch (error) {
    await db
      .update(historyProcessingStates)
      .set({
        isProcessing: false,
        leaseExpiresAt: null,
        lastError: error instanceof Error ? error.message : "History materialization failed.",
        updatedAt: new Date(),
      })
      .where(and(
        eq(historyProcessingStates.childId, childId),
        eq(historyProcessingStates.isProcessing, true),
        eq(historyProcessingStates.leaseExpiresAt, state.leaseExpiresAt!),
      ));

    throw error;
  }
}

async function persistDetectedEvent(input: {
  childId: string;
  event: DetectedHistoryEvent;
  existingEvent: HistoryEventRow | undefined;
  organizationId: string;
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  if (input.event.kind === "stay") {
    return persistStay({ ...input, event: input.event });
  }

  if (input.event.kind === "trip") {
    return persistTrip({ ...input, event: input.event });
  }

  return persistGap({ ...input, event: input.event });
}

async function persistStay(input: {
  childId: string;
  event: Extract<DetectedHistoryEvent, { kind: "stay" }>;
  existingEvent: HistoryEventRow | undefined;
  organizationId: string;
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  const movedDistance = input.existingEvent?.representativeLatitude != null
    && input.existingEvent.representativeLongitude != null
    ? distanceMeters({
      latitude: Number(input.existingEvent.representativeLatitude),
      longitude: Number(input.existingEvent.representativeLongitude),
    }, {
      latitude: input.event.representativeLatitude,
      longitude: input.event.representativeLongitude,
    })
    : 0;
  const shouldReenrich = Boolean(
    input.existingEvent
    && input.event.status === "finalized"
    && movedDistance > REENRICH_MEDOID_DISTANCE_METERS,
  );

  if (input.existingEvent) {
    const [updated] = await input.tx
      .update(historyEvents)
      .set({
        status: input.event.status,
        endedAt: input.event.endedAt,
        lastLocationEventId: input.event.lastLocationEventId,
        sampleCount: input.event.sampleCount,
        representativeLatitude: input.event.representativeLatitude.toFixed(6),
        representativeLongitude: input.event.representativeLongitude.toFixed(6),
        stayRadiusMeters: input.event.stayRadiusMeters,
        ...(shouldReenrich ? {
          placeProvider: null,
          providerPlaceId: null,
          placeMatchType: "pending" as const,
          placeDistanceMeters: null,
          placeLabel: "Pinned location",
          formattedAddress: null,
          placeContentFetchedAt: null,
          placeContentExpiresAt: null,
          placeEnrichmentStatus: "pending" as const,
        } : {}),
        updatedAt: new Date(),
      })
      .where(eq(historyEvents.id, input.existingEvent.id))
      .returning({ id: historyEvents.id });

    if (shouldReenrich) {
      await enqueueEnrichment(input.tx, input.existingEvent.id, "place", true);
    }

    return updated!;
  }

  const place = await resolveInitialHistoryPlace({
    childId: input.childId,
    latitude: input.event.representativeLatitude,
    longitude: input.event.representativeLongitude,
  });
  const [created] = await input.tx
    .insert(historyEvents)
    .values({
      organizationId: input.organizationId,
      childId: input.childId,
      deviceId: input.event.deviceId,
      kind: "stay",
      status: input.event.status,
      startedAt: input.event.startedAt,
      endedAt: input.event.endedAt,
      firstLocationEventId: input.event.firstLocationEventId,
      lastLocationEventId: input.event.lastLocationEventId,
      sampleCount: input.event.sampleCount,
      algorithmVersion: HISTORY_ALGORITHM_VERSION,
      representativeLatitude: input.event.representativeLatitude.toFixed(6),
      representativeLongitude: input.event.representativeLongitude.toFixed(6),
      stayRadiusMeters: input.event.stayRadiusMeters,
      placeProvider: place.placeProvider,
      providerPlaceId: place.providerPlaceId,
      placeMatchType: place.placeMatchType,
      placeDistanceMeters: place.placeDistanceMeters,
      placeLabel: place.placeLabel,
      formattedAddress: place.formattedAddress,
      placeEnrichmentStatus: place.placeEnrichmentStatus,
      updatedAt: new Date(),
    })
    .returning({ id: historyEvents.id });

  if (created && place.placeMatchType === "pending") {
    await enqueueEnrichment(input.tx, created.id, "place");
  }

  return created!;
}

async function persistTrip(input: {
  childId: string;
  event: Extract<DetectedHistoryEvent, { kind: "trip" }>;
  existingEvent: HistoryEventRow | undefined;
  organizationId: string;
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  const values = {
    status: input.event.status,
    endedAt: input.event.endedAt,
    lastLocationEventId: input.event.lastLocationEventId,
    sampleCount: input.event.sampleCount,
    tripMode: input.event.tripMode,
    modeConfidence: input.event.modeConfidence,
    distanceMeters: input.event.distanceMeters,
    filteredPath: input.event.filteredPath,
    updatedAt: new Date(),
  };
  const [persisted] = input.existingEvent
    ? await input.tx
      .update(historyEvents)
      .set(values)
      .where(eq(historyEvents.id, input.existingEvent.id))
      .returning({ id: historyEvents.id })
    : await input.tx
      .insert(historyEvents)
      .values({
        ...values,
        organizationId: input.organizationId,
        childId: input.childId,
        deviceId: input.event.deviceId,
        kind: "trip",
        startedAt: input.event.startedAt,
        firstLocationEventId: input.event.firstLocationEventId,
        algorithmVersion: HISTORY_ALGORITHM_VERSION,
      })
      .returning({ id: historyEvents.id });

  if (
    persisted
    && input.event.status === "finalized"
    && input.event.tripMode === "vehicle"
    && isHistoryRoadSnappingEnabled()
  ) {
    await enqueueEnrichment(input.tx, persisted.id, "roads");
  }

  return persisted!;
}

async function persistGap(input: {
  childId: string;
  event: Extract<DetectedHistoryEvent, { kind: "gap" }>;
  existingEvent: HistoryEventRow | undefined;
  organizationId: string;
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  const values = {
    endedAt: input.event.endedAt,
    lastLocationEventId: input.event.lastLocationEventId,
    gapReason: input.event.gapReason,
    gapBeforeLatitude: input.event.beforeCoordinate?.latitude.toFixed(6) ?? null,
    gapBeforeLongitude: input.event.beforeCoordinate?.longitude.toFixed(6) ?? null,
    gapAfterLatitude: input.event.afterCoordinate?.latitude.toFixed(6) ?? null,
    gapAfterLongitude: input.event.afterCoordinate?.longitude.toFixed(6) ?? null,
    updatedAt: new Date(),
  };
  const [persisted] = input.existingEvent
    ? await input.tx
      .update(historyEvents)
      .set(values)
      .where(eq(historyEvents.id, input.existingEvent.id))
      .returning({ id: historyEvents.id })
    : await input.tx
      .insert(historyEvents)
      .values({
        ...values,
        organizationId: input.organizationId,
        childId: input.childId,
        deviceId: input.event.deviceId,
        kind: "gap",
        status: "finalized",
        startedAt: input.event.startedAt,
        firstLocationEventId: input.event.firstLocationEventId,
        sampleCount: 0,
        algorithmVersion: HISTORY_ALGORITHM_VERSION,
      })
      .returning({ id: historyEvents.id });

  return persisted!;
}

async function enqueueEnrichment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  historyEventId: string,
  type: "place" | "roads",
  resetExisting = false,
) {
  await tx
    .insert(historyEnrichmentJobs)
    .values({
      historyEventId,
      type,
      status: "pending",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [historyEnrichmentJobs.historyEventId, historyEnrichmentJobs.type],
      set: resetExisting ? {
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      } : {
        updatedAt: new Date(),
      },
    });
}

async function claimHistoryProcessingState(childId: string) {
  const now = new Date();
  const [state] = await db
    .update(historyProcessingStates)
    .set({
      isProcessing: true,
      leaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MILLISECONDS),
      lastError: null,
      updatedAt: now,
    })
    .where(and(
      eq(historyProcessingStates.childId, childId),
      or(
        isNull(historyProcessingStates.leaseExpiresAt),
        lt(historyProcessingStates.leaseExpiresAt, now),
      ),
      sql`${historyProcessingStates.dirtyThroughAt} is distinct from ${historyProcessingStates.processedThroughAt}`,
    ))
    .returning();

  return state ?? null;
}

export async function getDirtyHistoryChildIds(limit = 25) {
  const now = new Date();
  const rows = await db
    .select({ childId: historyProcessingStates.childId })
    .from(historyProcessingStates)
    .where(and(
      sql`${historyProcessingStates.dirtyThroughAt} is distinct from ${historyProcessingStates.processedThroughAt}`,
      or(
        isNull(historyProcessingStates.leaseExpiresAt),
        lt(historyProcessingStates.leaseExpiresAt, now),
      ),
    ))
    .orderBy(asc(historyProcessingStates.updatedAt))
    .limit(limit);

  return rows.map(row => row.childId);
}

function stableEventKey(kind: string, firstLocationEventId: string) {
  return `${kind}:${firstLocationEventId}`;
}

type SerializedHistorySample = Omit<HistorySample, "occurredAt"> & {
  occurredAt: string;
};

function deserializeReplaySamples(value: Record<string, unknown> | null): HistorySample[] {
  if (!value || !Array.isArray(value.replaySamples)) {
    return [];
  }

  return value.replaySamples.flatMap(item => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<SerializedHistorySample>;
    const occurredAt = typeof candidate.occurredAt === "string"
      ? new Date(candidate.occurredAt)
      : null;

    if (
      !occurredAt
      || Number.isNaN(occurredAt.getTime())
      || typeof candidate.id !== "string"
      || typeof candidate.deviceId !== "string"
      || typeof candidate.latitude !== "number"
      || typeof candidate.longitude !== "number"
      || typeof candidate.stepCounter !== "number"
      || !["active", "sleep", "offline"].includes(candidate.deviceState ?? "")
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      deviceId: candidate.deviceId,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      accuracyMeters: typeof candidate.accuracyMeters === "number"
        ? candidate.accuracyMeters
        : null,
      stepCounter: candidate.stepCounter,
      deviceState: candidate.deviceState as HistorySample["deviceState"],
      occurredAt,
    }];
  });
}

function serializeReplaySample(sample: HistorySample): SerializedHistorySample {
  return {
    ...sample,
    occurredAt: sample.occurredAt.toISOString(),
  };
}

function mergeReplaySamples(existing: HistorySample[], incoming: HistorySample[]) {
  const byId = new Map(existing.map(sample => [sample.id, sample]));

  for (const sample of incoming) {
    byId.set(sample.id, sample);
  }

  return [...byId.values()].sort((a, b) => (
    a.occurredAt.getTime() - b.occurredAt.getTime()
    || a.id.localeCompare(b.id)
  ));
}

function trimReplaySamples(
  samples: HistorySample[],
  detected: DetectedHistoryEvent[],
) {
  const lastGap = [...detected]
    .reverse()
    .find(event => event.kind === "gap");

  if (!lastGap) {
    return samples;
  }

  const nextSessionIndex = samples.findIndex(
    sample => sample.id === lastGap.lastLocationEventId,
  );

  return nextSessionIndex >= 0 ? samples.slice(nextSessionIndex) : samples;
}
