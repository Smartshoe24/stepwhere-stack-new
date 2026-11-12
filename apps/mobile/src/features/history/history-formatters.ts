import type { ChildHistoryEventDto, HistoryGapReason, HistoryTripMode } from '@stepwhere/types';

export function getTodayDateKey(
  now = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(part => part.type === type)?.value ?? ''
  );

  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function fromLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year!, month! - 1, day!, 12, 0, 0, 0);
}

export function shiftDateKey(dateKey: string, offsetDays: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function clampDateKey(dateKey: string, minimumDate: string | null, maximumDate: string) {
  if (minimumDate && dateKey < minimumDate) {
    return minimumDate;
  }

  return dateKey > maximumDate ? maximumDate : dateKey;
}

/**
 * Header label for the selected day. "Today" and "Yesterday" are the two dates
 * a parent checks most, so they get names instead of dates.
 */
export function formatDateLabel(dateKey: string, todayKey?: string) {
  if (todayKey) {
    if (dateKey === todayKey) {
      return 'Today';
    }

    if (dateKey === shiftDateKey(todayKey, -1)) {
      return 'Yesterday';
    }
  }

  const date = fromLocalDateKey(dateKey);
  const sameYear = !todayKey || dateKey.slice(0, 4) === todayKey.slice(0, 4);

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? null : { year: 'numeric' }),
  }).format(date);
}

/** Secondary line under a named day, so the actual date is never hidden. */
export function formatDateSubLabel(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fromLocalDateKey(dateKey));
}

export function formatEventTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Splits a time into digits and period so the timeline gutter can render "9:41"
 * at full contrast and "AM" as a demoted suffix.
 */
export function splitEventTime(iso: string) {
  const formatted = formatEventTime(iso);
  const match = /^(.*?)\s*([AP]M)$/i.exec(formatted);

  if (!match) {
    return { time: formatted, period: null };
  }

  return { time: match[1]!, period: match[2]!.toUpperCase() };
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours > 0 && rest > 0) {
    return `${hours}h ${rest}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${rest}m`;
}

export function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(meters)} m`;
}

export function formatMode(mode: HistoryTripMode) {
  if (mode === 'walking') {
    return 'Walking';
  }

  if (mode === 'vehicle') {
    return 'Vehicle';
  }

  return 'Movement';
}

/** User-facing copy for gap reasons — never leak the raw enum. */
export function formatGapReason(reason: HistoryGapReason) {
  if (reason === 'offline') {
    return 'Device offline';
  }

  if (reason === 'moved_while_sleeping') {
    return 'Moved while asleep';
  }

  return 'No signal';
}

export function getEventTitle(event: ChildHistoryEventDto) {
  if (event.kind === 'stay') {
    return event.place.label;
  }

  if (event.kind === 'trip') {
    return `${event.originLabel} → ${event.destinationLabel}`;
  }

  return formatGapReason(event.reason);
}

export function getEventSubtitle(event: ChildHistoryEventDto) {
  if (event.kind === 'stay') {
    return event.status === 'ongoing' ? 'Stay' : `Stay · ${formatDuration(event.clippedDurationSeconds)}`;
  }

  if (event.kind === 'trip') {
    return `${formatMode(event.mode)} · ${formatDistance(event.distanceMeters)}`;
  }

  return `No data · ${formatDuration(event.clippedDurationSeconds)}`;
}

/**
 * The single right-aligned metric per row. Duration is the scannable column;
 * ongoing events say "Now" instead so live state reads at a glance.
 */
export function getEventTrailingMetric(event: ChildHistoryEventDto) {
  if (event.status === 'ongoing') {
    return 'Now';
  }

  return formatDuration(event.clippedDurationSeconds);
}

export function getContinuationLabel(event: ChildHistoryEventDto) {
  if (event.continuesFromPreviousDay && event.continuesIntoNextDay) {
    return 'Continues before and after this day';
  }

  if (event.continuesFromPreviousDay) {
    return 'Continued from previous day';
  }

  if (event.continuesIntoNextDay) {
    return 'Continues into next day';
  }

  return null;
}

export function getEventAccessibilityLabel(event: ChildHistoryEventDto) {
  return [
    formatEventTime(event.displayStartedAt),
    getEventTitle(event),
    getEventSubtitle(event),
    event.status === 'ongoing' ? 'Ongoing' : null,
  ].filter(Boolean).join(', ');
}
