import type { AccountDeletionImpactDto } from '@stepwhere/types';

import type { AppIconName } from '@/components/ui/app-icon';

/**
 * Pure presentation logic for the deletion review screen, split out so the copy
 * can be tested without rendering. Mirrors `history-event-visuals.ts`: a single
 * source for what each consequence row says, so the review screen and the OTP
 * recap cannot drift apart.
 */

export type DeletionRowTone = 'removed' | 'kept';

export type DeletionRow = {
  icon: AppIconName;
  /** Right-aligned; short and scannable, never a sentence. */
  detail: string;
  key: string;
  label: string;
  tone: DeletionRowTone;
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * One row per consequence. Deleting your own account out of a shared family
 * removes far less than deleting the family, and the row tone is what carries
 * that distinction — not a paragraph explaining it.
 */
export function buildDeletionRows(impact: AccountDeletionImpactDto): DeletionRow[] {
  const rows: DeletionRow[] = [
    {
      icon: 'user',
      detail: 'Profile and sign-in',
      key: 'account',
      label: 'Your account',
      tone: 'removed',
    },
  ];

  const familyTone: DeletionRowTone = impact.scope === 'family' ? 'removed' : 'kept';

  if (impact.familyName || impact.familyMemberCount > 0) {
    rows.push({
      icon: 'family',
      detail: impact.familyName ?? countLabel(impact.familyMemberCount, 'member', 'members'),
      key: 'family',
      label: 'Family',
      tone: familyTone,
    });
  }

  if (impact.childCount > 0) {
    rows.push({
      icon: 'children',
      detail: countLabel(impact.childCount, 'child', 'children'),
      key: 'children',
      label: 'Children',
      tone: familyTone,
    });
  }

  if (impact.shoeCount > 0) {
    rows.push({
      icon: 'shoe',
      detail: countLabel(impact.shoeCount, 'shoe', 'shoes'),
      key: 'shoes',
      label: 'Shoes',
      tone: familyTone,
    });
  }

  rows.push({
    icon: 'logs',
    detail: 'Location and activity',
    key: 'history',
    label: 'History',
    tone: familyTone,
  });

  return rows;
}

/** Single line above the rows. Replaces four stacked prose blocks. */
export function getDeletionSummary(impact: AccountDeletionImpactDto) {
  if (impact.scope === 'family') {
    return 'This removes everything below.';
  }

  return 'Only your account is removed. The family keeps everything else.';
}

/** Shown once, near the rows, only when it is actually true. */
export function getDeletionCaveat(impact: AccountDeletionImpactDto) {
  if (impact.willTransferAdmin) {
    return 'Admin moves to another member.';
  }

  if (impact.scope === 'family' && impact.trackingStops) {
    return 'Tracking stops immediately.';
  }

  return null;
}

/** Compact recap for the OTP step, where the rows are not repeated. */
export function getDeletionRecap(impact: AccountDeletionImpactDto) {
  if (impact.scope !== 'family') {
    return 'Removes your account only.';
  }

  const parts = [
    impact.childCount > 0 ? countLabel(impact.childCount, 'child', 'children') : null,
    impact.shoeCount > 0 ? countLabel(impact.shoeCount, 'shoe', 'shoes') : null,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return 'Removes your account and family.';
  }

  return `Removes your family, ${parts.join(' and ')}.`;
}
