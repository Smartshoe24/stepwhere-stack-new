import React from 'react';

// Children whose child/telemetry/history calls answered SUBSCRIPTION_REQUIRED.
// Kept outside React Query because the signal comes from several queries
// (trail, history) and has to reach every screen showing that child.
let lockedChildIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function reportSubscriptionRequired(childId: string) {
  if (lockedChildIds.has(childId)) {
    return;
  }

  lockedChildIds = new Set(lockedChildIds).add(childId);
  emit();
}

/** A successful call for the child, or a new payment, clears the signal. */
export function clearSubscriptionRequired(childId?: string) {
  if (childId ? !lockedChildIds.has(childId) : lockedChildIds.size === 0) {
    return;
  }

  if (childId) {
    const next = new Set(lockedChildIds);
    next.delete(childId);
    lockedChildIds = next;
  } else {
    lockedChildIds = new Set();
  }

  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSubscriptionRequired(childId: string | null) {
  const snapshot = React.useSyncExternalStore(subscribe, () => lockedChildIds);
  return Boolean(childId && snapshot.has(childId));
}
