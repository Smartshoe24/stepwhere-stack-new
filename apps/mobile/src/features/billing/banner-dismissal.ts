import * as SecureStore from 'expo-secure-store';

import { toIstDateKey } from './billing-format';

const STORAGE_KEY = 'stepwhere.billing-banner-dismissed';

type Dismissal = { id: string; on: string };

/** True when this banner was dismissed today; it comes back the next day. */
export async function isBillingBannerDismissedToday(bannerId: string, now = new Date()) {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    const dismissal = raw ? (JSON.parse(raw) as Dismissal) : null;
    return dismissal?.id === bannerId && dismissal.on === toIstDateKey(now);
  } catch {
    return false;
  }
}

export async function dismissBillingBannerForToday(bannerId: string, now = new Date()) {
  const dismissal: Dismissal = { id: bannerId, on: toIstDateKey(now) };
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(dismissal));
}
