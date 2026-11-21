import { describe, expect, it } from 'vitest';

import {
  daysBetween,
  formatBillingDate,
  formatPerMonth,
  formatRelativeBillingDate,
  formatRupees,
  formatRupeesExact,
  getTermSavingPercent,
  joinNames,
  toIstDateKey,
} from './billing-format';

const NOW = new Date('2026-11-14T06:30:00Z');

describe('formatRupees', () => {
  it('drops decimals for whole rupees and groups the Indian way', () => {
    expect(formatRupees(109_800)).toBe('₹1,098');
    expect(formatRupees(500_000)).toBe('₹5,000');
    expect(formatRupees(12_345_600)).toBe('₹1,23,456');
    expect(formatRupees(100)).toBe('₹1');
  });

  it('keeps paise when there are any', () => {
    expect(formatRupees(105_650)).toBe('₹1,056.50');
    expect(formatRupees(5)).toBe('₹0.05');
  });

  it('uses a true minus sign for credits', () => {
    expect(formatRupees(-4_200)).toBe('−₹42');
  });

  it('always shows two decimals on invoice lines', () => {
    expect(formatRupeesExact(109_800)).toBe('₹1,098.00');
    expect(formatRupeesExact(89_492)).toBe('₹894.92');
  });
});

describe('billing dates', () => {
  it('omits the year only for the current year', () => {
    expect(formatBillingDate('2026-11-26', NOW)).toBe('26 Nov');
    expect(formatBillingDate('2027-05-26', NOW)).toBe('26 May 2027');
  });

  it('reads timestamps in India time', () => {
    // 20:00 UTC on 25 Nov is already 26 Nov in India.
    expect(formatBillingDate('2026-11-25T20:00:00Z', NOW)).toBe('26 Nov');
    expect(toIstDateKey(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
  });

  it('says Today and Tomorrow for the next two days', () => {
    expect(formatRelativeBillingDate('2026-11-14', NOW)).toBe('Today');
    expect(formatRelativeBillingDate('2026-11-15', NOW)).toBe('Tomorrow');
    expect(formatRelativeBillingDate('2026-11-26', NOW)).toBe('26 Nov');
  });

  it('counts calendar days across a mix of keys and timestamps', () => {
    expect(daysBetween('2026-11-14', '2026-11-26')).toBe(12);
    expect(daysBetween('2026-11-26', '2027-05-26T00:00:00+05:30')).toBe(181);
  });
});

describe('plan pricing copy', () => {
  const prices = [
    { termMonths: 3 as const, perShoeMinor: 39_700 },
    { termMonths: 6 as const, perShoeMinor: 54_900 },
    { termMonths: 12 as const, perShoeMinor: 89_900 },
  ];

  it('rounds the monthly equivalent to whole rupees', () => {
    expect(formatPerMonth(79_400, 3)).toBe('₹265 a month');
    expect(formatPerMonth(109_800, 6)).toBe('₹183 a month');
    expect(formatPerMonth(179_800, 12)).toBe('₹150 a month');
  });

  it('compares each term with the shortest one', () => {
    expect(getTermSavingPercent(prices, 3)).toBeNull();
    expect(getTermSavingPercent(prices, 6)).toBe(31);
    expect(getTermSavingPercent(prices, 12)).toBe(43);
  });

  it('joins names like a sentence', () => {
    expect(joinNames(['Riya'])).toBe('Riya');
    expect(joinNames(['Riya', 'Arjun'])).toBe('Riya and Arjun');
    expect(joinNames(['Riya', 'Arjun', 'Kabir'])).toBe('Riya, Arjun and Kabir');
  });
});
