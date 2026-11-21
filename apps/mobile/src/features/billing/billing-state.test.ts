import type {
  BillingDeviceDto,
  BillingOverviewDto,
  BillingSubscriptionDto,
} from '@stepwhere/types';
import { describe, expect, it } from 'vitest';

import {
  deriveSubscriptionCardState,
  describeDeviceStatus,
  getChildLock,
  getDefaultPlanSelection,
  selectHomeBanner,
} from './billing-state';

// The worked example from the plan: today is 14 Nov 2026, Riya's free month
// ends 26 Nov, Arjun's 10 Dec; Priya pays for a 2-shoe, 6-month plan.
const NOW = new Date('2026-11-14T06:30:00Z');
const NAMES: Record<string, string> = { riya: 'Riya', arjun: 'Arjun', kabir: 'Kabir', spare: 'Spare shoe' };
const options = { nameForDevice: (id: string) => NAMES[id] ?? id, now: NOW };

function device(id: string, overrides: Partial<BillingDeviceDto> = {}): BillingDeviceDto {
  return {
    deviceId: id,
    hardwareIdentifier: `HW-${id}`,
    displayName: null,
    childId: id === 'spare' ? null : `child-${id}`,
    trialStartsAt: '2026-10-27T00:00:00+05:30',
    trialEndsAt: '2026-11-26T00:00:00+05:30',
    trialDaysRemaining: 12,
    coverage: 'trial',
    coveredUntil: null,
    graceEndsAt: null,
    expiringSoon: false,
    onPlan: false,
    nextOnPlan: null,
    autoRenews: false,
    enforcementEnabled: true,
    ...overrides,
  };
}

function subscription(overrides: Partial<BillingSubscriptionDto> = {}): BillingSubscriptionDto {
  return {
    id: 'sub-1',
    state: 'active',
    currency: 'INR',
    shoeCount: 2,
    termMonths: 6,
    deviceIds: ['riya', 'arjun'],
    nextDeviceIds: null,
    nextTermMonths: null,
    perShoeMinor: 54_900,
    renewalAmountMinor: 109_800,
    periodStartsAt: '2026-11-26',
    periodEndsAt: '2027-05-26',
    graceEndsAt: '2027-05-29',
    cancelAtPeriodEnd: false,
    nextCharge: { id: 'ch-2', kind: 'renewal', status: 'scheduled', dueOn: '2027-05-26', amountMinor: 109_800, retryOn: null },
    failedCharge: null,
    autopay: { status: 'active', method: 'upi', label: 'HDFC Bank ••4321' },
    pendingCheckoutId: null,
    purchaser: { isYou: true, name: 'Priya' },
    revision: 3,
    ...overrides,
  };
}

function overview(overrides: Partial<BillingOverviewDto> = {}): BillingOverviewDto {
  return {
    purchasesEnabled: true,
    enforcementEnabled: true,
    prices: {
      currency: 'INR',
      version: 1,
      maxShoes: 5,
      mandateMaxMinor: 500_000,
      prices: [
        { termMonths: 3, perShoeMinor: 39_700 },
        { termMonths: 6, perShoeMinor: 54_900 },
        { termMonths: 12, perShoeMinor: 89_900 },
      ],
    },
    devices: [
      device('riya'),
      device('arjun', { trialEndsAt: '2026-12-10T00:00:00+05:30', trialDaysRemaining: 26 }),
    ],
    subscription: null,
    pendingCheckout: null,
    ...overrides,
  };
}

const onPlan = { coverage: 'paid' as const, onPlan: true, coveredUntil: '2027-05-26' };

describe('deriveSubscriptionCardState', () => {
  it('is hidden when purchases are off and there is no plan', () => {
    expect(deriveSubscriptionCardState(overview({ purchasesEnabled: false }), options)).toEqual({ kind: 'hidden' });
  });

  it('is hidden with no linked shoes', () => {
    expect(deriveSubscriptionCardState(overview({ devices: [device('spare')] }), options).kind).toBe('hidden');
  });

  it('shows the free trial, following the shoe with the fewest days left', () => {
    const state = deriveSubscriptionCardState(overview(), options);
    expect(state).toMatchObject({ kind: 'trial', names: ['Riya', 'Arjun'], daysLeft: 12 });
    expect(state.kind === 'trial' && state.progress).toBeCloseTo(0.6, 2);
  });

  it('switches to "free month ending" in the last 7 days', () => {
    const state = deriveSubscriptionCardState(overview({
      devices: [device('riya', { trialDaysRemaining: 3 }), device('arjun', { trialDaysRemaining: 17 })],
    }), options);
    expect(state).toMatchObject({ kind: 'ending', firstName: 'Riya', daysLeft: 3, graceEndsOn: null });
  });

  it('shows "starts on" once autopay is set but the plan has not begun', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({
        state: 'scheduled',
        nextCharge: { id: 'ch-1', kind: 'first', status: 'scheduled', dueOn: '2026-11-26', amountMinor: 105_600, retryOn: null },
      }),
    }), options);
    expect(state).toMatchObject({
      kind: 'scheduled',
      startsOn: '2026-11-26',
      firstCharge: { amountMinor: 105_600, dueOn: '2026-11-26' },
    });
  });

  it('waits for the bank on net banking', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({ state: 'scheduled', autopay: { status: 'bank_pending', method: 'enach', label: null } }),
    }), options);
    expect(state.kind).toBe('bank');
  });

  it('waits for the bank before a plan exists', () => {
    const state = deriveSubscriptionCardState(overview({
      pendingCheckout: { id: 'co-1', state: 'bank_pending', isYou: true, startedByName: 'Priya' },
    }), options);
    expect(state.kind).toBe('bank');
  });

  it('is active for the payer', () => {
    const state = deriveSubscriptionCardState(overview({ subscription: subscription() }), options);
    expect(state).toMatchObject({ kind: 'active', renewsOn: '2027-05-26', renewalAmountMinor: 109_800, isPayer: true });
  });

  it('is active and paid by someone else for the rest of the family', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({ purchaser: { isYou: false, name: 'Priya' } }),
    }), options);
    expect(state).toMatchObject({ kind: 'otherActive', payerName: 'Priya' });
  });

  it("won't renew after cancelling", () => {
    const state = deriveSubscriptionCardState(overview({ subscription: subscription({ cancelAtPeriodEnd: true }) }), options);
    expect(state).toMatchObject({ kind: 'cancelled', coveredUntil: '2027-05-26' });
  });

  it('shows autopay turned off in the UPI app', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({ autopay: { status: 'off_by_customer', method: 'upi', label: null } }),
    }), options);
    expect(state).toMatchObject({ kind: 'autopayOff', reason: 'off_by_customer' });
  });

  it('keeps the plan active while a replacement autopay is being set up', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({ autopay: { status: 'card_expired', method: 'card', label: null }, pendingCheckoutId: 'co-2' }),
    }), options);
    expect(state.kind).toBe('active');
  });

  it('shows a failed payment to the payer with the retry and grace dates', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({
        state: 'past_due',
        failedCharge: { id: 'ch-2', kind: 'renewal', status: 'failed', dueOn: '2027-05-26', amountMinor: 109_800, retryOn: '2027-05-27' },
      }),
    }), options);
    expect(state).toMatchObject({ kind: 'issue', amountMinor: 109_800, retryOn: '2027-05-27', graceEndsOn: '2027-05-29' });
  });

  it('shows a failed payment as someone else’s to the rest of the family', () => {
    const state = deriveSubscriptionCardState(overview({
      subscription: subscription({ state: 'past_due', purchaser: { isYou: false, name: 'Priya' } }),
    }), options);
    expect(state).toMatchObject({ kind: 'otherIssue', payerName: 'Priya', graceEndsOn: '2027-05-29' });
  });

  it('is expired when a shoe is paused and there is no plan', () => {
    const state = deriveSubscriptionCardState(overview({
      devices: [device('riya', { coverage: 'expired', trialDaysRemaining: 0 }), device('arjun', { coverage: 'expired', trialDaysRemaining: 0 })],
    }), options);
    expect(state).toMatchObject({ kind: 'expired', pausedCount: 2 });
  });

  it('is expired once the plan has ended', () => {
    const state = deriveSubscriptionCardState(overview({
      devices: [device('riya', { coverage: 'expired' }), device('arjun', { coverage: 'expired' })],
      subscription: subscription({ state: 'expired' }),
    }), options);
    expect(state).toMatchObject({ kind: 'expired', pausedCount: 2, graceEndsOn: null });
  });

  it('still shows a plan when purchases are switched off', () => {
    const state = deriveSubscriptionCardState(overview({ purchasesEnabled: false, subscription: subscription() }), options);
    expect(state.kind).toBe('active');
  });
});

describe('selectHomeBanner', () => {
  it('shows the free month reminder from 7 days before, only without a plan', () => {
    const ending = overview({ devices: [device('riya', { trialDaysRemaining: 3 }), device('arjun', { trialDaysRemaining: 17 })] });
    expect(selectHomeBanner(ending, options)).toMatchObject({ kind: 'trial-ending', childName: 'Riya', daysLeft: 3 });
    expect(selectHomeBanner(overview(), options)).toBeNull();
    expect(selectHomeBanner({ ...ending, subscription: subscription({ state: 'scheduled' }) }, options)).toBeNull();
    expect(selectHomeBanner({ ...ending, purchasesEnabled: false }, options)).toBeNull();
    expect(selectHomeBanner({
      ...ending,
      pendingCheckout: { id: 'co', state: 'awaiting_authorization', isYou: false, startedByName: 'Rahul' },
    }, options)).toBeNull();
  });

  it('tells the rest of the family the payer has to fix a failed payment', () => {
    const banner = selectHomeBanner(overview({
      subscription: subscription({ state: 'past_due', purchaser: { isYou: false, name: 'Priya' } }),
    }), options);
    expect(banner).toMatchObject({ kind: 'other-issue', payerName: 'Priya', graceEndsOn: '2027-05-29' });
  });

  it('counts down the grace after a plan ends', () => {
    const banner = selectHomeBanner(overview({
      devices: [device('riya', { coverage: 'grace', graceEndsAt: '2027-05-29' })],
      subscription: subscription({ state: 'expired' }),
    }), options);
    expect(banner).toMatchObject({ kind: 'grace', reason: 'plan', graceEndsOn: '2027-05-29' });
  });

  it('shows nothing when all is well', () => {
    expect(selectHomeBanner(overview({
      devices: [device('riya', onPlan), device('arjun', onPlan)],
      subscription: subscription(),
    }), options)).toBeNull();
  });
});

describe('getChildLock', () => {
  const paused = overview({ devices: [device('riya', { coverage: 'expired', trialDaysRemaining: 0 }), device('arjun', onPlan)] });

  it('locks only the uncovered child', () => {
    expect(getChildLock(paused, 'child-riya', false)).toMatchObject({ locked: true, endedReason: 'trial', action: 'choose-plan' });
    expect(getChildLock(paused, 'child-arjun', false).locked).toBe(false);
  });

  it('does not lock when enforcement is off for the shoe', () => {
    const relaxed = overview({ devices: [device('riya', { coverage: 'expired', enforcementEnabled: false })] });
    expect(getChildLock(relaxed, 'child-riya', false).locked).toBe(false);
  });

  it('trusts a covered shoe over a stale SUBSCRIPTION_REQUIRED', () => {
    expect(getChildLock(paused, 'child-arjun', true).locked).toBe(false);
  });

  it('locks from SUBSCRIPTION_REQUIRED alone when billing is unavailable', () => {
    expect(getChildLock(null, 'child-riya', true)).toMatchObject({ locked: true, action: null });
  });

  it('offers Add shoes to the payer of a live plan, and See plan to everyone else', () => {
    const withPlan = { ...paused, subscription: subscription() };
    expect(getChildLock(withPlan, 'child-riya', false).action).toBe('add-shoe');
    expect(getChildLock({
      ...withPlan,
      subscription: subscription({ purchaser: { isYou: false, name: 'Priya' } }),
    }, 'child-riya', false).action).toBe('see-plan');
  });
});

describe('plan pickers', () => {
  it('selects every linked shoe, but not spares or free-forever shoes, up to the max', () => {
    const picked = getDefaultPlanSelection(overview({
      devices: [device('riya'), device('arjun'), device('spare'), device('kabir', { coverage: 'legacy' })],
    }));
    expect(picked).toEqual(['riya', 'arjun']);
  });

  it('describes each shoe for the tiles', () => {
    expect(describeDeviceStatus(device('riya'))).toBe('Free · 12 days');
    expect(describeDeviceStatus(device('spare'))).toBe('Not linked');
    expect(describeDeviceStatus(device('riya', onPlan))).toBe('On plan');
    expect(describeDeviceStatus(device('riya', { coverage: 'expired' }))).toBe('Paused');
  });
});
