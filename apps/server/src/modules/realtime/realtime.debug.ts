import { env } from "../../config/env";

function isRealtimeDebugEnabled() {
  return env.REALTIME_DEBUG || env.NODE_ENV !== "production";
}

export function logRealtimeDebug(event: string, details?: Record<string, unknown>) {
  if (!isRealtimeDebugEnabled()) {
    return;
  }

  if (details) {
    console.info(`[realtime] ${event}`, details);
    return;
  }

  console.info(`[realtime] ${event}`);
}
