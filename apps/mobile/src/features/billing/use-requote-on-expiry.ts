import type { BillingQuoteDto } from '@stepwhere/types';
import React from 'react';

import { getQuoteFingerprint } from './billing-quote';

/**
 * Quotes last 15 minutes. When one expires before the user continues, fetch a
 * fresh one, and report whether anything the user saw (dates, amounts)
 * changed so the screen can show "Your plan details changed".
 */
export function useRequoteOnExpiry(quote: BillingQuoteDto | undefined, refetch: () => Promise<unknown>) {
  const [changed, setChanged] = React.useState(false);
  const fingerprintRef = React.useRef<string | null>(null);
  const quoteId = quote?.id;
  const expiresAt = quote?.expiresAt;
  const fingerprint = quote ? getQuoteFingerprint(quote) : null;

  React.useEffect(() => {
    if (!fingerprint) {
      return;
    }

    if (fingerprintRef.current && fingerprintRef.current !== fingerprint) {
      setChanged(true);
    }

    fingerprintRef.current = fingerprint;
  }, [fingerprint]);

  React.useEffect(() => {
    if (!quoteId || !expiresAt) {
      return;
    }

    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const timeout = setTimeout(() => {
      void refetch();
    }, delay);

    return () => clearTimeout(timeout);
  }, [expiresAt, quoteId, refetch]);

  return {
    changed,
    /** The user saw the new details; forget the change. */
    acknowledge: React.useCallback(() => setChanged(false), []),
    /** The selection changed on purpose; don't report it as a change. */
    reset: React.useCallback(() => {
      fingerprintRef.current = null;
      setChanged(false);
    }, []),
  };
}
