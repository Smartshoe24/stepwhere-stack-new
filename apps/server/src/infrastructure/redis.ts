import Redis from "ioredis";

import { env } from "../config/env";

const globalForRedis = globalThis as typeof globalThis & {
  __stepwhereRedisClient?: Redis | null;
};

let hasWarnedMissingRedisUrl = false;

export function getRedisClient() {
  if (globalForRedis.__stepwhereRedisClient !== undefined) {
    return globalForRedis.__stepwhereRedisClient;
  }

  if (!env.REDIS_URL) {
    if (!hasWarnedMissingRedisUrl && env.NODE_ENV !== "test") {
      hasWarnedMissingRedisUrl = true;
      console.warn("[redis] REDIS_URL is not configured; live activity counters are disabled.");
    }

    globalForRedis.__stepwhereRedisClient = null;
    return globalForRedis.__stepwhereRedisClient;
  }

  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  client.on("error", (error) => {
    if (env.NODE_ENV !== "test") {
      console.warn("[redis] connection error", error);
    }
  });

  globalForRedis.__stepwhereRedisClient = client;
  return globalForRedis.__stepwhereRedisClient;
}
