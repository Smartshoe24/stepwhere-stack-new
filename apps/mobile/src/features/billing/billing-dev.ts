import Constants from 'expo-constants';

const appVariant = Constants.expoConfig?.extra?.appVariant as string | undefined;

/**
 * Dev-only billing tools (the fake payment sheet, test charge outcomes).
 * Internal builds run with __DEV__ false, so the build variant decides too;
 * a build without the variant is treated as production.
 */
export const BILLING_DEV_TOOLS_ENABLED = __DEV__ || (appVariant != null && appVariant !== 'production');
