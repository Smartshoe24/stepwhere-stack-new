import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db, sql } from "../db/client";
import {
  accountDeletionRequests,
  childActivityMinuteBuckets,
  childDeviceBindings,
  childGeofences,
  childPlanSubscriptions,
  children,
  devices,
  historyEvents,
  historyProcessingStates,
  members,
  organizations,
  plans,
  previewAccessEntries,
  stepCountsDaily,
  users,
} from "../db/schema";
import { getPlayReviewConfiguration } from "../modules/play-review/play-review-access.service";
import { provisionPlayReviewDeviceBilling } from "../modules/play-review/play-review-billing.service";
import { emitPlayReviewTelemetry } from "../modules/play-review/play-review-telemetry.worker";

const FAMILY_SLUG = "stepwhere-play-review";
const HOME = { latitude: 18.520430, longitude: 73.856744 };
const SCHOOL = { latitude: 18.532420, longitude: 73.876010 };
const ACTIVITY = { latitude: 18.516890, longitude: 73.879310 };

function atPuneTime(daysAgo: number, hour: number, minute = 0) {
  const now = new Date();
  const currentDate = formatInTimeZone(now, "Asia/Kolkata", "yyyy-MM-dd");
  const base = new Date(`${currentDate}T00:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() - daysAgo);
  base.setUTCHours(base.getUTCHours() + hour, minute, 0, 0);
  return base;
}

async function main() {
  if (process.env.ALLOW_PLAY_REVIEW_PROVISION !== "true") {
    throw new Error("Set ALLOW_PLAY_REVIEW_PROVISION=true for this one-time, explicit operation.");
  }
  const configuration = getPlayReviewConfiguration();
  if (!configuration) {
    throw new Error("Enable and fully configure PLAY_REVIEW_* before provisioning.");
  }

  const [phoneUser] = await db.select().from(users)
    .where(eq(users.phoneNumber, configuration.phoneNumber)).limit(1);
  const [emailUser] = await db.select().from(users)
    .where(eq(users.email, configuration.email)).limit(1);
  if (emailUser && emailUser.id !== phoneUser?.id) {
    throw new Error("PLAY_REVIEW_EMAIL already belongs to another user.");
  }

  const result = await db.transaction(async (tx) => {
    const [reviewer] = phoneUser
      ? await tx.update(users).set({
        name: "Stepwhere Store Reviewer",
        email: configuration.email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationProvider: "play_review",
        phoneNumberVerified: true,
        onboardingCompleted: true,
        isPlayReviewAccount: true,
        currentAddress: "Fictional reviewer address, Pune",
        dateOfBirth: "1990-01-01",
        status: "active",
        updatedAt: new Date(),
      }).where(eq(users.id, phoneUser.id)).returning()
      : await tx.insert(users).values({
        name: "Stepwhere Store Reviewer",
        email: configuration.email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationProvider: "play_review",
        phoneNumber: configuration.phoneNumber,
        phoneNumberVerified: true,
        onboardingCompleted: true,
        isPlayReviewAccount: true,
        currentAddress: "Fictional reviewer address, Pune",
        dateOfBirth: "1990-01-01",
      }).returning();

    await tx.update(users).set({ isPlayReviewAccount: false, updatedAt: new Date() }).where(and(
      eq(users.isPlayReviewAccount, true),
      ne(users.id, reviewer.id),
    ));

    const [activeDeletion] = await tx
      .select()
      .from(accountDeletionRequests)
      .where(and(
        eq(accountDeletionRequests.userId, reviewer.id),
        inArray(accountDeletionRequests.status, ["pending", "purging"]),
      ))
      .limit(1);
    if (activeDeletion?.status === "purging") {
      throw new Error("The store reviewer account is being purged and cannot be reprovisioned.");
    }
    if (activeDeletion?.status === "pending") {
      const now = new Date();
      await tx
        .update(accountDeletionRequests)
        .set({
          status: "cancelled",
          cancelledAt: now,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(and(
          eq(accountDeletionRequests.id, activeDeletion.id),
          eq(accountDeletionRequests.status, "pending"),
        ));
    }

    await tx.insert(previewAccessEntries).values({
      phoneNumber: configuration.phoneNumber,
      label: "Apple and Google store reviewer",
      isActive: true,
    }).onConflictDoUpdate({
      target: previewAccessEntries.phoneNumber,
      set: { isActive: true, label: "Apple and Google store reviewer", updatedAt: new Date() },
    });

    let [organization] = await tx.select().from(organizations)
      .where(eq(organizations.slug, FAMILY_SLUG)).limit(1);
    if (!organization) {
      [organization] = await tx.insert(organizations).values({
        name: "Stepwhere Demo Family",
        slug: FAMILY_SLUG,
        metadata: { kind: "family", familyName: "Stepwhere Demo Family" },
      }).returning();
    }

    const [otherMember] = await tx.select({ id: members.id }).from(members).where(and(
      eq(members.organizationId, organization.id),
      ne(members.userId, reviewer.id),
    )).limit(1);
    if (otherMember) {
      throw new Error("The reviewer family contains another user; refusing to reuse it.");
    }

    await tx.insert(members).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: reviewer.id,
      role: "admin",
    }).onConflictDoUpdate({
      target: [members.organizationId, members.userId],
      set: { role: "admin" },
    });

    let [child] = await tx.select().from(children).where(and(
      eq(children.organizationId, organization.id),
      eq(children.name, "Mira Demo"),
    )).limit(1);
    if (!child) {
      [child] = await tx.insert(children).values({
        parentUserId: reviewer.id,
        organizationId: organization.id,
        name: "Mira Demo",
        schoolName: "Stepwhere Demo School",
        gender: "female",
        dateOfBirth: "2016-06-15",
      }).returning();
    } else {
      [child] = await tx.update(children).set({
        parentUserId: reviewer.id,
        schoolName: "Stepwhere Demo School",
        status: "active",
        updatedAt: new Date(),
      }).where(eq(children.id, child.id)).returning();
    }

    let [device] = await tx.select().from(devices)
      .where(eq(devices.hardwareIdentifier, configuration.hardwareIdentifier)).limit(1);
    if (device) {
      const [foreignBinding] = await tx.select().from(childDeviceBindings).where(and(
        eq(childDeviceBindings.deviceId, device.id),
        isNull(childDeviceBindings.unboundAt),
        ne(childDeviceBindings.childId, child.id),
      )).limit(1);
      if (foreignBinding) {
        throw new Error("PLAY_REVIEW_HARDWARE_IDENTIFIER is actively bound to another child.");
      }
      [device] = await tx.update(devices).set({
        displayName: "Mira's Demo Shoe",
        platform: "embedded",
        status: "active",
        updatedAt: new Date(),
      }).where(eq(devices.id, device.id)).returning();
    } else {
      [device] = await tx.insert(devices).values({
        hardwareIdentifier: configuration.hardwareIdentifier,
        displayName: "Mira's Demo Shoe",
        platform: "embedded",
        status: "active",
      }).returning();
    }


    const [otherDeviceBinding] = await tx.select().from(childDeviceBindings).where(and(
      eq(childDeviceBindings.childId, child.id),
      isNull(childDeviceBindings.unboundAt),
      ne(childDeviceBindings.deviceId, device.id),
    )).limit(1);
    if (otherDeviceBinding) {
      throw new Error("The reviewer child is actively bound to another device.");
    }

    await tx.insert(childDeviceBindings).values({
      childId: child.id,
      deviceId: device.id,
    }).onConflictDoNothing();
    // Ownership, trial and a support coverage grant spanning the seeded history.
    // The plan row below is only the display label.
    await provisionPlayReviewDeviceBilling(tx, {
      deviceId: device.id,
      organizationId: organization.id,
      userId: reviewer.id,
    });

    await tx.insert(childGeofences).values({
      childId: child.id,
      organizationId: organization.id,
      status: "disabled",
      centerLatitude: HOME.latitude.toFixed(6),
      centerLongitude: HOME.longitude.toFixed(6),
      radiusMeters: 250,
    }).onConflictDoUpdate({
      target: childGeofences.childId,
      set: {
        organizationId: organization.id,
        status: "disabled",
        containmentState: "unknown",
        candidateState: "unknown",
        candidateSampleCount: 0,
        lastDistanceMeters: null,
        lastEvaluatedAt: null,
        breachedAt: null,
        centerLatitude: HOME.latitude.toFixed(6),
        centerLongitude: HOME.longitude.toFixed(6),
        radiusMeters: 250,
        updatedAt: new Date(),
      },
    });

    let [plan] = await tx.select().from(plans)
      .where(eq(plans.title, "Included Shoe Service"))
      .limit(1);
    if (!plan) {
      [plan] = await tx.insert(plans).values({
        title: "Included Shoe Service",
        description: "Tracking service included with the physical Stepwhere shoe.",
        durationMonths: 120,
        amountMinor: 0,
        currencyCode: "INR",
        status: "active",
      }).returning();
    }
    await tx.update(childPlanSubscriptions).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(childPlanSubscriptions.childId, child.id), eq(childPlanSubscriptions.status, "active")));
    await tx.insert(childPlanSubscriptions).values({
      childId: child.id,
      planId: plan.id,
      source: "admin",
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
    });

    await tx.delete(historyProcessingStates).where(eq(historyProcessingStates.childId, child.id));
    await tx.delete(historyEvents).where(eq(historyEvents.childId, child.id));
    await tx.delete(childActivityMinuteBuckets).where(eq(childActivityMinuteBuckets.childId, child.id));
    await tx.delete(stepCountsDaily).where(eq(stepCountsDaily.childId, child.id));

    for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
      const eventDate = formatInTimeZone(atPuneTime(daysAgo, 12), "Asia/Kolkata", "yyyy-MM-dd");
      const steps = 6800 + ((7 - daysAgo) * 320);
      await tx.insert(stepCountsDaily).values({
        childId: child.id,
        deviceId: device.id,
        eventDate,
        stepCount: steps,
      });
      await tx.insert(childActivityMinuteBuckets).values({
        childId: child.id,
        deviceId: device.id,
        minuteStart: atPuneTime(daysAgo, 8, 0),
        eventDate,
        totalSteps: Math.round(steps * 0.35),
        activeSteps: Math.round(steps * 0.35),
        activeSeconds: 35 * 60,
        sampleCount: 12,
        representativeLatitude: SCHOOL.latitude.toFixed(6),
        representativeLongitude: SCHOOL.longitude.toFixed(6),
      });
      await tx.insert(historyEvents).values([
        {
          organizationId: organization.id,
          childId: child.id,
          deviceId: device.id,
          kind: "trip",
          status: "finalized",
          startedAt: atPuneTime(daysAgo, 7, 30),
          endedAt: atPuneTime(daysAgo, 8, 15),
          sampleCount: 24,
          algorithmVersion: 1,
          tripMode: "walking",
          modeConfidence: "high",
          distanceMeters: 3100,
          filteredPath: [
            { ...HOME, occurredAt: atPuneTime(daysAgo, 7, 30).toISOString() },
            { ...SCHOOL, occurredAt: atPuneTime(daysAgo, 8, 15).toISOString() },
          ],
        },
        {
          organizationId: organization.id,
          childId: child.id,
          deviceId: device.id,
          kind: "stay",
          status: "finalized",
          startedAt: atPuneTime(daysAgo, 8, 15),
          endedAt: atPuneTime(daysAgo, 15, 30),
          sampleCount: 40,
          algorithmVersion: 1,
          representativeLatitude: SCHOOL.latitude.toFixed(6),
          representativeLongitude: SCHOOL.longitude.toFixed(6),
          stayRadiusMeters: 35,
          placeProvider: "seeded",
          placeMatchType: "saved",
          placeLabel: "Stepwhere Demo School",
          formattedAddress: "Fictional reviewer location, Pune",
          placeEnrichmentStatus: "completed",
        },
      ]);
    }

    return { childId: child.id, deviceId: device.id, organizationId: organization.id, userId: reviewer.id };
  });

  await emitPlayReviewTelemetry({ force: true });
  console.info("[store-review] provisioned", result);
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error("[store-review] provisioning failed", error instanceof Error ? error.message : String(error));
    await sql.end();
    process.exitCode = 1;
  });
