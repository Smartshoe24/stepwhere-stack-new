import * as SecureStore from 'expo-secure-store';
import type {
  AccountDeletionChallengeDto,
  AccountDeletionImpactDto,
} from '@stepwhere/types';

/**
 * Namespaced away from `stepwhere.phone-otp-challenge` on purpose. That record is
 * validated against signin/signup intents only, and a deletion challenge stored
 * under the same key would collide with a pending auth challenge.
 */
const STORAGE_KEY = 'stepwhere.account-deletion-challenge';

export type AccountDeletionImpact = AccountDeletionImpactDto;
export type PersistedAccountDeletionChallenge = AccountDeletionChallengeDto;

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function isImpact(value: unknown): value is AccountDeletionImpact {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AccountDeletionImpact>;

  return typeof candidate.childCount === 'number'
    && typeof candidate.familyMemberCount === 'number'
    && typeof candidate.isFamilyAdmin === 'boolean'
    && typeof candidate.shoeCount === 'number'
    && (candidate.scope === 'user_only' || candidate.scope === 'family')
    && typeof candidate.trackingStops === 'boolean'
    && typeof candidate.willTransferAdmin === 'boolean'
    && (candidate.familyName === null || typeof candidate.familyName === 'string');
}

function isPersistedChallenge(value: unknown): value is PersistedAccountDeletionChallenge {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedAccountDeletionChallenge>;

  return typeof candidate.challengeToken === 'string'
    && candidate.challengeToken.length > 0
    && isValidDate(candidate.expiresAt)
    && isValidDate(candidate.resendAvailableAt)
    && typeof candidate.phoneNumber === 'string'
    && candidate.phoneNumber.length > 0
    && isImpact(candidate.impact);
}

export function isAccountDeletionChallengeActive(
  challenge: PersistedAccountDeletionChallenge,
  now = Date.now(),
) {
  return new Date(challenge.expiresAt).getTime() > now;
}

export function getAccountDeletionResendCountdown(
  challenge: PersistedAccountDeletionChallenge | null,
  now = Date.now(),
) {
  if (!challenge) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((new Date(challenge.resendAvailableAt).getTime() - now) / 1000),
  );
}

export function getAccountDeletionExpiryCountdown(
  challenge: PersistedAccountDeletionChallenge | null,
  now = Date.now(),
) {
  if (!challenge) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 1000),
  );
}

export async function getAccountDeletionChallenge() {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (isPersistedChallenge(parsed) && isAccountDeletionChallengeActive(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid records are discarded below.
  }

  await SecureStore.deleteItemAsync(STORAGE_KEY);
  return null;
}

export async function saveAccountDeletionChallenge(
  challenge: PersistedAccountDeletionChallenge,
) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(challenge));
}

export async function clearAccountDeletionChallenge() {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

/**
 * A one-shot flag so the sign-in screen can explain why the user landed there.
 *
 * A route param does not survive this transition: `signOut` flips auth state and
 * the `(app)` layout redirects to `/auth/sign-in` on its own, discarding any
 * params we would have attached. The flag is written before sign-out and cleared
 * by whoever reads it.
 */
const NOTICE_KEY = 'stepwhere.account-deletion-notice';

export async function markAccountDeletionNotice(deletionScheduledFor: string | null) {
  await SecureStore.setItemAsync(NOTICE_KEY, deletionScheduledFor ?? '');
}

export async function consumeAccountDeletionNotice() {
  const raw = await SecureStore.getItemAsync(NOTICE_KEY);

  if (raw === null) {
    return null;
  }

  await SecureStore.deleteItemAsync(NOTICE_KEY);

  return { deletionScheduledFor: raw.length > 0 ? raw : null };
}
