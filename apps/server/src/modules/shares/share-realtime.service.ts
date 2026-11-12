import type { PublicShareChildDto } from "@stepwhere/types";
import type { WSContext } from "hono/ws";

import { detachBackgroundTask } from "../../shared/background-task";
import { logRealtimeDebug } from "../realtime/realtime.debug";
import { expireShareLinkIfNeeded } from "./share-revocation";

type PublicShareConnection = {
  shareId: string;
  childId: string;
  expiresAt: Date;
  socket: WSContext;
};

type PublicShareRealtimeEvent =
  | {
      type: "share.snapshot";
      data: import("@stepwhere/types").PublicShareResponseDto;
    }
  | {
      type: "share.child.updated";
      data: PublicShareChildDto;
    }
  | {
      type: "share.ended";
      data: {
        endedAt: string;
        reason: PublicShareEndReason;
      };
    };

export type PublicShareEndReason = "expired" | "replaced" | "stopped";

type InternalPublicShareConnection = PublicShareConnection & {
  expiryTimer: ReturnType<typeof setTimeout> | null;
};

export type PublicShareBroadcastStats = {
  childId: string;
  connected: number;
  sent: number;
  skipped: number;
};

const SHARE_EXPIRED_CLOSE_CODE = 4001;
const SHARE_EXPIRED_CLOSE_REASON = "share-expired";

class PublicShareRealtimeRegistry {
  private readonly childConnections = new Map<string, Set<InternalPublicShareConnection>>();
  private readonly shareConnections = new Map<string, Set<InternalPublicShareConnection>>();
  private readonly socketConnections = new WeakMap<WSContext, InternalPublicShareConnection>();

  add(connection: PublicShareConnection) {
    const entry: InternalPublicShareConnection = {
      ...connection,
      expiryTimer: null,
    };
    const existing = this.childConnections.get(connection.childId) ?? new Set<InternalPublicShareConnection>();

    entry.expiryTimer = setTimeout(() => {
      detachBackgroundTask(
        "public-share-expiry",
        () => this.endConnection(entry, true, "expired"),
        { preventOverlap: false },
      );
    }, Math.max(0, entry.expiresAt.getTime() - Date.now()));
    entry.expiryTimer.unref();

    existing.add(entry);
    this.childConnections.set(connection.childId, existing);
    const existingShareConnections = this.shareConnections.get(connection.shareId)
      ?? new Set<InternalPublicShareConnection>();
    existingShareConnections.add(entry);
    this.shareConnections.set(connection.shareId, existingShareConnections);
    this.socketConnections.set(connection.socket, entry);

    logRealtimeDebug("share_socket_open", {
      childId: entry.childId,
      shareId: entry.shareId,
    });
  }

  remove(socket: WSContext) {
    const entry = this.socketConnections.get(socket);

    if (!entry) {
      return;
    }

    if (entry.expiryTimer) {
      clearTimeout(entry.expiryTimer);
      entry.expiryTimer = null;
    }

    this.socketConnections.delete(socket);

    const existing = this.childConnections.get(entry.childId);

    if (!existing) {
      return;
    }

    existing.delete(entry);

    if (existing.size === 0) {
      this.childConnections.delete(entry.childId);
    }

    const existingShareConnections = this.shareConnections.get(entry.shareId);
    existingShareConnections?.delete(entry);
    if (existingShareConnections?.size === 0) {
      this.shareConnections.delete(entry.shareId);
    }

    logRealtimeDebug("share_socket_close", {
      childId: entry.childId,
      shareId: entry.shareId,
    });
  }

  async broadcastChildUpdate(childId: string, child: PublicShareChildDto): Promise<PublicShareBroadcastStats> {
    const existing = this.childConnections.get(childId);

    if (!existing) {
      const stats = {
        childId,
        connected: 0,
        sent: 0,
        skipped: 0,
      } satisfies PublicShareBroadcastStats;
      logRealtimeDebug("share_broadcast", stats);
      return stats;
    }

    const payload = JSON.stringify({
      type: "share.child.updated",
      data: child,
    } satisfies PublicShareRealtimeEvent);

    let sent = 0;
    let skipped = 0;

    for (const connection of [...existing]) {
      if (connection.expiresAt.getTime() <= Date.now()) {
        skipped += 1;
        await this.endConnection(connection, true, "expired");
        continue;
      }

      if (connection.socket.readyState === 1) {
        connection.socket.send(payload);
        sent += 1;
        continue;
      }

      skipped += 1;
      this.remove(connection.socket);
    }

    const stats = {
      childId,
      connected: sent + skipped,
      sent,
      skipped,
    } satisfies PublicShareBroadcastStats;
    logRealtimeDebug("share_broadcast", stats);
    return stats;
  }

  async endShare(shareId: string, reason: Exclude<PublicShareEndReason, "expired">) {
    const existing = this.shareConnections.get(shareId);

    if (!existing) {
      return;
    }

    for (const connection of [...existing]) {
      await this.endConnection(connection, true, reason);
    }
  }

  /** Close viewer sockets for links revoked outside the share routes. Call after commit. */
  async endShares(shareIds: readonly string[], reason: Exclude<PublicShareEndReason, "expired">) {
    for (const shareId of shareIds) {
      await this.endShare(shareId, reason);
    }
  }

  async endConnection(
    connection: InternalPublicShareConnection,
    notify: boolean,
    reason: PublicShareEndReason,
  ) {
    const current = this.socketConnections.get(connection.socket);

    if (!current) {
      return;
    }

    if (notify && current.socket.readyState === 1) {
      current.socket.send(JSON.stringify({
        type: "share.ended",
        data: {
          endedAt: new Date().toISOString(),
          reason,
        },
      } satisfies PublicShareRealtimeEvent));
      current.socket.close(
        reason === "expired" ? SHARE_EXPIRED_CLOSE_CODE : 4002,
        reason === "expired" ? SHARE_EXPIRED_CLOSE_REASON : `share-${reason}`,
      );
    }

    this.remove(current.socket);
    if (reason === "expired") {
      await expireShareLinkIfNeeded(current.shareId);
    }
  }
}

export const publicShareRealtimeRegistry = new PublicShareRealtimeRegistry();
