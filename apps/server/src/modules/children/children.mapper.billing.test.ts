import { beforeEach, describe, expect, it, vi } from "vitest";

const coverage = vi.hoisted(() => ({
  enforced: true,
  deviceCovered: true,
  locationCovered: true,
}));

vi.mock("../billing/billing-coverage.service", () => ({
  billingEnforced: () => coverage.enforced,
  deviceHasCoverage: async () => !coverage.enforced || coverage.deviceCovered,
  snapshotLocationHasCoverage: async () => !coverage.enforced || coverage.locationCovered,
}));

vi.mock("../uploads/uploads.service", () => ({
  resolveAvatarUrl: async () => null,
}));

const { toChildSummaryDto } = await import("./children.mapper");

const now = new Date();

const child = {
  id: "child-1",
  name: "Aarav Sharma",
  avatarUrl: null,
  organizationId: "family-1",
} as never;

const device = {
  id: "device-1",
  hardwareIdentifier: "869938082392516",
  displayName: null,
  platform: "embedded",
  status: "active",
  lastSeenAt: now,
} as never;

const snapshot = {
  lastSeenAt: now,
  lastLocationAt: now,
  lastLocationEventId: "event-1",
  lastLocationSource: "gps",
  lastLatitude: "18.520430",
  lastLongitude: "73.856744",
  lastLocationLabel: "Home",
  lastLocationAccuracyMeters: "8",
  lastRawStepCounter: 9876,
  lastStepDelta: 12,
  stepsThisHour: 340,
  stepsToday: 4321,
  stepsTodayDate: "2026-11-01",
  lastDeviceState: "active",
  status: "online",
  statusLabel: "Online",
} as never;

function summarise() {
  return toChildSummaryDto({ child, snapshot, device, activePlan: null });
}

describe("toChildSummaryDto under billing enforcement", () => {
  beforeEach(() => {
    coverage.enforced = true;
    coverage.deviceCovered = true;
    coverage.locationCovered = true;
  });

  it("keeps a covered child's steps exactly as with enforcement off", async () => {
    const covered = await summarise();
    coverage.enforced = false;
    const unenforced = await summarise();

    expect(covered).toMatchObject({
      stepCounter: 9876,
      stepDelta: 12,
      stepsThisHour: 340,
      stepsToday: 4321,
    });
    expect({
      stepCounter: covered.stepCounter,
      stepDelta: covered.stepDelta,
      stepsThisHour: covered.stepsThisHour,
      stepsToday: covered.stepsToday,
    }).toEqual({
      stepCounter: unenforced.stepCounter,
      stepDelta: unenforced.stepDelta,
      stepsThisHour: unenforced.stepsThisHour,
      stepsToday: unenforced.stepsToday,
    });
    expect(covered.latitude).toBe(18.52043);
  });

  it("hides location but keeps steps when only the last fix is outside coverage", async () => {
    coverage.locationCovered = false;

    const summary = await summarise();

    expect(summary.stepsToday).toBe(4321);
    expect(summary.latitude).toBeNull();
    expect(summary.resolvedPosition).toBeNull();
  });

  it("hides steps and location for an uncovered child", async () => {
    coverage.deviceCovered = false;

    const summary = await summarise();

    expect(summary).toMatchObject({
      stepsToday: 0,
      stepsThisHour: 0,
      stepCounter: null,
      latitude: null,
      statusLabel: "Subscription required",
    });
  });
});
