import * as SecureStore from 'expo-secure-store';

import type { DeviceReservationDto, PlaceDto } from '@stepwhere/types';

import { buildIdempotencyKey } from './add-child-utils';

const STORAGE_KEY = 'stepwhere.add-child-draft';

export type AddChildDraftAvatar = {
  contentType: string;
  fileName: string;
  fileSize: number;
  uri: string;
};

export type AddChildDraft = {
  avatar?: AddChildDraftAvatar | null;
  /**
   * Stable across retries of the same child submission. See the matching field
   * on `OnboardingDraft` — a fresh key per attempt defeats the server's
   * replay-by-key check.
   */
  childCreationIdempotencyKey?: string;
  childDateOfBirth?: string;
  childName?: string;
  reservation?: DeviceReservationDto | null;
  schoolPlace?: PlaceDto | null;
};

export async function getAddChildDraft(): Promise<AddChildDraft> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as AddChildDraft;
  } catch {
    return {};
  }
}

export async function saveAddChildDraft(draft: AddChildDraft) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(draft));
}

export async function updateAddChildDraft(patch: Partial<AddChildDraft>) {
  const current = await getAddChildDraft();
  const next = {
    ...current,
    ...patch,
  };

  await saveAddChildDraft(next);
  return next;
}

export async function clearAddChildDraft() {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

/**
 * Returns the persisted child-creation key, minting and storing one on first
 * call. Every retry of the same submission must reuse it so the server can
 * recognise a replay instead of treating it as a new child.
 */
export async function getOrCreateChildCreationIdempotencyKey() {
  const draft = await getAddChildDraft();

  if (draft.childCreationIdempotencyKey) {
    return draft.childCreationIdempotencyKey;
  }

  const nextKey = buildIdempotencyKey();
  await updateAddChildDraft({ childCreationIdempotencyKey: nextKey });
  return nextKey;
}
