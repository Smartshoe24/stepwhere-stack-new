export type ShareDurationMinutes = 15 | 60 | 240;

export type CreateShareLinkInput = {
  durationMinutes: ShareDurationMinutes;
};

export type ShareLinkDto = {
  id: string;
  shareUrl: string;
  startsAt: string;
  expiresAt: string;
  status: "active";
};

export type ActiveShareLinkResponseDto = {
  share: ShareLinkDto | null;
};

/**
 * Result of stopping a share. `expired` means the link had already run out
 * before the request, so nothing was revoked and `revokedAt` is null.
 */
export type RevokedShareLinkDto =
  | {
      id: string;
      revokedAt: string;
      status: "revoked";
    }
  | {
      id: string;
      revokedAt: null;
      status: "expired";
    };

export type PublicShareChildDto = {
  childName: string;
  initials: string;
  avatarUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  resolvedPosition: import("./telemetry").ResolvedPositionDto | null;
  telemetryState: "active" | "sleep" | "offline" | "connecting";
  gpsState: import("./children").ChildConnectivityDto["gpsState"];
  statusLabel: string;
  lastUpdatedAt: string | null;
};

export type PublicShareResponseDto = {
  startsAt: string;
  expiresAt: string;
  status: "active";
  child: PublicShareChildDto;
};

export type PublicShareSocketEvent =
  | {
      type: "share.snapshot";
      data: PublicShareResponseDto;
    }
  | {
      type: "share.child.updated";
      data: PublicShareChildDto;
    }
  | {
      type: "share.ended";
      data: {
        endedAt: string;
        reason: "expired" | "replaced" | "stopped";
      };
    };
