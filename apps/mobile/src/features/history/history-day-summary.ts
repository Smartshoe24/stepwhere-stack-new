import type { ChildHistoryEventDto } from '@stepwhere/types';

export type HistoryCoverageSegment = {
  id: string;
  kind: 'stay' | 'trip' | 'gap' | 'untracked';
  /** Fraction of the day where the segment starts, 0..1. */
  start: number;
  /** Fraction of the day the segment spans, 0..1. */
  span: number;
  eventId: string | null;
};

export type HistoryDaySummary = {
  placeCount: number;
  distanceMeters: number;
  trackedSeconds: number;
  gapSeconds: number;
  /** 0..1 share of the elapsed window with usable data. */
  coverageRatio: number;
  segments: HistoryCoverageSegment[];
};

const SECONDS_PER_DAY = 86_400;
/** Sub-pixel segments are invisible but still cost a view; fold them away. */
const MINIMUM_VISIBLE_SPAN = 0.004;

/**
 * Builds the day summary that heads the History screen: three stats plus the
 * 24-hour coverage bar. Segments are laid out against real elapsed time so a
 * data hole is as wide on screen as it was in the day.
 */
export function buildHistoryDaySummary(input: {
  events: ChildHistoryEventDto[];
  dateKey: string;
  /** Now, for a partially elapsed day. Omit to treat the day as complete. */
  now?: Date | null;
}): HistoryDaySummary {
  const dayStartMs = Date.parse(`${input.dateKey}T00:00:00.000Z`);
  const events = [...input.events].sort(
    (left, right) => Date.parse(left.displayStartedAt) - Date.parse(right.displayStartedAt),
  );
  const uniquePlaces = new Set<string>();
  let distanceMeters = 0;
  let trackedSeconds = 0;
  let gapSeconds = 0;
  const rawSegments: HistoryCoverageSegment[] = [];

  for (const event of events) {
    if (event.kind === 'stay') {
      uniquePlaces.add(event.place.providerPlaceId ?? event.place.label);
    }

    if (event.kind === 'trip') {
      distanceMeters += event.distanceMeters;
    }

    if (event.kind === 'gap') {
      gapSeconds += event.clippedDurationSeconds;
    } else {
      trackedSeconds += event.clippedDurationSeconds;
    }

    const bounds = getEventDayBounds(event, dayStartMs);

    if (!bounds) {
      continue;
    }

    rawSegments.push({
      id: event.id,
      kind: event.kind,
      start: bounds.start,
      span: bounds.span,
      eventId: event.id,
    });
  }

  const elapsedRatio = getElapsedRatio(input.dateKey, input.now ?? null);
  const coveredSeconds = trackedSeconds + gapSeconds;

  return {
    placeCount: uniquePlaces.size,
    distanceMeters,
    trackedSeconds,
    gapSeconds,
    coverageRatio: coveredSeconds > 0 ? trackedSeconds / coveredSeconds : 0,
    segments: fillUntracked(mergeTinySegments(rawSegments), elapsedRatio),
  };
}

/**
 * How much of the day has happened, as a fraction. A day in the past is fully
 * elapsed; today stops at the current clock time.
 */
export function getElapsedRatio(dateKey: string, now: Date | null) {
  if (!now) {
    return 1;
  }

  const dayStartMs = Date.parse(`${dateKey}T00:00:00.000Z`);
  const elapsedMs = now.getTime() - dayStartMs;

  if (Number.isNaN(elapsedMs)) {
    return 1;
  }

  return clamp01(elapsedMs / (SECONDS_PER_DAY * 1000));
}

function getEventDayBounds(event: ChildHistoryEventDto, dayStartMs: number) {
  const startMs = Date.parse(event.displayStartedAt);

  if (Number.isNaN(startMs)) {
    return null;
  }

  const endSource = event.displayEndedAt ?? event.endedAt;
  const parsedEndMs = endSource ? Date.parse(endSource) : Number.NaN;
  // Ongoing events have no end; derive it from the clipped duration instead.
  const endMs = Number.isNaN(parsedEndMs)
    ? startMs + event.clippedDurationSeconds * 1000
    : parsedEndMs;
  const dayMs = SECONDS_PER_DAY * 1000;
  const start = clamp01((startMs - dayStartMs) / dayMs);
  const end = clamp01((endMs - dayStartMs) / dayMs);

  return {
    start,
    span: Math.max(0, end - start),
  };
}

/**
 * A 40-second trip renders as 0.4px. Rather than drop it, absorb its span into
 * the previous segment so the bar stays continuous and total width is preserved.
 */
function mergeTinySegments(segments: HistoryCoverageSegment[]) {
  const result: HistoryCoverageSegment[] = [];

  for (const segment of segments) {
    if (segment.span >= MINIMUM_VISIBLE_SPAN) {
      result.push(segment);
      continue;
    }

    const previous = result[result.length - 1];

    if (previous) {
      previous.span += segment.span;
      continue;
    }

    result.push({ ...segment, span: MINIMUM_VISIBLE_SPAN });
  }

  return result;
}

/**
 * Inserts explicit `untracked` runs wherever no event exists inside the elapsed
 * window. This is what makes "the tracker was off from 2pm" legible instead of
 * being silently indistinguishable from the empty track.
 */
function fillUntracked(segments: HistoryCoverageSegment[], elapsedRatio: number) {
  const result: HistoryCoverageSegment[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.start - cursor >= MINIMUM_VISIBLE_SPAN) {
      result.push({
        id: `untracked-${cursor.toFixed(4)}`,
        kind: 'untracked',
        start: cursor,
        span: segment.start - cursor,
        eventId: null,
      });
    }

    result.push(segment);
    cursor = Math.max(cursor, segment.start + segment.span);
  }

  if (elapsedRatio - cursor >= MINIMUM_VISIBLE_SPAN) {
    result.push({
      id: `untracked-${cursor.toFixed(4)}`,
      kind: 'untracked',
      start: cursor,
      span: elapsedRatio - cursor,
      eventId: null,
    });
  }

  return result;
}

/** Maps a 0..1 position on the coverage bar back to the event under it. */
export function findSegmentEventId(segments: HistoryCoverageSegment[], ratio: number) {
  const position = clamp01(ratio);
  const hit = segments.find(
    segment => segment.eventId
      && position >= segment.start
      && position <= segment.start + segment.span,
  );

  if (hit) {
    return hit.eventId;
  }

  // Fall back to the nearest real event so a tap near a hairline segment still works.
  let nearestId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    if (!segment.eventId) {
      continue;
    }

    const center = segment.start + segment.span / 2;
    const distance = Math.abs(center - position);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = segment.eventId;
    }
  }

  return nearestId;
}

function clamp01(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
