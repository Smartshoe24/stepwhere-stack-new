import type { AppIconName } from '@/components/ui/app-icon';

// Duck-typed on `code`/`status` so this stays free of the api-client's native
// imports and can be unit tested; ApiError carries both fields.

export const BillingErrorCode = {
  autopayRequired: 'AUTOPAY_REQUIRED',
  checkoutInProgress: 'CHECKOUT_IN_PROGRESS',
  conflict: 'BILLING_CONFLICT',
  disabled: 'BILLING_DISABLED',
  notPurchaser: 'NOT_PURCHASER',
  paymentsUnavailable: 'PAYMENTS_UNAVAILABLE',
  planExists: 'PLAN_EXISTS',
  quoteExpired: 'BILLING_QUOTE_EXPIRED',
  subscriptionRequired: 'SUBSCRIPTION_REQUIRED',
} as const;

const REVISION_CONFLICT_CODES = new Set([
  BillingErrorCode.conflict,
  'REVISION_CONFLICT',
  'BILLING_REVISION_CONFLICT',
]);

/** The on-device payment SDK isn't available (Cashfree isn't installed yet). */
export class PaymentsUnavailableError extends Error {
  readonly code = BillingErrorCode.paymentsUnavailable;

  constructor(message = 'Payments aren’t available yet.') {
    super(message);
    this.name = 'PaymentsUnavailableError';
  }
}

export function getErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  return null;
}

function getErrorStatus(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
  }

  return null;
}

export function hasErrorCode(error: unknown, code: string) {
  return getErrorCode(error) === code;
}

export function isSubscriptionRequiredError(error: unknown) {
  return hasErrorCode(error, BillingErrorCode.subscriptionRequired);
}

export function isBillingDisabledError(error: unknown) {
  return hasErrorCode(error, BillingErrorCode.disabled);
}

/** A stale `revision`: refetch the overview and retry once. */
export function isBillingConflictError(error: unknown) {
  const code = getErrorCode(error);

  if (code) {
    return REVISION_CONFLICT_CODES.has(code);
  }

  return getErrorStatus(error) === 409;
}

/** fetch rejects with a TypeError offline; the api-client aborts on timeout. */
export function isNetworkError(error: unknown) {
  return error instanceof TypeError
    || (error instanceof Error && error.name === 'AbortError');
}

export type BillingNoticeTone = 'red' | 'amber' | 'neutral';

export type BillingNotice = {
  action?: 'retry' | 'review' | 'see-plan';
  actionLabel?: string;
  body: string;
  icon: AppIconName;
  title: string;
  tone: BillingNoticeTone;
};

/** Copy for the "Messages and errors" panel in the mockups. */
export const billingNotices = {
  declined: {
    action: 'retry',
    actionLabel: 'Try again',
    body: 'The request was declined or closed in your UPI app. You haven’t been charged.',
    icon: 'close',
    title: 'Autopay wasn’t approved',
    tone: 'red',
  },
  expired: {
    action: 'retry',
    actionLabel: 'Start again',
    body: 'Requests last 30 minutes. Start again to get a new one.',
    icon: 'clock',
    title: 'The approval request expired',
    tone: 'amber',
  },
  network: {
    action: 'retry',
    actionLabel: 'Try again',
    body: 'Check your connection and try again. Nothing was set up.',
    icon: 'wifi-off',
    title: 'Couldn’t reach the payment service',
    tone: 'red',
  },
  planChanged: {
    action: 'review',
    actionLabel: 'Review',
    body: 'A shoe’s free days or the price changed since you opened this screen. Check the new dates before continuing.',
    icon: 'refresh',
    title: 'Your plan details changed',
    tone: 'amber',
  },
  paymentsUnavailable: {
    body: 'You can’t set up autopay from the app yet. Nothing was set up or charged.',
    icon: 'lock',
    title: 'Payments aren’t available yet',
    tone: 'neutral',
  },
  billingDisabled: {
    body: 'Plans can’t be bought or changed right now. Try again later.',
    icon: 'lock',
    title: 'Payments are paused',
    tone: 'neutral',
  },
  notPurchaser: {
    body: 'Only the person who pays for the plan can change it.',
    icon: 'lock',
    title: 'Only the payer can do this',
    tone: 'neutral',
  },
  generic: {
    action: 'retry',
    actionLabel: 'Try again',
    body: 'Something went wrong. Nothing was changed.',
    icon: 'alert',
    title: 'That didn’t work',
    tone: 'red',
  },
} satisfies Record<string, BillingNotice>;

export function planSetByOtherNotice(name: string | null): BillingNotice {
  return {
    action: 'see-plan',
    actionLabel: 'See plan',
    body: 'Someone in your family set up autopay a moment ago, so you don’t need to. Your shoes are covered.',
    icon: 'family',
    title: `${name ?? 'Someone'} just set up a plan`,
    tone: 'neutral',
  };
}

export function checkoutInProgressNotice(name: string | null): BillingNotice {
  return {
    body: 'Someone in your family started setting up autopay a moment ago. Check back in a few minutes.',
    icon: 'family',
    title: `${name ?? 'Someone'} is setting up a plan`,
    tone: 'neutral',
  };
}

/** Maps a failed billing call to the notice the screen shows. */
export function describeBillingError(error: unknown, context?: { otherName?: string | null }): BillingNotice {
  if (error instanceof PaymentsUnavailableError) {
    return billingNotices.paymentsUnavailable;
  }

  if (isNetworkError(error)) {
    return billingNotices.network;
  }

  switch (getErrorCode(error)) {
    case BillingErrorCode.disabled:
      return billingNotices.billingDisabled;
    case BillingErrorCode.quoteExpired:
      return billingNotices.planChanged;
    case BillingErrorCode.planExists:
      return planSetByOtherNotice(context?.otherName ?? null);
    case BillingErrorCode.checkoutInProgress:
      return checkoutInProgressNotice(context?.otherName ?? null);
    case BillingErrorCode.notPurchaser:
      return billingNotices.notPurchaser;
    default:
      return billingNotices.generic;
  }
}
