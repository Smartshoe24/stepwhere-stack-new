import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { billingAudit, billingCheckoutIntents, billingTransactions, childDeviceBindings, deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices, familySubscriptions } from "../../db/schema";
import { conflict, notFound } from "../../shared/errors";
import { lockBilling } from "./billing.service";

export async function replaceWarrantyDevice(actorUserId: string, organizationId: string, oldDeviceId: string, newDeviceId: string, reason: string) {
  if (oldDeviceId === newDeviceId) throw conflict("Replacement must be a different physical shoe.");
  return db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)).orderBy(desc(familySubscriptions.lastVerifiedAt)).limit(1);
    if (subscription) await lockBilling(tx, subscription.customerId);
    await lockBilling(tx, organizationId);
    // Deterministic ordering prevents two support operators deadlocking.
    for (const id of [oldDeviceId, newDeviceId].sort()) await tx.execute(sql`select id from devices where id = ${id} for update`);
    const [owner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, oldDeviceId), eq(deviceOwnerships.organizationId, organizationId), isNull(deviceOwnerships.releasedAt)));
    const [oldActivation] = await tx.select().from(deviceActivations).where(eq(deviceActivations.deviceId, oldDeviceId));
    const [replacement] = await tx.select().from(devices).where(eq(devices.id, newDeviceId));
    const [replacementActivation] = await tx.select().from(deviceActivations).where(eq(deviceActivations.deviceId, newDeviceId));
    const [replacementOwner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, newDeviceId), isNull(deviceOwnerships.releasedAt), sql`${deviceOwnerships.organizationId} is not null`));
    if (!owner || !oldActivation || !replacement) throw notFound("NOT_FOUND", "Owned shoe or replacement not found.");
    if (replacementActivation || replacementOwner || replacement.status !== "fresh") throw conflict("Warranty replacement must be a fresh, never-activated shoe.");
    const [pending] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), inArray(billingCheckoutIntents.state, ["pending", "needs_review", "deferred"])));
    if (pending) throw conflict("Resolve pending checkout before warranty replacement.");
    const now = new Date();
    await tx.insert(deviceActivations).values({ deviceId: newDeviceId, activatedAt: oldActivation.activatedAt, trialEndsAt: oldActivation.trialEndsAt, trialConvertedAt: oldActivation.trialConvertedAt, replacementOfDeviceId: oldDeviceId });
    await tx.update(deviceActivations).set({ trialConvertedAt: oldActivation.trialConvertedAt ?? now }).where(eq(deviceActivations.deviceId, oldDeviceId));
    await tx.insert(deviceOwnerships).values({ deviceId: newDeviceId, organizationId, claimedByUserId: actorUserId, claimedAt: now });
    await tx.update(deviceOwnerships).set({ releasedAt: now, releaseReason: "warranty_replacement" }).where(eq(deviceOwnerships.id, owner.id));
    const grants = await tx.select().from(deviceCoverageIntervals).where(and(eq(deviceCoverageIntervals.deviceId, oldDeviceId), eq(deviceCoverageIntervals.organizationId, organizationId), isNull(deviceCoverageIntervals.revokedAt), gt(deviceCoverageIntervals.endsAt, now)));
    for (const grant of grants) {
      await tx.insert(deviceCoverageIntervals).values({ deviceId: newDeviceId, organizationId, subscriptionId: grant.subscriptionId, grantKey: grant.grantKey, source: grant.source, startsAt: grant.startsAt > now ? grant.startsAt : now, endsAt: grant.endsAt });
      if (grant.startsAt >= now) await tx.update(deviceCoverageIntervals).set({ revokedAt: now }).where(eq(deviceCoverageIntervals.id, grant.id));
      else await tx.update(deviceCoverageIntervals).set({ endsAt: now }).where(eq(deviceCoverageIntervals.id, grant.id));
    }
    const [binding] = await tx.update(childDeviceBindings).set({ unboundAt: now, updatedAt: now }).where(and(eq(childDeviceBindings.deviceId, oldDeviceId), isNull(childDeviceBindings.unboundAt))).returning();
    if (binding) await tx.insert(childDeviceBindings).values({ childId: binding.childId, deviceId: newDeviceId, boundAt: now });
    await tx.update(devices).set({ status: "inactive", authTokenHash: null, reservedByUserId: null, reservedByOrganizationId: null, reservationTokenHash: null, reservedUntil: null, updatedAt: now }).where(eq(devices.id, oldDeviceId));
    await tx.update(devices).set({ status: binding ? "active" : "inactive", reservedByUserId: null, reservedByOrganizationId: null, reservationTokenHash: null, reservedUntil: null, updatedAt: now }).where(eq(devices.id, newDeviceId));
    if (subscription) await tx.update(familySubscriptions).set({ deviceIds: subscription.deviceIds.map((id) => id === oldDeviceId ? newDeviceId : id), nextDeviceIds: subscription.nextDeviceIds?.map((id) => id === oldDeviceId ? newDeviceId : id) ?? null, revision: subscription.revision + 1 }).where(eq(familySubscriptions.id, subscription.id));
    await tx.insert(billingAudit).values({ actorUserId, organizationId, action: "warranty_replacement", details: { oldDeviceId, newDeviceId, reason, childId: binding?.childId ?? null, transferredGrantIds: grants.map((g) => g.id) } });
    return { oldDeviceId, newDeviceId, childId: binding?.childId ?? null, trialEndsAt: oldActivation.trialEndsAt.toISOString() };
  });
}

export async function releaseOwnedDevice(actorUserId: string, deviceId: string, reason: string) {
  return db.transaction(async (tx) => {
    let [owner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, deviceId), isNull(deviceOwnerships.releasedAt), sql`${deviceOwnerships.organizationId} is not null`));
    if (!owner) throw notFound("NOT_FOUND", "Active ownership not found.");
    const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, owner.organizationId!)).orderBy(desc(familySubscriptions.lastVerifiedAt)).limit(1);
    if (subscription) await lockBilling(tx, subscription.customerId);
    await lockBilling(tx, owner.organizationId!);
    await tx.execute(sql`select id from devices where id = ${deviceId} for update`);
    const [lockedOwner] = await tx.select().from(deviceOwnerships).where(eq(deviceOwnerships.id, owner.id));
    if (!lockedOwner || lockedOwner.releasedAt) throw conflict("Ownership changed; refresh and retry.");
    owner = lockedOwner;
    const [binding] = await tx.select().from(childDeviceBindings).where(and(eq(childDeviceBindings.deviceId, deviceId), isNull(childDeviceBindings.unboundAt)));
    // Never release a shoe out from under a child that is still using it.
    if (binding) throw conflict("This shoe is still bound to a child. Unbind it before releasing ownership.", { childId: binding.childId });
    const subscriptions = await tx.select().from(familySubscriptions).where(and(eq(familySubscriptions.organizationId, owner.organizationId!), gt(familySubscriptions.graceEndsAt, new Date())));
    const intents = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, owner.organizationId!), inArray(billingCheckoutIntents.state, ["pending", "needs_review", "deferred"])));
    if (subscriptions.some((s) => s.deviceIds.includes(deviceId) || s.nextDeviceIds?.includes(deviceId)) || intents.some((i) => i.snapshot.deviceIds.includes(deviceId))) throw conflict("Resolve paid/scheduled coverage before releasing this shoe.");
    const now = new Date();
    await tx.update(deviceOwnerships).set({ releasedAt: now, releaseReason: reason }).where(eq(deviceOwnerships.id, owner.id));
    await tx.update(devices).set({ reservedByUserId: null, reservedByOrganizationId: null, reservationTokenHash: null, reservedUntil: null, updatedAt: now }).where(eq(devices.id, deviceId));
    // End the old family's access; subsequent support-authorized claim can carry
    // only the original remaining trial, never purchased coverage.
    await tx.update(deviceCoverageIntervals).set({ endsAt: now }).where(and(eq(deviceCoverageIntervals.organizationId, owner.organizationId!), eq(deviceCoverageIntervals.deviceId, deviceId), sql`${deviceCoverageIntervals.startsAt} < now()`, gt(deviceCoverageIntervals.endsAt, now)));
    await tx.update(deviceCoverageIntervals).set({ revokedAt: now }).where(and(eq(deviceCoverageIntervals.organizationId, owner.organizationId!), eq(deviceCoverageIntervals.deviceId, deviceId), sql`${deviceCoverageIntervals.startsAt} >= now()`));
    await tx.insert(billingAudit).values({ actorUserId, organizationId: owner.organizationId, action: "release_device_ownership", details: { deviceId, reason } });
    return { deviceId, released: true };
  });
}
