import type { MobileRealtimeEvent } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

import { logRealtimeDebug } from "./realtime.debug";

export type BroadcastStats = {
  organizationId: string;
  eventType: MobileRealtimeEvent["type"];
  connected: number;
  sent: number;
  skipped: number;
};

class RealtimeRegistry {
  private readonly organizationConnections = new Map<string, Set<WSContext>>();
  private readonly connectionUserIds = new WeakMap<WSContext, string>();
  private readonly userConnections = new Map<string, Set<WSContext>>();

  add(organizationId: string, connection: WSContext, userId?: string) {
    const existing = this.organizationConnections.get(organizationId) ?? new Set<WSContext>();
    existing.add(connection);
    this.organizationConnections.set(organizationId, existing);

    if (userId) {
      this.connectionUserIds.set(connection, userId);
      const userSockets = this.userConnections.get(userId) ?? new Set<WSContext>();
      userSockets.add(connection);
      this.userConnections.set(userId, userSockets);
    }
  }

  remove(organizationId: string, connection: WSContext) {
    const existing = this.organizationConnections.get(organizationId);

    if (!existing) {
      return;
    }

    existing.delete(connection);
    const userId = this.connectionUserIds.get(connection);
    if (userId) {
      const userSockets = this.userConnections.get(userId);
      userSockets?.delete(connection);
      if (userSockets?.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    if (existing.size === 0) {
      this.organizationConnections.delete(organizationId);
    }
  }

  disconnectUser(userId: string, reason = "session_ended") {
    const connections = this.userConnections.get(userId);
    if (!connections) {
      return;
    }

    for (const connection of connections) {
      try {
        connection.close(1008, reason);
      } catch {
        // The socket may already be closing; registry cleanup is best-effort.
      }
    }
    this.userConnections.delete(userId);
  }

  broadcast(organizationId: string, event: MobileRealtimeEvent): BroadcastStats {
    const payload = JSON.stringify(event);
    const existing = this.organizationConnections.get(organizationId);

    if (!existing) {
      const stats = {
        organizationId,
        eventType: event.type,
        connected: 0,
        sent: 0,
        skipped: 0,
      } satisfies BroadcastStats;
      logRealtimeDebug("broadcast", stats);
      return stats;
    }

    let sent = 0;
    let skipped = 0;

    for (const connection of existing) {
      if (connection.readyState === 1) {
        try {
          connection.send(payload);
          sent += 1;
        } catch {
          existing.delete(connection);
          skipped += 1;
        }
        continue;
      }

      existing.delete(connection);
      skipped += 1;
    }

    if (existing.size === 0) {
      this.organizationConnections.delete(organizationId);
    }

    const stats = {
      organizationId,
      eventType: event.type,
      connected: existing.size + skipped,
      sent,
      skipped,
    } satisfies BroadcastStats;
    logRealtimeDebug("broadcast", stats);
    return stats;
  }
}

export const realtimeRegistry = new RealtimeRegistry();
