import type { AccountDeletionImpactDto } from '@stepwhere/types';

import { describe, expect, it } from 'vitest';

import {
  buildDeletionRows,
  getDeletionCaveat,
  getDeletionRecap,
  getDeletionSummary,
} from './account-deletion-visuals';

function impact(overrides: Partial<AccountDeletionImpactDto> = {}): AccountDeletionImpactDto {
  return {
    childCount: 0,
    familyMemberCount: 0,
    familyName: null,
    isFamilyAdmin: false,
    scope: 'family',
    shoeCount: 0,
    trackingStops: false,
    willTransferAdmin: false,
    ...overrides,
  };
}

describe('buildDeletionRows', () => {
  it('always leads with the account, which is removed in every scope', () => {
    const rows = buildDeletionRows(impact({ scope: 'user_only' }));

    expect(rows[0]?.key).toBe('account');
    expect(rows[0]?.tone).toBe('removed');
  });

  it('marks family data kept when only the user is deleted', () => {
    const rows = buildDeletionRows(impact({
      scope: 'user_only',
      familyName: 'Sharma',
      childCount: 2,
      shoeCount: 2,
    }));
    const tones = Object.fromEntries(rows.map(row => [row.key, row.tone]));

    expect(tones.account).toBe('removed');
    expect(tones.family).toBe('kept');
    expect(tones.children).toBe('kept');
    expect(tones.shoes).toBe('kept');
    expect(tones.history).toBe('kept');
  });

  it('marks family data removed when the whole family goes', () => {
    const rows = buildDeletionRows(impact({
      scope: 'family',
      familyName: 'Sharma',
      childCount: 1,
      shoeCount: 1,
    }));

    expect(rows.every(row => row.tone === 'removed')).toBe(true);
  });

  it('omits rows for things that do not exist rather than showing zeroes', () => {
    const keys = buildDeletionRows(impact()).map(row => row.key);

    expect(keys).not.toContain('children');
    expect(keys).not.toContain('shoes');
    expect(keys).not.toContain('family');
  });

  it('singularizes counts on the boundary', () => {
    const rows = buildDeletionRows(impact({ childCount: 1, shoeCount: 1 }));
    const details = Object.fromEntries(rows.map(row => [row.key, row.detail]));

    expect(details.children).toBe('1 child');
    expect(details.shoes).toBe('1 shoe');
  });

  it('pluralizes counts above one', () => {
    const rows = buildDeletionRows(impact({ childCount: 3, shoeCount: 2 }));
    const details = Object.fromEntries(rows.map(row => [row.key, row.detail]));

    expect(details.children).toBe('3 children');
    expect(details.shoes).toBe('2 shoes');
  });

  it('prefers the family name over a member count as the family detail', () => {
    const rows = buildDeletionRows(impact({ familyName: 'Sharma', familyMemberCount: 3 }));

    expect(rows.find(row => row.key === 'family')?.detail).toBe('Sharma');
  });

  it('falls back to a member count when the family is unnamed', () => {
    const rows = buildDeletionRows(impact({ familyName: null, familyMemberCount: 3 }));

    expect(rows.find(row => row.key === 'family')?.detail).toBe('3 members');
  });
});

describe('getDeletionSummary', () => {
  it('distinguishes the two scopes in one line each', () => {
    expect(getDeletionSummary(impact({ scope: 'family' }))).toBe('This removes everything below.');
    expect(getDeletionSummary(impact({ scope: 'user_only' })))
      .toBe('Only your account is removed. The family keeps everything else.');
  });
});

describe('getDeletionCaveat', () => {
  it('surfaces the admin transfer above a tracking stop', () => {
    expect(getDeletionCaveat(impact({ willTransferAdmin: true, trackingStops: true })))
      .toBe('Admin moves to another member.');
  });

  it('mentions tracking only when the family is being deleted', () => {
    expect(getDeletionCaveat(impact({ scope: 'family', trackingStops: true })))
      .toBe('Tracking stops immediately.');
    expect(getDeletionCaveat(impact({ scope: 'user_only', trackingStops: true }))).toBeNull();
  });

  it('stays silent when there is nothing exceptional to say', () => {
    expect(getDeletionCaveat(impact())).toBeNull();
  });
});

describe('getDeletionRecap', () => {
  it('keeps the user-only case to a single short clause', () => {
    expect(getDeletionRecap(impact({ scope: 'user_only', childCount: 2 })))
      .toBe('Removes your account only.');
  });

  it('names both counts when present', () => {
    expect(getDeletionRecap(impact({ childCount: 2, shoeCount: 3 })))
      .toBe('Removes your family, 2 children and 3 shoes.');
  });

  it('drops the absent count instead of printing a zero', () => {
    expect(getDeletionRecap(impact({ childCount: 1, shoeCount: 0 })))
      .toBe('Removes your family, 1 child.');
  });

  it('degrades to family-only wording when there is nothing to enumerate', () => {
    expect(getDeletionRecap(impact())).toBe('Removes your account and family.');
  });
});
