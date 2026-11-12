import * as SecureStore from "expo-secure-store";

import { extractJoinToken } from "./family-invite-link";

const PENDING_FAMILY_INVITE_KEY = "stepwhere.pending-family-invite.v1";

export async function getPendingFamilyInviteToken() {
  return SecureStore.getItemAsync(PENDING_FAMILY_INVITE_KEY);
}

export async function setPendingFamilyInviteToken(rawValue: string) {
  const token = extractJoinToken(rawValue);

  if (!token) {
    return null;
  }

  await SecureStore.setItemAsync(PENDING_FAMILY_INVITE_KEY, token);
  return token;
}

export async function capturePendingFamilyInviteUrl(urlValue: string) {
  try {
    const url = new URL(urlValue);
    const route = `${url.host}${url.pathname}`.replace(/\/+$/, "");

    if (
      route !== "share.stepwhere.in/family/join" &&
      route !== "family/join" &&
      route !== "onboarding/join-family"
    ) {
      return null;
    }

    return setPendingFamilyInviteToken(urlValue);
  } catch {
    return null;
  }
}

export async function clearPendingFamilyInviteToken() {
  await SecureStore.deleteItemAsync(PENDING_FAMILY_INVITE_KEY);
}
