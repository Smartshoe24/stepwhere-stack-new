import * as SecureStore from 'expo-secure-store';

const INSTALLATION_ID_KEY = 'stepwhere.push.installation-id.v1';
const PROMPTED_KEY = 'stepwhere.push.permission-prompted.v1';

function buildInstallationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreatePushInstallationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);

  if (existing) {
    return existing;
  }

  const nextId = buildInstallationId();
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, nextId);
  return nextId;
}

export async function hasShownNotificationPermissionPrompt() {
  return (await SecureStore.getItemAsync(PROMPTED_KEY)) === 'true';
}

export async function markNotificationPermissionPromptShown() {
  await SecureStore.setItemAsync(PROMPTED_KEY, 'true');
}
