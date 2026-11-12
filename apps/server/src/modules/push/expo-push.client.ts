import { Expo } from "expo-server-sdk";

import { env } from "../../config/env";

export const expoPushClient = new Expo(
  env.EXPO_ACCESS_TOKEN
    ? { accessToken: env.EXPO_ACCESS_TOKEN }
    : undefined,
);
