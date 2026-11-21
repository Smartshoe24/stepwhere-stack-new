import { and, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { billingAudit, billingCharges, billingCheckoutIntents, billingMandates, billingPriceBook, billingRefunds, childDeviceBindings, deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices, familySubscriptions } from "../../db/schema";
import { conflict, notFound } from "../../shared/errors";
import { lockBilling, validateSelection } from "./billing.service";
import { sendRefund, startRefund } from "./billing-ledger.service";

export async function replaceWarrantyDevice(actorUserId: string, organizationId: string, oldDeviceId: string, newDeviceId: string, reason: string) {
  if (oldDeviceId === newDeviceId) throw conflict("Replacement must be a different physical shoe.");
  return db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)).orderBy(desc(familySubscriptions.createdAt)).limit(1);
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
    const [pending] = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, organizationId), inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"])));
    if (pending) throw conflict("Wait for the autopay being set up to finish before replacing a shoe.");
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
    // Charges not yet paid must buy coverage for the new shoe, not the released one.
    if (subscription) {
      const swap = (id: string) => (id === oldDeviceId ? newDeviceId : id);
      const unpaid = await tx.select().from(billingCharges).where(and(eq(billingCharges.subscriptionId, subscription.id), inArray(billingCharges.status, ["scheduled", "submitting", "submitted", "failed"])));
      for (const charge of unpaid) {
        if (!charge.breakdown.deviceIds.includes(oldDeviceId)) continue;
        const breakdown = { ...charge.breakdown, deviceIds: charge.breakdown.deviceIds.map(swap), credits: charge.breakdown.credits.map((credit) => ({ ...credit, deviceId: swap(credit.deviceId) })), coverage: charge.breakdown.coverage.map((item) => ({ ...item, deviceId: swap(item.deviceId) })) };
        await tx.update(billingCharges).set({ breakdown, updatedAt: now }).where(eq(billingCharges.id, charge.id));
      }
    }
    await tx.insert(billingAudit).values({ actorUserId, organizationId, action: "warranty_replacement", details: { oldDeviceId, newDeviceId, reason, childId: binding?.childId ?? null, transferredGrantIds: grants.map((g) => g.id) } });
    return { oldDeviceId, newDeviceId, childId: binding?.childId ?? null, trialEndsAt: oldActivation.trialEndsAt.toISOString() };
  });
}

export async function releaseOwnedDevice(actorUserId: string, deviceId: string, reason: string) {
  return db.transaction(async (tx) => {
    let [owner] = await tx.select().from(deviceOwnerships).where(and(eq(deviceOwnerships.deviceId, deviceId), isNull(deviceOwnerships.releasedAt), sql`${deviceOwnerships.organizationId} is not null`));
    if (!owner) throw notFound("NOT_FOUND", "Active ownership not found.");
    const [subscription] = await tx.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, owner.organizationId!)).orderBy(desc(familySubscriptions.createdAt)).limit(1);
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
    const intents = await tx.select().from(billingCheckoutIntents).where(and(eq(billingCheckoutIntents.organizationId, owner.organizationId!), inArray(billingCheckoutIntents.state, ["awaiting_authorization", "bank_pending"])));
    if (subscriptions.some((s) => s.deviceIds.includes(deviceId) || s.nextDeviceIds?.includes(deviceId)) || intents.some((i) => i.snapshot?.deviceIds.includes(deviceId))) throw conflict("Resolve paid/scheduled coverage before releasing this shoe.");
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

export async function publishPrices(actorUserId: string, prices: { termMonths: 3 | 6 | 12; perShoeMinor: number }[], activeFrom: Date) {
  if (new Set(prices.map((price) => price.termMonths)).size !== 3) throw conflict("Give one price for each of 3, 6 and 12 months.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('billing:price-book', 0))`);
    const [latest] = await tx.select({ version: max(billingPriceBook.version) }).from(billingPriceBook);
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(billingPriceBook).values(prices.map((price) => ({ version, currency: "INR" as const, termMonths: price.termMonths, perShoeMinor: price.perShoeMinor, activeFrom, createdByUserId: actorUserId })));
    await tx.insert(billingAudit).values({ actorUserId, action: "prices_published", details: { version, prices, activeFrom: activeFrom.toISOString() } });
    return { version, activeFrom: activeFrom.toISOString(), prices };
  });
}

/** Support refunds. Existing plans keep their price; coverage is only removed when asked. */
export async function refundCharge(actorUserId: string, chargeId: string, amountMinor: number, reason: string, revokeCoverage: boolean) {
  const refund = await db.transaction(async (tx) => {
    const [charge] = await tx.select().from(billingCharges).where(eq(billingCharges.id, chargeId));
    if (!charge) throw notFound("NOT_FOUND", "Charge not found.");
    await lockBilling(tx, charge.customerId);
    if (charge.organizationId) await lockBilling(tx, charge.organizationId);
    if (charge.status !== "paid" && charge.status !== "partially_refunded") throw conflict("Only a paid charge can be refunded.");
    const [pending] = await tx.select().from(billingRefunds).where(and(eq(billingRefunds.chargeId, charge.id), eq(billingRefunds.status, "pending")));
    if (pending) throw conflict("A refund for this charge is already in progress.");
    if (amountMinor > charge.amountMinor - charge.refundedMinor) throw conflict("That is more than is left to refund.");
    return startRefund(tx, charge, amountMinor, reason, actorUserId, revokeCoverage);
  });
  await sendRefund(refund.id);
  const [current] = await db.select().from(billingRefunds).where(eq(billingRefunds.id, refund.id));
  return { refundId: current.id, status: current.status };
}

/** Free coverage from support, for example for families onboarded before billing. */
export async function grantSupportCoverage(actorUserId: string, organizationId: string, deviceIds: string[], endsAt: Date, reason: string) {
  return db.transaction(async (tx) => {
    await lockBilling(tx, organizationId);
    await validateSelection(tx, organizationId, deviceIds);
    const now = new Date();
    if (endsAt <= now) throw conflict("The grant must end in the future.");
    const grantKey = `support:${now.getTime()}`;
    await tx.insert(deviceCoverageIntervals).values(deviceIds.map((deviceId) => ({ deviceId, organizationId, grantKey, source: "support" as const, startsAt: now, endsAt })));
    await tx.insert(billingAudit).values({ actorUserId, organizationId, action: "support_coverage_granted", details: { deviceIds, endsAt: endsAt.toISOString(), reason, grantKey } });
    return { grantKey, deviceIds, endsAt: endsAt.toISOString() };
  });
}

export async function familyBillingDetail(organizationId: string) {
  const [subscriptions, charges, mandates, audit] = await Promise.all([
    db.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)).orderBy(desc(familySubscriptions.createdAt)),
    db.select().from(billingCharges).where(eq(billingCharges.organizationId, organizationId)).orderBy(desc(billingCharges.createdAt)).limit(100),
    db.select().from(billingMandates).where(eq(billingMandates.organizationId, organizationId)).orderBy(desc(billingMandates.createdAt)),
    db.select().from(billingAudit).where(eq(billingAudit.organizationId, organizationId)).orderBy(desc(billingAudit.createdAt)).limit(100),
  ]);
  return { subscriptions, charges, mandates: mandates.map(({ providerMandateId: _hidden, ...mandate }) => mandate), audit };
}
