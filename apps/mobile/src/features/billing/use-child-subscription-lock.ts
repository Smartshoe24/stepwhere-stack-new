import { isSubscriptionRequiredError } from './billing-errors';
import { getChildLock } from './billing-state';
import { useSubscriptionRequired } from './subscription-lock';
import { useBilling } from './use-billing';

/**
 * Whether the child's tracking is paused for billing. Combines the billing
 * overview with SUBSCRIPTION_REQUIRED answers (passed in, or reported by
 * another screen). With billing off this is always unlocked.
 */
export function useChildSubscriptionLock(childId: string | null, error?: unknown) {
  const billing = useBilling();
  const sawSubscriptionRequired = useSubscriptionRequired(childId) || isSubscriptionRequiredError(error);
  const lock = getChildLock(billing.overview, childId, sawSubscriptionRequired);

  return {
    ...lock,
    payerName: billing.overview?.subscription?.purchaser.name ?? null,
  };
}

export type ChildSubscriptionLock = ReturnType<typeof useChildSubscriptionLock>;
