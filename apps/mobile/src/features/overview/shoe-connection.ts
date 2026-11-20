import type { ChildTelemetryState } from '@stepwhere/types';

/** A brand-new shoe can take 10 to 15 minutes to send its first report. */
export const FIRST_CONNECTION_EXPECTED_MINUTES = 15;
export const FIRST_CONNECTION_EXPECTED_MS = FIRST_CONNECTION_EXPECTED_MINUTES * 60 * 1000;

/** At or below this last-known level, an offline shoe is most likely empty. */
export const LOW_BATTERY_HINT_PERCENT = 15;

export type ShoeConnectionKind =
  /** Nothing special to explain. */
  | 'online'
  /** The shoe has never sent a single report. Almost always not charged. */
  | 'never_connected'
  /** The shoe was talking recently and has gone quiet for a short while. */
  | 'reconnecting'
  /** Quiet for a while, battery was fine when last seen. */
  | 'offline'
  /** Quiet for a while and the last known battery was low. */
  | 'offline_low_battery';

type ShoeConnectionInput = {
  batteryPercent: number | null;
  lastSeenAt: string | null;
  statusLabel?: string | null;
  telemetryState: ChildTelemetryState;
};

/**
 * "Connecting" used to cover both a shoe that was never switched on and one that
 * dropped signal for a minute. Those need different messages, so this separates
 * them. Only the app-visible facts are used: when the shoe was last heard from,
 * the effective telemetry state, and the last battery reading.
 */
export function getShoeConnectionKind(child: ShoeConnectionInput): ShoeConnectionKind {
  // The server hides the snapshot of a child without an active subscription, so
  // "never heard from" would be a false reading there. Say nothing about charge.
  if (child.statusLabel === 'Subscription required') {
    return 'online';
  }

  if (!child.lastSeenAt) {
    return 'never_connected';
  }

  if (child.telemetryState === 'connecting') {
    return 'reconnecting';
  }

  if (child.telemetryState === 'offline') {
    return child.batteryPercent != null && child.batteryPercent <= LOW_BATTERY_HINT_PERCENT
      ? 'offline_low_battery'
      : 'offline';
  }

  return 'online';
}
