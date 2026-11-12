import type { ChildSummaryDto, PublicShareChildDto, PublicShareResponseDto, ShareLinkDto } from "@stepwhere/types";

import { toInitials } from "../../shared/mappers";

function toFirstName(name: string) {
  return name.trim().split(/\s+/)[0]?.trim() || "Child";
}

export function toPublicShareChildDto(child: Pick<
  ChildSummaryDto,
  "avatarUrl" | "connectivity" | "id" | "initials" | "lastUpdatedAt" | "latitude" | "locationLabel" | "longitude" | "name" | "resolvedPosition" | "statusLabel" | "telemetryState"
>): PublicShareChildDto {
  return {
    childName: toFirstName(child.name),
    initials: child.initials || toInitials(child.name),
    avatarUrl: child.avatarUrl,
    latitude: child.latitude,
    longitude: child.longitude,
    resolvedPosition: child.resolvedPosition,
    telemetryState: child.telemetryState,
    gpsState: child.connectivity.gpsState,
    statusLabel: child.statusLabel ?? "Offline",
    lastUpdatedAt: child.lastUpdatedAt,
  };
}

export function toShareLinkDto(input: {
  expiresAt: Date;
  id: string;
  shareUrl: string;
  startsAt: Date;
}): ShareLinkDto {
  return {
    id: input.id,
    shareUrl: input.shareUrl,
    startsAt: input.startsAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    status: "active",
  };
}

export function toPublicShareResponseDto(input: {
  child: PublicShareChildDto;
  expiresAt: Date;
  startsAt: Date;
}): PublicShareResponseDto {
  return {
    startsAt: input.startsAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    status: "active",
    child: input.child,
  };
}
