import * as SecureStore from "expo-secure-store";

import type { DeviceReservationDto, PlaceDto } from "@stepwhere/types";

import { buildIdempotencyKey } from "@/features/children/add-child-utils";

const STORAGE_KEY = "stepwhere.onboarding-draft";

export type OnboardingDraftAvatar = {
  contentType: string;
  fileName: string;
  fileSize: number;
  uri: string;
};

export type OnboardingDraft = {
  avatar?: OnboardingDraftAvatar | null;
  /**
   * Stable across retries of the same child submission. Generating a fresh key
   * per attempt defeated the server's replay-by-key check, so a retry after a
   * lost response created a second child or reported the shoe as already bound.
   */
  childCreationIdempotencyKey?: string;
  childDateOfBirth?: string;
  childName?: string;
  reservation?: DeviceReservationDto | null;
  schoolPlace?: PlaceDto | null;
};

export async function getOnboardingDraft(): Promise<OnboardingDraft> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return {};
  }
}

export async function saveOnboardingDraft(draft: OnboardingDraft) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(draft));
}

export async function updateOnboardingDraft(patch: Partial<OnboardingDraft>) {
  const current = await getOnboardingDraft();
  const next = {
    ...current,
    ...patch,
  };

  await saveOnboardingDraft(next);
  return next;
}

export async function clearOnboardingDraft() {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

/**
 * Returns the persisted child-creation key, minting and storing one on first
 * call. Every retry of the same submission must reuse it so the server can
 * recognise a replay instead of treating it as a new child.
 */
export async function getOrCreateChildCreationIdempotencyKey() {
  const draft = await getOnboardingDraft();

  if (draft.childCreationIdempotencyKey) {
    return draft.childCreationIdempotencyKey;
  }

  const nextKey = buildIdempotencyKey();
  await updateOnboardingDraft({ childCreationIdempotencyKey: nextKey });
  return nextKey;
}
