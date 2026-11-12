import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const authBaseUrl =
  process.env.EXPO_PUBLIC_AUTH_URL ?? "http://localhost:8223/api/auth";
const configuredScheme = Constants.expoConfig?.scheme;
const authScheme = Array.isArray(configuredScheme)
  ? configuredScheme[0] ?? "stepwhere"
  : configuredScheme ?? "stepwhere";

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [
    expoClient({
      scheme: authScheme,
      storagePrefix: "stepwhere",
      cookiePrefix: "better-auth",
      storage: SecureStore,
    }),
    phoneNumberClient(),
  ],
});

export function getBetterAuthErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string,
) {
  if (!error) {
    return fallback;
  }

  return error.message || fallback;
}
