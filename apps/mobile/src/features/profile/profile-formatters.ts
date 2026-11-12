import type { OverviewChildCard } from '@/features/overview/overview-ui';

export type FamilyMemberRole = 'admin' | 'member' | null;

/**
 * Single source for user-facing profile copy and number formatting, mirroring
 * `history-formatters.ts`. No raw enum reaches the UI from here.
 */

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return (
    parts
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'P'
  );
}

export function formatMonthYear(value: string | null | undefined) {
  if (!value) {
    return 'recently';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function formatFamilyRole(role: FamilyMemberRole) {
  if (role === 'admin') {
    return 'Family admin';
  }

  if (role === 'member') {
    return 'Family member';
  }

  return 'Family setup pending';
}

export function formatFamilyCount(count: number | null, role: FamilyMemberRole) {
  if (typeof count === 'number') {
    return `${count} family member${count === 1 ? '' : 's'}`;
  }

  return formatFamilyRole(role);
}

export function formatConnectedChildrenSummary(count: number) {
  return `${count} connected`;
}

/**
 * A shoe is a linked tracker device. `deviceSummary` is null until a device is
 * bound, so the count is not the same as the child count.
 */
export function countLinkedShoes(children: OverviewChildCard[]) {
  return children.filter(child => Boolean(child.deviceSummary?.hardwareIdentifier)).length;
}

export function formatChildCount(count: number) {
  return `${count} child${count === 1 ? '' : 'ren'}`;
}

export function formatShoeCount(count: number) {
  return `${count} connected shoe${count === 1 ? '' : 's'}`;
}

export function formatMemberCount(count: number) {
  return `${count} family member${count === 1 ? '' : 's'}`;
}

/** `mm:ss`, for OTP resend and expiry countdowns. */
export function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatGracePeriodEnd(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function maskPhoneNumber(phoneNumber: string | null | undefined) {
  if (!phoneNumber) {
    return 'your phone';
  }

  const trimmed = phoneNumber.trim();

  if (trimmed.length <= 4) {
    return trimmed;
  }

  return `${trimmed.slice(0, 3)}\u00B7\u00B7\u00B7\u00B7${trimmed.slice(-2)}`;
}
