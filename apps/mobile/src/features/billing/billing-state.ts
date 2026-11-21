import type {
  BillingAutopayStatus,
  BillingChargeKind,
  BillingDeviceDto,
  BillingOverviewDto,
  BillingSubscriptionDto,
  BillingTermMonths,
} from '@stepwhere/types';

import { daysBetween, toIstDateKey } from './billing-format';

// Pure derivations from GET /billing/overview. Everything the Profile card,
// Home banner and locked cards show is decided here so it can be unit tested.

export type BillingNameLookup = (deviceId: string) => string;

type DeriveOptions = {
  nameForDevice: BillingNameLookup;
  now?: Date;
};

const DEFAULT_TRIAL_DAYS = 30;
const TRIAL_ENDING_WINDOW_DAYS = 7;
const AUTOPAY_OFF_STATUSES = new Set<BillingAutopayStatus>([
  'off_by_customer',
  'paused_by_customer',
  'cancelled',
  'card_expired',
  'failed',
]);

type PlanSummary = {
  shoeCount: number;
  termMonths: BillingTermMonths;
  names: string[];
  payerName: string | null;
  isPayer: boolean;
};

export type SubscriptionCardState =
  | { kind: 'hidden' }
  | {
    kind: 'trial';
    names: string[];
    daysLeft: number;
    endsOn: string;
    /** Share of the shortest free month already used, 0–1. */
    progress: number;
  }
  | {
    kind: 'ending';
    names: string[];
    firstName: string;
    daysLeft: number;
    endsOn: string;
    progress: number;
    /** Set once the free month is over and the shoe is in its 3-day grace. */
    graceEndsOn: string | null;
  }
  | (PlanSummary & { kind: 'scheduled'; startsOn: string; firstCharge: { amountMinor: number; dueOn: string } | null })
  | (PlanSummary & { kind: 'bank' })
  | (PlanSummary & { kind: 'active'; renewsOn: string; renewalAmountMinor: number })
  | (PlanSummary & { kind: 'otherActive'; renewsOn: string })
  | (PlanSummary & { kind: 'cancelled'; coveredUntil: string })
  | (PlanSummary & { kind: 'autopayOff'; coveredUntil: string; reason: BillingAutopayStatus })
  | (PlanSummary & {
    kind: 'issue';
    amountMinor: number;
    chargeKind: BillingChargeKind;
    failedOn: string | null;
    retryOn: string | null;
    graceEndsOn: string;
  })
  | (PlanSummary & { kind: 'otherIssue'; graceEndsOn: string })
  | { kind: 'expired'; names: string[]; pausedCount: number; graceEndsOn: string | null };

export type SubscriptionCardKind = SubscriptionCardState['kind'];

/** Shoes linked to a child; spare shoes never drive prompts or locks. */
export function getLinkedDevices(overview: BillingOverviewDto) {
  return overview.devices.filter(device => device.childId !== null);
}

function minBy<T>(items: T[], value: (item: T) => number) {
  return items.reduce<T | null>((best, item) => (best === null || value(item) < value(best) ? item : best), null);
}

function trialProgress(device: BillingDeviceDto) {
  const total = daysBetween(device.trialStartsAt, device.trialEndsAt) || DEFAULT_TRIAL_DAYS;
  const used = 1 - device.trialDaysRemaining / total;
  return Math.min(1, Math.max(0, used));
}

function isLiveSubscription(subscription: BillingSubscriptionDto | null) {
  return Boolean(subscription && ['scheduled', 'active', 'past_due', 'cancelled'].includes(subscription.state));
}

function planSummary(subscription: BillingSubscriptionDto, nameForDevice: BillingNameLookup): PlanSummary {
  return {
    shoeCount: subscription.shoeCount,
    termMonths: subscription.termMonths,
    names: subscription.deviceIds.map(nameForDevice),
    payerName: subscription.purchaser.name,
    isPayer: subscription.purchaser.isYou,
  };
}

function deriveWithoutPlan(overview: BillingOverviewDto, options: DeriveOptions): SubscriptionCardState {
  const linked = getLinkedDevices(overview);
  const names = linked.map(device => options.nameForDevice(device.deviceId));

  if (overview.pendingCheckout?.state === 'bank_pending') {
    // The plan isn't created until the bank approves, so there is no plan to
    // describe yet; the card falls back to the shoes being set up.
    return {
      kind: 'bank',
      shoeCount: linked.length,
      termMonths: 6,
      names,
      payerName: overview.pendingCheckout.startedByName,
      isPayer: overview.pendingCheckout.isYou,
    };
  }

  if (!overview.purchasesEnabled || linked.length === 0) {
    return { kind: 'hidden' };
  }

  const expired = linked.filter(device => device.coverage === 'expired');

  if (expired.length > 0) {
    return { kind: 'expired', names, pausedCount: expired.length, graceEndsOn: null };
  }

  const graceDevice = minBy(
    linked.filter(device => device.coverage === 'grace' && device.graceEndsAt),
    device => daysBetween(toIstDateKey(options.now ?? new Date()), device.graceEndsAt!),
  );

  if (graceDevice) {
    return {
      kind: 'ending',
      names,
      firstName: options.nameForDevice(graceDevice.deviceId),
      daysLeft: 0,
      endsOn: graceDevice.trialEndsAt,
      progress: 1,
      graceEndsOn: graceDevice.graceEndsAt,
    };
  }

  const soonest = minBy(linked.filter(device => device.coverage === 'trial'), device => device.trialDaysRemaining);

  if (!soonest) {
    // Every shoe is covered some other way (legacy or support grants).
    return { kind: 'hidden' };
  }

  if (soonest.trialDaysRemaining <= TRIAL_ENDING_WINDOW_DAYS) {
    return {
      kind: 'ending',
      names,
      firstName: options.nameForDevice(soonest.deviceId),
      daysLeft: soonest.trialDaysRemaining,
      endsOn: soonest.trialEndsAt,
      progress: trialProgress(soonest),
      graceEndsOn: null,
    };
  }

  return {
    kind: 'trial',
    names,
    daysLeft: soonest.trialDaysRemaining,
    endsOn: soonest.trialEndsAt,
    progress: trialProgress(soonest),
  };
}

/** The 11 states of the Profile → Subscription card. */
export function deriveSubscriptionCardState(
  overview: BillingOverviewDto,
  options: DeriveOptions,
): SubscriptionCardState {
  const subscription = overview.subscription;

  if (!subscription) {
    return deriveWithoutPlan(overview, options);
  }

  const summary = planSummary(subscription, options.nameForDevice);

  switch (subscription.state) {
    case 'expired':
    case 'revoked': {
      const linked = getLinkedDevices(overview);
      const paused = linked.filter(device => device.coverage === 'expired');
      const inGrace = minBy(
        linked.filter(device => device.coverage === 'grace' && device.graceEndsAt),
        device => daysBetween(toIstDateKey(options.now ?? new Date()), device.graceEndsAt!),
      );
      return {
        kind: 'expired',
        names: summary.names,
        pausedCount: paused.length,
        graceEndsOn: paused.length === 0 ? inGrace?.graceEndsAt ?? subscription.graceEndsAt : null,
      };
    }
    case 'scheduled':
      if (subscription.autopay.status === 'bank_pending') {
        return { ...summary, kind: 'bank' };
      }

      return {
        ...summary,
        kind: 'scheduled',
        startsOn: subscription.periodStartsAt,
        firstCharge: subscription.nextCharge
          ? { amountMinor: subscription.nextCharge.amountMinor, dueOn: subscription.nextCharge.dueOn }
          : null,
      };
    case 'past_due': {
      if (!summary.isPayer) {
        return { ...summary, kind: 'otherIssue', graceEndsOn: subscription.graceEndsAt };
      }

      const failed = subscription.failedCharge;
      return {
        ...summary,
        kind: 'issue',
        amountMinor: failed?.amountMinor ?? subscription.renewalAmountMinor,
        chargeKind: failed?.kind ?? 'renewal',
        failedOn: failed?.dueOn ?? null,
        retryOn: failed?.retryOn ?? null,
        graceEndsOn: subscription.graceEndsAt,
      };
    }
    case 'cancelled':
      return { ...summary, kind: 'cancelled', coveredUntil: subscription.periodEndsAt };
    case 'active':
    default:
      if (subscription.cancelAtPeriodEnd) {
        return { ...summary, kind: 'cancelled', coveredUntil: subscription.periodEndsAt };
      }

      // A replacement autopay in progress keeps the plan "Active".
      if (AUTOPAY_OFF_STATUSES.has(subscription.autopay.status) && !subscription.pendingCheckoutId) {
        return {
          ...summary,
          kind: 'autopayOff',
          coveredUntil: subscription.periodEndsAt,
          reason: subscription.autopay.status,
        };
      }

      return summary.isPayer
        ? {
          ...summary,
          kind: 'active',
          renewsOn: subscription.periodEndsAt,
          renewalAmountMinor: subscription.renewalAmountMinor,
        }
        : { ...summary, kind: 'otherActive', renewsOn: subscription.periodEndsAt };
  }
}

export type HomeBanner =
  | { kind: 'trial-ending'; id: string; childName: string; daysLeft: number; endsOn: string }
  | { kind: 'payer-issue'; id: string; amountMinor: number; graceEndsOn: string }
  | { kind: 'other-issue'; id: string; payerName: string | null; graceEndsOn: string }
  | { kind: 'grace'; id: string; reason: 'plan' | 'trial'; childName: string; graceEndsOn: string; canBuy: boolean };

/** Only the free-month reminder can be dismissed (until the next day). */
export function isHomeBannerDismissible(banner: HomeBanner) {
  return banner.kind === 'trial-ending';
}

/**
 * The Home banner, shown only when something needs doing. Payment problems
 * come first, then the 3-day grace, then the free month ending (from 7 days
 * before, only while there's no plan or setup in progress).
 */
export function selectHomeBanner(overview: BillingOverviewDto | null, options: DeriveOptions): HomeBanner | null {
  if (!overview) {
    return null;
  }

  const subscription = overview.subscription;

  if (subscription?.state === 'past_due') {
    return subscription.purchaser.isYou
      ? {
        kind: 'payer-issue',
        id: `payer-issue:${subscription.id}`,
        amountMinor: subscription.failedCharge?.amountMinor ?? subscription.renewalAmountMinor,
        graceEndsOn: subscription.graceEndsAt,
      }
      : {
        kind: 'other-issue',
        id: `other-issue:${subscription.id}`,
        payerName: subscription.purchaser.name,
        graceEndsOn: subscription.graceEndsAt,
      };
  }

  const today = toIstDateKey(options.now ?? new Date());
  const linked = getLinkedDevices(overview);
  const liveSubscription = isLiveSubscription(subscription) && subscription?.state !== 'cancelled';
  const graceDevice = minBy(
    linked.filter(device => device.coverage === 'grace' && device.graceEndsAt && device.enforcementEnabled),
    device => daysBetween(today, device.graceEndsAt!),
  );

  if (graceDevice && !liveSubscription) {
    return {
      kind: 'grace',
      id: `grace:${graceDevice.deviceId}`,
      reason: subscription ? 'plan' : 'trial',
      childName: options.nameForDevice(graceDevice.deviceId),
      graceEndsOn: graceDevice.graceEndsAt!,
      canBuy: overview.purchasesEnabled,
    };
  }

  if (subscription || overview.pendingCheckout || !overview.purchasesEnabled) {
    return null;
  }

  const soonest = minBy(linked.filter(device => device.coverage === 'trial'), device => device.trialDaysRemaining);

  if (!soonest || soonest.trialDaysRemaining > TRIAL_ENDING_WINDOW_DAYS) {
    return null;
  }

  return {
    kind: 'trial-ending',
    id: `trial-ending:${soonest.deviceId}:${soonest.trialEndsAt}`,
    childName: options.nameForDevice(soonest.deviceId),
    daysLeft: soonest.trialDaysRemaining,
    endsOn: soonest.trialEndsAt,
  };
}

export type ChildLockAction = 'choose-plan' | 'add-shoe' | 'see-plan' | null;

export type ChildLock = {
  locked: boolean;
  device: BillingDeviceDto | null;
  /** Whether the shoe was last covered by its free month or by a plan. */
  endedReason: 'trial' | 'plan';
  endedOn: string | null;
  action: ChildLockAction;
};

export function getDeviceForChild(overview: BillingOverviewDto | null, childId: string | null) {
  if (!overview || !childId) {
    return null;
  }

  return overview.devices.find(device => device.childId === childId) ?? null;
}

/**
 * Whether a child's tracking is paused, combining the billing overview with a
 * SUBSCRIPTION_REQUIRED response seen for that child. A shoe the overview
 * reports as covered wins over a stale error.
 */
export function getChildLock(
  overview: BillingOverviewDto | null,
  childId: string | null,
  sawSubscriptionRequired: boolean,
): ChildLock {
  const device = getDeviceForChild(overview, childId);
  const overviewLocked = Boolean(device && device.coverage === 'expired' && device.enforcementEnabled);
  const locked = device ? overviewLocked || (sawSubscriptionRequired && device.coverage === 'expired') : sawSubscriptionRequired;
  const endedReason = device?.coveredUntil ? 'plan' : 'trial';

  return {
    locked,
    device,
    endedReason,
    endedOn: device ? device.coveredUntil ?? device.trialEndsAt : null,
    action: locked ? getLockAction(overview) : null,
  };
}

function getLockAction(overview: BillingOverviewDto | null): ChildLockAction {
  if (!overview) {
    return null;
  }

  const subscription = overview.subscription;

  if (isLiveSubscription(subscription)) {
    return subscription!.purchaser.isYou && overview.purchasesEnabled ? 'add-shoe' : 'see-plan';
  }

  return overview.purchasesEnabled ? 'choose-plan' : null;
}

/** Choose a plan starts with every linked, uncovered shoe selected, up to the max. */
export function getDefaultPlanSelection(overview: BillingOverviewDto) {
  return getLinkedDevices(overview)
    .filter(device => device.coverage !== 'legacy' && device.coverage !== 'support')
    .slice(0, overview.prices.maxShoes)
    .map(device => device.deviceId);
}

/** Shoes that can still join the current plan. */
export function getAddableDevices(overview: BillingOverviewDto) {
  const onPlan = new Set(overview.subscription?.deviceIds ?? []);
  return overview.devices.filter(device => !onPlan.has(device.deviceId) && !device.onPlan);
}

/** Subtitle under a shoe in pickers: "Free · 12 days", "On plan", "Not linked". */
export function describeDeviceStatus(device: BillingDeviceDto) {
  if (device.onPlan) {
    return 'On plan';
  }

  if (!device.childId) {
    return 'Not linked';
  }

  switch (device.coverage) {
    case 'trial':
      return `Free · ${device.trialDaysRemaining === 1 ? '1 day' : `${device.trialDaysRemaining} days`}`;
    case 'grace':
      return 'Free month ended';
    case 'expired':
      return 'Paused';
    case 'paid':
    case 'provisional':
      return 'On plan';
    case 'legacy':
    case 'support':
      return 'Covered';
    default:
      return '';
  }
}
