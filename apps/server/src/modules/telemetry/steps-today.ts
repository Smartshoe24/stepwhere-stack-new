import { formatInTimeZone } from "date-fns-tz";

/**
 * Local-date helpers for the child's own timezone.
 *
 * "Steps today" has to roll over at the child's local midnight, not the server's,
 * so every running total is stored alongside the local date and timezone it was
 * accumulated in. Comparing those on write is what makes rollover correct even if
 * the child crosses a timezone or the server runs elsewhere.
 */

export function getLocalDateKey(instant: Date, timezone: string) {
  try {
    return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
  } catch {
    // An unknown IANA zone should degrade rather than break ingest.
    return formatInTimeZone(instant, "UTC", "yyyy-MM-dd");
  }
}

export type StepsTodayState = {
  stepsToday: number;
  stepsTodayDate: string;
  stepsTodayTimezone: string;
};

/**
 * Folds a step delta into the running daily total.
 *
 * Resets when the local date changes, and also when the timezone changes — a child
 * that flies to another zone starts a fresh local day rather than carrying a total
 * that was accumulated against different day boundaries.
 */
export function accumulateStepsToday(input: {
  previous: {
    stepsToday: number | null;
    stepsTodayDate: string | null;
    stepsTodayTimezone: string | null;
  } | null;
  stepDelta: number;
  sampleAt: Date;
  timezone: string;
}): StepsTodayState {
  const localDate = getLocalDateKey(input.sampleAt, input.timezone);
  const delta = Math.max(0, Math.floor(input.stepDelta));
  const isSameDay =
    input.previous?.stepsTodayDate === localDate
    && input.previous?.stepsTodayTimezone === input.timezone;
  const base = isSameDay ? (input.previous?.stepsToday ?? 0) : 0;

  return {
    stepsToday: base + delta,
    stepsTodayDate: localDate,
    stepsTodayTimezone: input.timezone,
  };
}

/**
 * Reads the stored daily total if it still represents "now" in the child's own
 * timezone.
 *
 * Deliberately evaluated against `stepsTodayTimezone` — the device's zone, which
 * accumulated the total — rather than the requesting phone's zone. Those differ
 * whenever a parent and child are in different timezones, and the child's day is
 * defined by where the *tracker* is. Comparing against the caller's zone instead
 * would make this return null for travelling parents, silently disabling the live
 * total for exactly the users most likely to notice.
 *
 * Still guards staleness: if the stored local date is no longer the current local
 * date in that same zone, the total belongs to a past day and is discarded.
 */
export function readCurrentStepsToday(input: {
  stepsToday: number | null;
  stepsTodayDate: string | null;
  stepsTodayTimezone: string | null;
  now?: Date;
}) {
  if (!input.stepsTodayDate || !input.stepsTodayTimezone) {
    return null;
  }

  const currentLocalDate = getLocalDateKey(
    input.now ?? new Date(),
    input.stepsTodayTimezone,
  );

  if (input.stepsTodayDate !== currentLocalDate) {
    return null;
  }

  return input.stepsToday ?? 0;
}
