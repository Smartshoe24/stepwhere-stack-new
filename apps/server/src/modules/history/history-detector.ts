import type { HistoryGapReason } from "@stepwhere/types";

import {
  INITIAL_STAY_DURATION_SECONDS,
  MIN_STAY_SAMPLE_COUNT,
  NORMAL_STAY_DURATION_SECONDS,
  STAY_EXIT_CONFIRMATION_ACTIVE_SAMPLES,
  STAY_RADIUS_MAX_METERS,
  STAY_RADIUS_MIN_METERS,
  TELEMETRY_GAP_SECONDS,
} from "./history.constants";
import { inferTripMode } from "./history-mode";
import {
  calculateDistanceMeters,
  distanceMeters,
  elapsedSeconds,
  filterAcceptedSamples,
  percentile,
  simplifyPath,
  weightedMedoid,
  type AcceptedHistorySample,
  type HistoryPathPoint,
  type HistorySample,
} from "./history-path";

type StayDraft = {
  samples: AcceptedHistorySample[];
  center: AcceptedHistorySample;
  radiusMeters: number;
  initialCandidate: boolean;
};

export type DetectedHistoryEvent =
  | {
    kind: "stay";
    status: "ongoing" | "finalized";
    startedAt: Date;
    endedAt: Date | null;
    firstLocationEventId: string;
    lastLocationEventId: string;
    sampleCount: number;
    deviceId: string;
    representativeLatitude: number;
    representativeLongitude: number;
    stayRadiusMeters: number;
  }
  | {
    kind: "trip";
    status: "ongoing" | "finalized";
    startedAt: Date;
    endedAt: Date | null;
    firstLocationEventId: string;
    lastLocationEventId: string;
    sampleCount: number;
    deviceId: string;
    tripMode: "walking" | "vehicle" | "unknown";
    modeConfidence: "high" | "medium" | "low" | null;
    distanceMeters: number;
    filteredPath: HistoryPathPoint[];
  }
  | {
    kind: "gap";
    status: "finalized";
    startedAt: Date;
    endedAt: Date;
    firstLocationEventId: string;
    lastLocationEventId: string;
    sampleCount: number;
    deviceId: string;
    gapReason: HistoryGapReason;
    beforeCoordinate: { latitude: number; longitude: number } | null;
    afterCoordinate: { latitude: number; longitude: number } | null;
  };

export function detectHistoryEvents(samples: HistorySample[], now = new Date()): DetectedHistoryEvent[] {
  const acceptedSamples = filterAcceptedSamples(samples).sort(compareSamples);
  const events: DetectedHistoryEvent[] = [];
  let stay: ReturnType<typeof toStayEvent> | null = null;
  let candidate: StayDraft | null = null;
  let tripSamples: AcceptedHistorySample[] = [];
  let outsideSamples: AcceptedHistorySample[] = [];
  let staySamples: AcceptedHistorySample[] = [];
  let lastSleepingSample: AcceptedHistorySample | null = null;
  let movingSleepGapStart: AcceptedHistorySample | null = null;
  let offlineGapStart: AcceptedHistorySample | null = null;
  let sessionInitialAvailable = true;
  let previous: AcceptedHistorySample | null = null;

  function flushTrip(endSample: AcceptedHistorySample | null, status: "ongoing" | "finalized") {
    const usableTripSamples = endSample && tripSamples[tripSamples.length - 1]?.id !== endSample.id
      ? tripSamples.concat(endSample)
      : tripSamples;

    if (usableTripSamples.length < 2) {
      tripSamples = [];
      return;
    }

    events.push(toTripEvent(usableTripSamples, status, status === "ongoing" ? null : usableTripSamples[usableTripSamples.length - 1]!.occurredAt));
    tripSamples = [];
  }

  function flushCandidateAsTrip() {
    if (!candidate) {
      return;
    }

    tripSamples.push(...candidate.samples);
    candidate = null;
  }

  function startSession() {
    candidate = null;
    tripSamples = [];
    outsideSamples = [];
    staySamples = [];
    lastSleepingSample = null;
    stay = null;
    sessionInitialAvailable = true;
  }

  for (const sample of acceptedSamples) {
    if (offlineGapStart) {
      if (sample.deviceState === "offline") {
        previous = sample;
        continue;
      }

      events.push(toGapEvent(offlineGapStart, sample, "offline"));
      offlineGapStart = null;
      startSession();
      previous = null;
    }

    if (movingSleepGapStart) {
      if (sample.deviceState === "sleep" || sample.deviceState === "offline") {
        previous = sample;
        continue;
      }

      events.push(toGapEvent(movingSleepGapStart, sample, "moved_while_sleeping"));
      movingSleepGapStart = null;
      startSession();
      previous = null;
    }

    if (previous && sample.deviceState !== "offline") {
      const gapSeconds = elapsedSeconds(previous.occurredAt, sample.occurredAt);
      const createsGap = (
        gapSeconds > TELEMETRY_GAP_SECONDS
        && previous.deviceState !== "sleep"
        && sample.deviceState !== "sleep"
      );

      if (createsGap) {
        if (stay) {
          stay.status = "finalized";
          stay.endedAt = previous.occurredAt;
          applyFinalStayMedoid(stay, staySamples);
          events.push(stay);
          stay = null;
        } else {
          flushCandidateAsTrip();
          flushTrip(previous, "finalized");
        }

        events.push(toGapEvent(previous, sample, "telemetry_gap"));
        startSession();
      }
    }

    if (sample.deviceState === "offline") {
      if (stay) {
        stay.status = "finalized";
        stay.endedAt = previous?.occurredAt ?? sample.occurredAt;
        applyFinalStayMedoid(stay, staySamples);
        events.push(stay);
      } else {
        flushCandidateAsTrip();
        flushTrip(previous, "finalized");
      }

      offlineGapStart = previous ?? sample;
      startSession();
      previous = sample;
      continue;
    }

    if (sample.deviceState === "sleep" && !stay) {
      flushCandidateAsTrip();
      flushTrip(previous, "finalized");
      movingSleepGapStart = previous ?? sample;
      candidate = null;
      previous = sample;
      continue;
    }

    if (stay) {
      const stayCenter = {
        latitude: stay.representativeLatitude,
        longitude: stay.representativeLongitude,
      };

      if (sample.deviceState === "sleep") {
        stay.lastLocationEventId = sample.id;
        stay.sampleCount += 1;
        stay.endedAt = null;
        lastSleepingSample = sample;
        outsideSamples = [];
      } else if (distanceMeters(sample, stayCenter) <= stay.stayRadiusMeters) {
        stay.lastLocationEventId = sample.id;
        stay.sampleCount += 1;
        stay.endedAt = null;
        staySamples.push(sample);
        lastSleepingSample = null;
        outsideSamples = [];
      } else if (sample.deviceState === "active") {
        outsideSamples.push(sample);

        if (outsideSamples.length >= STAY_EXIT_CONFIRMATION_ACTIVE_SAMPLES) {
          const firstOutside = outsideSamples[0]!;
          stay.status = "finalized";
          stay.endedAt = lastSleepingSample?.occurredAt ?? firstOutside.occurredAt;
          applyFinalStayMedoid(stay, staySamples);
          events.push(stay);

          if (lastSleepingSample) {
            events.push(toGapEvent(lastSleepingSample, firstOutside, "moved_while_sleeping"));
          }

          stay = null;
          tripSamples = outsideSamples;
          outsideSamples = [];
          staySamples = [];
          sessionInitialAvailable = Boolean(lastSleepingSample);
          lastSleepingSample = null;
        }
      }

      previous = sample;
      continue;
    }

    if (!candidate) {
      candidate = createCandidate(sample, sessionInitialAvailable);
      previous = sample;
      continue;
    }

    const withinCandidate = distanceMeters(sample, candidate.center) <= candidate.radiusMeters;

    if (withinCandidate && sample.deviceState !== "sleep") {
      candidate.samples.push(sample);
      candidate.radiusMeters = calculateStayRadius(candidate.samples);

      const candidateDuration = elapsedSeconds(candidate.samples[0]!.occurredAt, sample.occurredAt);
      const requiredDuration = candidate.initialCandidate ? INITIAL_STAY_DURATION_SECONDS : NORMAL_STAY_DURATION_SECONDS;

      if (candidate.samples.length >= MIN_STAY_SAMPLE_COUNT && candidateDuration >= requiredDuration) {
        if (tripSamples.length >= 2) {
          flushTrip(candidate.samples[0]!, "finalized");
        }

        stay = toStayEvent(candidate.samples, "ongoing", null);
        staySamples = [...candidate.samples];
        candidate = null;
        sessionInitialAvailable = false;
      }
    } else {
      if (candidate.initialCandidate) {
        sessionInitialAvailable = false;
      }

      flushCandidateAsTrip();
      tripSamples.push(sample);
      candidate = createCandidate(sample, false);
    }

    previous = sample;
  }

  if (stay) {
    stay.status = stay.endedAt && stay.endedAt < now ? "finalized" : "ongoing";
    if (stay.status === "finalized") {
      applyFinalStayMedoid(stay, staySamples);
    }
    events.push(stay);
  } else if (movingSleepGapStart || offlineGapStart) {
    flushCandidateAsTrip();
    flushTrip(previous, "finalized");
  } else {
    flushCandidateAsTrip();
    flushTrip(null, "ongoing");
  }

  return mergeAdjacentEvents(events);
}

function applyFinalStayMedoid(
  stay: Extract<DetectedHistoryEvent, { kind: "stay" }>,
  samples: AcceptedHistorySample[],
) {
  const medoid = weightedMedoid(samples);

  if (!medoid) {
    return;
  }

  stay.representativeLatitude = medoid.latitude;
  stay.representativeLongitude = medoid.longitude;
}

function createCandidate(sample: AcceptedHistorySample, initialCandidate: boolean): StayDraft {
  return {
    center: sample,
    initialCandidate,
    radiusMeters: calculateStayRadius([sample]),
    samples: [sample],
  };
}

function calculateStayRadius(samples: AcceptedHistorySample[]) {
  const radius = percentile(samples.map((sample) => sample.accuracyMeters), 75);
  return Math.max(STAY_RADIUS_MIN_METERS, Math.min(STAY_RADIUS_MAX_METERS, radius));
}

function toStayEvent(samples: AcceptedHistorySample[], status: "ongoing" | "finalized", endedAt: Date | null) {
  const medoid = weightedMedoid(samples) ?? samples[0]!;

  return {
    kind: "stay" as const,
    status,
    startedAt: samples[0]!.occurredAt,
    endedAt,
    firstLocationEventId: samples[0]!.id,
    lastLocationEventId: samples[samples.length - 1]!.id,
    sampleCount: samples.length,
    deviceId: samples[0]!.deviceId,
    representativeLatitude: medoid.latitude,
    representativeLongitude: medoid.longitude,
    stayRadiusMeters: calculateStayRadius(samples),
  };
}

function toTripEvent(samples: AcceptedHistorySample[], status: "ongoing" | "finalized", endedAt: Date | null): DetectedHistoryEvent {
  const filteredPath = simplifyPath(samples);
  const distance = calculateDistanceMeters(filteredPath);
  const mode = inferTripMode(samples, distance);

  return {
    kind: "trip",
    status,
    startedAt: samples[0]!.occurredAt,
    endedAt,
    firstLocationEventId: samples[0]!.id,
    lastLocationEventId: samples[samples.length - 1]!.id,
    sampleCount: samples.length,
    deviceId: samples[0]!.deviceId,
    tripMode: mode.mode,
    modeConfidence: mode.confidence,
    distanceMeters: distance,
    filteredPath,
  };
}

function toGapEvent(before: AcceptedHistorySample, after: AcceptedHistorySample, reason: HistoryGapReason): DetectedHistoryEvent {
  return {
    kind: "gap",
    status: "finalized",
    startedAt: before.occurredAt,
    endedAt: after.occurredAt,
    firstLocationEventId: before.id,
    lastLocationEventId: after.id,
    sampleCount: 0,
    deviceId: after.deviceId,
    gapReason: reason,
    beforeCoordinate: {
      latitude: before.latitude,
      longitude: before.longitude,
    },
    afterCoordinate: {
      latitude: after.latitude,
      longitude: after.longitude,
    },
  };
}

function mergeAdjacentEvents(events: DetectedHistoryEvent[]) {
  return events
    .filter((event) => event.kind !== "trip" || event.filteredPath.length >= 2)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

function compareSamples(a: AcceptedHistorySample, b: AcceptedHistorySample) {
  const timeDiff = a.occurredAt.getTime() - b.occurredAt.getTime();
  return timeDiff === 0 ? a.id.localeCompare(b.id) : timeDiff;
}
