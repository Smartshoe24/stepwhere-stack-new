import { ApiError } from "@/lib/api-client";

const TRAIL_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;

export function getNextTrailRetryDelayMs(retryAttempt: number) {
  return TRAIL_RETRY_DELAYS_MS[Math.min(retryAttempt, TRAIL_RETRY_DELAYS_MS.length - 1)] ?? 30_000;
}

export function shouldRetryTrailRefresh(error: unknown) {
  if (error instanceof ApiError) {
    return error.status >= 500;
  }

  return true;
}

export function shouldScheduleTrailRefresh(lastAttemptAt: number | undefined, nowMs: number, throttleMs: number) {
  if (!lastAttemptAt) {
    return 0;
  }

  const elapsedMs = nowMs - lastAttemptAt;

  if (elapsedMs >= throttleMs) {
    return 0;
  }

  return throttleMs - elapsedMs;
}
