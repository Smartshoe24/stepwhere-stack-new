import * as SecureStore from 'expo-secure-store';

import type { AuthOtpIntent, PrepareOtpResponseDto } from '@stepwhere/types';

const STORAGE_KEY = 'stepwhere.phone-otp-challenge';

export type OtpChallengePreferredPhase = 'form' | 'otp';

export type PersistedOtpChallengeSession = {
  challengeToken: string;
  expiresAt: string;
  intent: AuthOtpIntent;
  phoneNumber: string;
  preferredPhase: OtpChallengePreferredPhase;
  resendAvailableAt: string;
};

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function isPersistedSession(value: unknown): value is PersistedOtpChallengeSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedOtpChallengeSession>;

  return typeof candidate.challengeToken === 'string'
    && candidate.challengeToken.length > 0
    && isValidDate(candidate.expiresAt)
    && (candidate.intent === 'signin' || candidate.intent === 'signup')
    && typeof candidate.phoneNumber === 'string'
    && /^\+[1-9]\d{7,14}$/.test(candidate.phoneNumber)
    && (candidate.preferredPhase === 'form' || candidate.preferredPhase === 'otp')
    && isValidDate(candidate.resendAvailableAt);
}

export function createOtpChallengeSession(
  response: PrepareOtpResponseDto,
  preferredPhase: OtpChallengePreferredPhase = 'otp',
): PersistedOtpChallengeSession {
  return {
    challengeToken: response.challengeToken,
    expiresAt: response.expiresAt,
    intent: response.intent,
    phoneNumber: response.phoneNumber,
    preferredPhase,
    resendAvailableAt: response.resendAvailableAt,
  };
}

export function isOtpChallengeSessionActive(
  session: PersistedOtpChallengeSession,
  now = Date.now(),
) {
  return new Date(session.expiresAt).getTime() > now;
}

export function getOtpResendCountdown(
  session: PersistedOtpChallengeSession | null,
  now = Date.now(),
) {
  if (!session) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((new Date(session.resendAvailableAt).getTime() - now) / 1000),
  );
}

export async function getOtpChallengeSession() {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (isPersistedSession(parsed) && isOtpChallengeSessionActive(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid records are discarded below.
  }

  await SecureStore.deleteItemAsync(STORAGE_KEY);
  return null;
}

export async function saveOtpChallengeSession(session: PersistedOtpChallengeSession) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
}

export async function clearOtpChallengeSession() {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
