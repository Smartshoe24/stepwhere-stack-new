process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3001";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.BETTER_AUTH_SECRET ??= "test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.AWS_REGION ??= "ap-south-1";
process.env.AWS_ACCESS_KEY_ID ??= "test-access-key-id";
process.env.AWS_SECRET_ACCESS_KEY ??= "test-secret-access-key";
process.env.AWS_S3_STORAGE_BUCKET ??= "stepwhere-test-storage";
process.env.DEVICE_INGEST_API_KEY ??= "test-device-ingest-api-key";
process.env.DEVICE_PROVISIONING_SECRET ??= "test-provisioning-secret";

import { describe, expect, it } from "vitest";

describe("toChildSummaryDto", () => {
  it("maps connecting children with null snapshot data", async () => {
    const { toChildSummaryDto } = await import("./children.mapper");
    const now = new Date("2026-06-03T10:00:00.000Z");

    const child = {
      id: "child-1",
      parentUserId: "user-1",
      organizationId: "org-1",
      name: "Aarav Anand",
      avatarUrl: null,
      schoolName: null,
      schoolPlaceId: null,
      gender: null,
      dateOfBirth: null,
      creationIdempotencyKey: null,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };

    const summary = await toChildSummaryDto({
      child,
      snapshot: null,
      device: null,
      activePlan: null,
    });

    expect(summary).toMatchObject({
      id: "child-1",
      name: "Aarav Anand",
      initials: "AA",
      status: "offline",
      telemetryState: "connecting",
      statusLabel: "Connecting",
      locationLabel: null,
      latitude: null,
      longitude: null,
      resolvedPosition: null,
      stepCounter: null,
      stepDelta: 0,
      stepsThisHour: 0,
      deviceSummary: null,
      activePlan: null,
    });
  });
});
