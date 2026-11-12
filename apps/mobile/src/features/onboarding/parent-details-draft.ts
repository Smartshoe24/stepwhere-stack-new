import * as SecureStore from "expo-secure-store";

import type { SelectedAvatar } from "@/features/profile/avatar-photo-actions";

const STORAGE_KEY_PREFIX = "stepwhere.parent-details-draft";
const pendingWrites = new Map<string, Promise<ParentDetailsDraft>>();

export type ParentDetailsDraft = {
  currentAddress?: string;
  dateOfBirth?: string | null;
  fullName?: string;
  removeAvatar?: boolean;
  selectedAvatar?: SelectedAvatar | null;
};

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}.${userId}`;
}

export async function getParentDetailsDraft(userId: string): Promise<ParentDetailsDraft> {
  const raw = await SecureStore.getItemAsync(storageKey(userId));
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as ParentDetailsDraft;
  } catch {
    return {};
  }
}

export async function updateParentDetailsDraft(userId: string, patch: Partial<ParentDetailsDraft>) {
  const previous = pendingWrites.get(userId);
  const write = (previous ?? getParentDetailsDraft(userId))
    .catch(() => getParentDetailsDraft(userId))
    .then(async (current) => {
      const next = { ...current, ...patch };
      await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(next));
      return next;
    });

  pendingWrites.set(userId, write);
  void write.finally(() => {
    if (pendingWrites.get(userId) === write) {
      pendingWrites.delete(userId);
    }
  });
  return write;
}

export async function clearParentDetailsDraft(userId: string) {
  await pendingWrites.get(userId)?.catch(() => undefined);
  await SecureStore.deleteItemAsync(storageKey(userId));
  pendingWrites.delete(userId);
}
