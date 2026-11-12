import type { RealtimeHeartbeatEvent } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

const HEARTBEAT_INTERVAL_MS = 20_000;

const heartbeatTimers = new WeakMap<WSContext, ReturnType<typeof setInterval>>();

export function startRealtimeHeartbeat(ws: WSContext) {
  stopRealtimeHeartbeat(ws);

  const timer = setInterval(() => {
    if (ws.readyState !== 1) {
      stopRealtimeHeartbeat(ws);
      return;
    }

    const event = {
      type: "realtime.heartbeat",
      data: { sentAt: new Date().toISOString() },
    } satisfies RealtimeHeartbeatEvent;

    try {
      ws.send(JSON.stringify(event));
    } catch {
      stopRealtimeHeartbeat(ws);
    }
  }, HEARTBEAT_INTERVAL_MS);

  heartbeatTimers.set(ws, timer);
}

export function stopRealtimeHeartbeat(ws: WSContext) {
  const timer = heartbeatTimers.get(ws);

  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(ws);
  }
}
