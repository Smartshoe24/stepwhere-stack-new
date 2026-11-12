import { describe, expect, it } from 'vitest';

import type { OverviewChildCard } from '@/features/overview/overview-ui';

import {
  countLinkedShoes,
  formatChildCount,
  formatCountdown,
  formatFamilyCount,
  formatFamilyRole,
  formatMemberCount,
  formatShoeCount,
  getInitials,
  maskPhoneNumber,
} from './profile-formatters';

function childWithDevice(hardwareIdentifier: string | null): OverviewChildCard {
  return {
    deviceSummary: hardwareIdentifier === null
      ? null
      : { hardwareIdentifier, id: 'device', displayName: null, platform: null, status: null, lastSeenAt: null },
  } as unknown as OverviewChildCard;
}

describe('getInitials', () => {
  it('takes at most the first two words', () => {
    expect(getInitials('Ada Lovelace King')).toBe('AL');
  });

  it('collapses irregular whitespace instead of emitting blanks', () => {
    expect(getInitials('  ada   lovelace  ')).toBe('AL');
  });

  it('falls back to P rather than an empty string', () => {
    expect(getInitials('   ')).toBe('P');
  });
});

describe('countLinkedShoes', () => {
  it('counts only children with a bound device, not every child', () => {
    const children = [
      childWithDevice('SW-1'),
      childWithDevice(null),
      childWithDevice('SW-2'),
    ];

    expect(countLinkedShoes(children)).toBe(2);
  });

  it('ignores a device summary with no hardware identifier', () => {
    expect(countLinkedShoes([childWithDevice(null)])).toBe(0);
  });
});

describe('count copy', () => {
  it('singularizes child correctly rather than emitting "1 childs"', () => {
    expect(formatChildCount(1)).toBe('1 child');
    expect(formatChildCount(2)).toBe('2 children');
  });

  it('pluralizes shoes and members on the boundary', () => {
    expect(formatShoeCount(1)).toBe('1 connected shoe');
    expect(formatShoeCount(0)).toBe('0 connected shoes');
    expect(formatMemberCount(1)).toBe('1 family member');
    expect(formatMemberCount(3)).toBe('3 family members');
  });
});

describe('formatFamilyCount', () => {
  it('prefers the real count over the role label', () => {
    expect(formatFamilyCount(2, 'admin')).toBe('2 family members');
  });

  it('falls back to the role when the count has not loaded', () => {
    expect(formatFamilyCount(null, 'admin')).toBe('Family admin');
    expect(formatFamilyCount(null, 'member')).toBe('Family member');
    expect(formatFamilyCount(null, null)).toBe('Family setup pending');
  });

  it('keeps a zero count instead of treating it as missing', () => {
    expect(formatFamilyCount(0, 'admin')).toBe('0 family members');
  });
});

describe('formatFamilyRole', () => {
  it('never leaks a raw enum into copy', () => {
    expect(formatFamilyRole('admin')).toBe('Family admin');
    expect(formatFamilyRole('member')).toBe('Family member');
  });
});

describe('formatCountdown', () => {
  it('zero-pads both fields so the width never jitters', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(600)).toBe('10:00');
  });

  it('clamps negative input rather than rendering a negative clock', () => {
    expect(formatCountdown(-5)).toBe('00:00');
  });
});

describe('maskPhoneNumber', () => {
  it('keeps the country prefix and last two digits', () => {
    expect(maskPhoneNumber('+919876543210')).toBe('+91\u00B7\u00B7\u00B7\u00B710');
  });

  it('does not mask a value too short to mask', () => {
    expect(maskPhoneNumber('+91')).toBe('+91');
  });

  it('degrades to a readable phrase when the number is missing', () => {
    expect(maskPhoneNumber(null)).toBe('your phone');
    expect(maskPhoneNumber(undefined)).toBe('your phone');
  });
});
