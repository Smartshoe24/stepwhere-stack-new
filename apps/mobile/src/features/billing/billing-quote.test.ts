import type { BillingDeviceDto, BillingQuoteDto } from '@stepwhere/types';
import { describe, expect, it } from 'vitest';

import { describeFirstChargeFinePrint, describeSchedule, getQuoteFingerprint, isQuoteExpired } from './billing-quote';

const NOW = new Date('2026-11-14T06:30:00Z');
const NAMES: Record<string, string> = { riya: 'Riya', arjun: 'Arjun', kabir: 'Kabir' };

function device(id: string, trialEndsAt: string): BillingDeviceDto {
  return {
    deviceId: id, hardwareIdentifier: id, displayName: null, childId: `child-${id}`,
    trialStartsAt: '2026-10-27', trialEndsAt, trialDaysRemaining: 12, coverage: 'trial',
    coveredUntil: null, graceEndsAt: null, expiringSoon: false, onPlan: false, nextOnPlan: null,
    autoRenews: false, enforcementEnabled: true,
  };
}

const context = {
  devices: [device('riya', '2026-11-26'), device('arjun', '2026-12-10')],
  nameForDevice: (id: string) => NAMES[id] ?? id,
  now: NOW,
};

// Riya and Arjun, 6 months, from the plan's worked example.
const quote: BillingQuoteDto = {
  id: 'q-1', kind: 'new_plan', expiresAt: '2026-11-14T06:45:00Z', currency: 'INR',
  deviceIds: ['riya', 'arjun'], addedDeviceIds: ['riya', 'arjun'],
  shoeCount: 2, termMonths: 6, perShoeMinor: 54_900, renewalAmountMinor: 109_800,
  startsAt: '2026-11-26', periodEndsAt: '2027-05-26', coverageStartsNow: false,
  credits: [{ deviceId: 'arjun', days: 14, amountMinor: 4_200 }],
  schedule: [
    { kind: 'verify', on: '2026-11-14', amountMinor: 100, baseMinor: 100, creditMinor: 0, deviceIds: [], refunded: true },
    { kind: 'first', on: '2026-11-26', amountMinor: 105_600, baseMinor: 109_800, creditMinor: 4_200, deviceIds: ['riya', 'arjun'], refunded: false },
    { kind: 'renewal', on: '2027-05-26', amountMinor: 109_800, baseMinor: 109_800, creditMinor: 0, deviceIds: ['riya', 'arjun'], refunded: false },
  ],
  requiresMandate: true, mandateMaxMinor: 500_000,
};

describe('describeSchedule', () => {
  it('matches the Review plan timeline', () => {
    expect(describeSchedule(quote, context).map(({ when, title, subtitle, amount }) => ({ when, title, subtitle, amount }))).toEqual([
      { when: 'Today', title: 'Verify autopay', subtitle: 'Refunded automatically', amount: '₹1' },
      {
        when: '26 Nov',
        title: 'Riya’s free month ends',
        subtitle: '₹1,098 minus ₹42 for Arjun’s 14 extra free days',
        amount: '₹1,056',
      },
      { when: '26 May 2027', title: 'Plan renews', subtitle: 'Then every 6 months until you cancel', amount: '₹1,098' },
    ]);
  });

  it('describes an added shoe and the bigger renewal', () => {
    const addQuote: BillingQuoteDto = {
      ...quote,
      kind: 'add_shoes',
      deviceIds: ['riya', 'arjun', 'kabir'],
      addedDeviceIds: ['kabir'],
      shoeCount: 3,
      credits: [],
      schedule: [
        { kind: 'add_shoes', on: '2027-01-03', amountMinor: 43_400, baseMinor: 43_400, creditMinor: 0, deviceIds: ['kabir'], refunded: false },
        { kind: 'renewal', on: '2027-05-26', amountMinor: 164_700, baseMinor: 164_700, creditMinor: 0, deviceIds: ['riya', 'arjun', 'kabir'], refunded: false },
      ],
    };
    const lines = describeSchedule(addQuote, { ...context, devices: [...context.devices, device('kabir', '2027-01-03')] });
    expect(lines[0]).toMatchObject({
      title: 'Kabir’s free month ends',
      subtitle: 'Covers Kabir until 26 May 2027, when your plan renews',
      amount: '₹434',
    });
    expect(lines[1]).toMatchObject({ title: 'Plan renews for 3 shoes', subtitle: 'Then every 6 months', amount: '₹1,647' });
  });
});

describe('describeFirstChargeFinePrint', () => {
  it('names the first charge, whose free month ends, and the credit', () => {
    expect(describeFirstChargeFinePrint(quote, context)).toEqual([
      'First charge ',
      { bold: '₹1,056 on 26 Nov' },
      ', when Riya’s free month ends.',
      ' Arjun’s extra free days come off it.',
    ]);
  });

  it('says tracking starts straight away when no free days are left', () => {
    const now: BillingQuoteDto = {
      ...quote,
      coverageStartsNow: true,
      credits: [],
      schedule: [{ ...quote.schedule[1]!, on: '2026-11-15', amountMinor: 109_800, creditMinor: 0 }],
    };
    expect(describeFirstChargeFinePrint(now, context)).toEqual([
      'Tracking starts as soon as autopay is set up. First charge ',
      { bold: '₹1,098 on 15 Nov' },
      '.',
    ]);
  });
});

describe('quote freshness', () => {
  it('expires at expiresAt', () => {
    expect(isQuoteExpired(quote, new Date('2026-11-14T06:44:59Z').getTime())).toBe(false);
    expect(isQuoteExpired(quote, new Date('2026-11-14T06:45:00Z').getTime())).toBe(true);
  });

  it('ignores the quote id when comparing what the user agreed to', () => {
    expect(getQuoteFingerprint({ ...quote, id: 'q-2', expiresAt: 'later' })).toBe(getQuoteFingerprint(quote));
    expect(getQuoteFingerprint({ ...quote, renewalAmountMinor: 120_000 })).not.toBe(getQuoteFingerprint(quote));
  });
});
