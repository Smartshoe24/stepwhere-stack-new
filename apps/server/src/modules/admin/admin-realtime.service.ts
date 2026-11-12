import type { AdminRealtimeEvent } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

class AdminRealtimeRegistry {
  private readonly connections = new Set<WSContext>();

  add(connection: WSContext) {
    this.connections.add(connection);
  }

  remove(connection: WSContext) {
    this.connections.delete(connection);
  }

  broadcast(event: AdminRealtimeEvent) {
    const payload = JSON.stringify(event);

    for (const connection of this.connections) {
      if (connection.readyState !== 1) {
        this.connections.delete(connection);
        continue;
      }

      try {
        connection.send(payload);
      } catch {
        this.connections.delete(connection);
      }
    }
  }
}

export const adminRealtimeRegistry = new AdminRealtimeRegistry();
