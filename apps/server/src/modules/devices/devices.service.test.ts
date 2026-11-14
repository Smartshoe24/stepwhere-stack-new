import { describe, expect, it } from "vitest";

import { prepareBulkCreateDevices, toAdminDeviceDto } from "./devices.service";

describe("devices service helpers", () => {
  it("normalizes and de-duplicates bulk device create input", () => {
    const result = prepareBulkCreateDevices([
      { hardwareIdentifier: " sw-dev-0001 " },
      { hardwareIdentifier: "SW-DEV-0001", displayName: "Duplicate" },
      {
        hardwareIdentifier: "sw-dev-0002",
        displayName: "Front desk",
        platform: "android",
        status: "inactive",
      },
    ]);

    expect(result.prepared).toEqual([
      {
        hardwareIdentifier: "SW-DEV-0001",
        displayName: null,
        platform: "unknown",
        status: "fresh",
      },
      {
        hardwareIdentifier: "SW-DEV-0002",
        displayName: "Front desk",
        platform: "android",
        status: "inactive",
      },
    ]);

    expect(result.skipped).toEqual([
      {
        hardwareIdentifier: "SW-DEV-0001",
        reason: "Duplicate hardware identifier in request.",
      },
    ]);
  });

  it("maps admin device dto with binding and reservation metadata", () => {
    const device = {
      id: "device-1",
      hardwareIdentifier: "SW-DEV-0001",
      displayName: "Tracker 1",
      platform: "embedded" as const,
      status: "active" as const,
      authTokenHash: null,
      reservedByUserId: "user-1",
      reservedByOrganizationId: "org-1",
      reservationTokenHash: null,
      reservedUntil: new Date("2026-06-17T12:00:00.000Z"),
      lastSeenAt: new Date("2026-06-17T10:00:00.000Z"),
      firmwareVersion: null,
      firmwareStatus: null,
      firmwareReportedAt: null,
      createdAt: new Date("2026-06-16T10:00:00.000Z"),
      updatedAt: new Date("2026-06-17T11:00:00.000Z"),
    };

    const dto = toAdminDeviceDto({
      device,
      binding: {
        id: "binding-1",
        childId: "child-1",
        deviceId: "device-1",
        boundAt: new Date("2026-06-17T09:00:00.000Z"),
        unboundAt: null,
        createdAt: new Date("2026-06-17T09:00:00.000Z"),
        updatedAt: new Date("2026-06-17T09:00:00.000Z"),
      },
      child: {
        id: "child-1",
        parentUserId: null,
        organizationId: "org-1",
        name: "Anya",
        avatarUrl: null,
        schoolName: null,
        schoolPlaceId: null,
        gender: null,
        dateOfBirth: null,
        creationIdempotencyKey: null,
        status: "active" as const,
        createdAt: new Date("2026-06-16T09:00:00.000Z"),
        updatedAt: new Date("2026-06-16T09:00:00.000Z"),
      },
    });

    expect(dto.activeBinding).toEqual({
      id: "binding-1",
      childId: "child-1",
      childName: "Anya",
      childAvatarUrl: null,
      organizationId: "org-1",
      boundAt: "2026-06-17T09:00:00.000Z",
    });
    expect(dto.reservation).toEqual({
      reservedByUserId: "user-1",
      reservedByOrganizationId: "org-1",
      reservedUntil: "2026-06-17T12:00:00.000Z",
    });
  });
});
