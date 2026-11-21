// End-to-end billing flows against a real Postgres with the fake provider.
// Skipped unless BILLING_IT=1. Run against a throwaway database:
//   BILLING_IT=1 BILLING_PURCHASES_ENABLED=true DATABASE_URL=postgresql://… npx vitest run billing.flow
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { billingCharges, billingCheckoutIntents, billingInvoices, billingMandates, billingRefunds, deviceActivations, deviceCoverageIntervals, deviceOwnerships, devices, familySubscriptions, members, organizations, userNotifications, users } from "../../db/schema";
import { DAY_MS } from "./billing-pricing";
import { getCheckout, startAutopayCheckout, startPlanCheckout } from "./billing-checkout.service";
import { addShoes, cancelPlan, listCharges, payNow, resumePlan, scheduleRenewal } from "./billing-subscription.service";
import { createBillingQuote, getBillingOverview } from "./billing.service";
import { createRenewalCharges, expireBillingState, processBillingEvents, reconcileMandates, submitDueCharges } from "./billing.worker";
import { applyFakeOutcome } from "./providers/fake.provider";

const run = process.env.BILLING_IT === "1" ? describe : describe.skip;

async function user(name: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@test.stepwhere.in`, phoneNumber: `+91${Math.floor(6e9 + Math.random() * 3e9)}` });
  return id;
}

async function family(userIds: string[]) {
  const [org] = await db.insert(organizations).values({ name: "Test family", slug: `test-${randomUUID()}` }).returning();
  await db.insert(members).values(userIds.map((userId, index) => ({ organizationId: org.id, userId, role: index === 0 ? "owner" : "member" })));
  return org.id;
}

async function shoe(organizationId: string, trialEndsInMs: number) {
  const [device] = await db.insert(devices).values({ hardwareIdentifier: `TEST-${randomUUID()}` }).returning();
  const now = Date.now();
  await db.insert(deviceOwnerships).values({ deviceId: device.id, organizationId });
  const trialEndsAt = new Date(now + trialEndsInMs);
  await db.insert(deviceActivations).values({ deviceId: device.id, activatedAt: new Date(now + trialEndsInMs - 30 * DAY_MS), trialEndsAt });
  // What claiming a shoe grants: the free month and its 3-day grace.
  await db.insert(deviceCoverageIntervals).values([
    { deviceId: device.id, organizationId, grantKey: `trial:${device.id}`, source: "trial", startsAt: new Date(now + trialEndsInMs - 30 * DAY_MS), endsAt: trialEndsAt },
    { deviceId: device.id, organizationId, grantKey: `trial:${device.id}`, source: "grace", startsAt: trialEndsAt, endsAt: new Date(trialEndsAt.getTime() + 3 * DAY_MS) },
  ]);
  return device.id;
}

const fake = async (kind: "mandate" | "charge" | "payment", id: string, outcome: Parameters<typeof applyFakeOutcome>[2]) => {
  await applyFakeOutcome(kind, id, outcome);
  await processBillingEvents();
};
const subscriptionOf = async (organizationId: string) => (await db.select().from(familySubscriptions).where(eq(familySubscriptions.organizationId, organizationId)))[0];
const chargesOf = (subscriptionId: string) => db.select().from(billingCharges).where(eq(billingCharges.subscriptionId, subscriptionId)).orderBy(billingCharges.createdAt);

run("billing flows with the fake provider", () => {
  let priya: string, rahul: string, org: string, riya: string, arjun: string, kabir: string;

  beforeAll(async () => {
    priya = await user("Priya");
    rahul = await user("Rahul");
    org = await family([priya, rahul]);
    riya = await shoe(org, DAY_MS + 3_600_000);
    arjun = await shoe(org, 10 * DAY_MS);
    kabir = await shoe(org, 20 * DAY_MS);
  });

  it("sets up a plan that starts when the first free month ends", async () => {
    const quote = await createBillingQuote(org, priya, { kind: "new_plan", deviceIds: [riya, arjun], termMonths: 6 });
    const first = quote.schedule.find((line) => line.kind === "first")!;
    expect(quote.coverageStartsNow).toBe(false);
    expect(first.baseMinor).toBe(109_800);
    expect(quote.credits).toHaveLength(1);
    expect(quote.credits[0].deviceId).toBe(arjun);
    expect(first.amountMinor).toBe(109_800 - quote.credits[0].amountMinor);

    const checkout = await startPlanCheckout(org, priya, { quoteId: quote.id, idempotencyKey: randomUUID() });
    expect(checkout.state).toBe("awaiting_authorization");
    expect(checkout.token?.provider).toBe("fake");

    // Someone else in the family has to wait.
    const otherQuote = await createBillingQuote(org, rahul, { kind: "new_plan", deviceIds: [riya], termMonths: 3 });
    await expect(startPlanCheckout(org, rahul, { quoteId: otherQuote.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    const rahulView = await getBillingOverview(org, rahul);
    expect(rahulView.pendingCheckout).toMatchObject({ isYou: false, startedByName: "Priya" });
    expect((await getCheckout(org, rahul, checkout.id)).token).toBeNull();

    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "approve");
    const done = await getCheckout(org, priya, checkout.id);
    expect(done.state).toBe("completed");

    const subscription = await subscriptionOf(org);
    expect(subscription.state).toBe("scheduled");
    const [charge] = await chargesOf(subscription.id);
    expect(charge).toMatchObject({ kind: "first", status: "scheduled", amountMinor: first.amountMinor });
    const provisional = await db.select().from(deviceCoverageIntervals).where(and(eq(deviceCoverageIntervals.subscriptionId, subscription.id), eq(deviceCoverageIntervals.source, "provisional")));
    expect(provisional).toHaveLength(2);
  });

  it("debits the first charge, covers the shoes and issues an invoice", async () => {
    await submitDueCharges();
    const subscription = await subscriptionOf(org);
    const [charge] = await chargesOf(subscription.id);
    expect(charge.status).toBe("submitted");
    await fake("charge", charge.id, "pay");
    const after = await subscriptionOf(org);
    expect(after.state).toBe("active");
    expect(after.graceEndsAt.getTime()).toBe(after.periodEndsAt.getTime() + 3 * DAY_MS);
    const alerts = await db.select().from(userNotifications).where(and(eq(userNotifications.userId, priya), eq(userNotifications.type, "billing")));
    expect(alerts.map((alert) => alert.title)).toEqual(expect.arrayContaining(["Autopay is set up", "Payment received"]));
    expect(alerts.every((alert) => alert.readAt)).toBe(true);
    const [invoice] = await db.select().from(billingInvoices).where(eq(billingInvoices.chargeId, charge.id));
    expect(invoice.number).toMatch(/^SW\/\d\d-\d\d\/\d{5}$/);
    expect(invoice.taxableMinor + invoice.cgstMinor + invoice.sgstMinor).toBe(charge.amountMinor);
    const overview = await getBillingOverview(org, priya);
    expect(overview.subscription).toMatchObject({ state: "active", purchaser: { isYou: true }, autopay: { status: "active", method: "upi" } });
    // Still on the free month today; the paid period follows it without a gap.
    const riyaShoe = overview.devices.find((device) => device.deviceId === riya)!;
    expect(riyaShoe.coverage).toBe("trial");
    expect(Date.parse(riyaShoe.coveredUntil!)).toBe(after.periodEndsAt.getTime() + 3 * DAY_MS);
  });

  it("only lets the person who pays change the plan", async () => {
    await expect(createBillingQuote(org, rahul, { kind: "add_shoes", deviceIds: [kabir] })).rejects.toMatchObject({ code: "NOT_PURCHASER" });
    await expect(listCharges(org, rahul)).rejects.toMatchObject({ code: "NOT_PURCHASER" });
  });

  it("adds a shoe for the rest of the period and schedules a period change", async () => {
    const quote = await createBillingQuote(org, priya, { kind: "add_shoes", deviceIds: [kabir] });
    expect(quote.renewalAmountMinor).toBe(3 * 54_900);
    const updated = await addShoes(org, priya, { quoteId: quote.id, idempotencyKey: randomUUID() });
    expect(updated.shoeCount).toBe(3);
    // Applying the same quote again changes nothing.
    expect((await addShoes(org, priya, { quoteId: quote.id, idempotencyKey: randomUUID() })).revision).toBe(updated.revision);
    const added = (await chargesOf(updated.id)).find((charge) => charge.kind === "add_shoes")!;
    expect(added.status).toBe("scheduled");
    const renewal = await scheduleRenewal(org, priya, { revision: updated.revision, nextDeviceIds: null, nextTermMonths: 12 });
    expect(renewal.renewalAmountMinor).toBe(3 * 89_900);
  });

  it("recovers a failed renewal with a one-off payment", async () => {
    const before = await subscriptionOf(org);
    await db.update(familySubscriptions).set({ periodEndsAt: new Date(Date.now() + 2 * DAY_MS), graceEndsAt: new Date(Date.now() + 5 * DAY_MS) }).where(eq(familySubscriptions.id, before.id));
    await createRenewalCharges();
    await submitDueCharges();
    const renewal = (await chargesOf(before.id)).find((charge) => charge.kind === "renewal")!;
    expect(renewal).toMatchObject({ status: "submitted", amountMinor: 3 * 89_900 });
    await fake("charge", renewal.id, "fail");
    expect((await subscriptionOf(org)).state).toBe("past_due");
    const [rahulAlert] = await db.select().from(userNotifications).where(and(eq(userNotifications.userId, rahul), eq(userNotifications.type, "billing")));
    expect(rahulAlert.title).toBe("Priya's autopay didn't go through");
    const [failed] = await db.select().from(billingCharges).where(eq(billingCharges.id, renewal.id));
    expect(failed.nextAttemptOn).not.toBeNull();

    const { chargeId, token } = await payNow(org, priya, renewal.id);
    expect(token.provider).toBe("fake");
    await fake("payment", chargeId, "pay");
    const after = await subscriptionOf(org);
    expect(after).toMatchObject({ state: "active", termMonths: 12, shoeCount: 3, nextTermMonths: null });
    const [settled] = await db.select().from(billingCharges).where(eq(billingCharges.id, renewal.id));
    expect(settled).toMatchObject({ status: "cancelled", failureReason: "paid_separately" });
    const charges = await listCharges(org, priya);
    expect(charges.charges.map((charge) => charge.kind)).toEqual(expect.arrayContaining(["first", "one_time", "verify"]));
  });

  it("cancels, needs a new autopay to resume, then follows the customer's UPI app", async () => {
    let subscription = await subscriptionOf(org);
    const cancelled = await cancelPlan(org, priya, subscription.revision);
    expect(cancelled).toMatchObject({ state: "cancelled", cancelAtPeriodEnd: true });
    const [oldMandate] = await db.select().from(billingMandates).where(eq(billingMandates.id, subscription.mandateId));
    expect(oldMandate.status).toBe("cancelled");
    await expect(resumePlan(org, priya, cancelled.revision)).rejects.toMatchObject({ code: "AUTOPAY_REQUIRED" });

    const checkout = await startAutopayCheckout(org, priya, randomUUID());
    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "approve");
    subscription = await subscriptionOf(org);
    expect(subscription).toMatchObject({ state: "active", cancelAtPeriodEnd: false });
    expect(subscription.mandateId).not.toBe(oldMandate.id);

    await fake("mandate", subscription.mandateId, "cancel_by_customer");
    const overview = await getBillingOverview(org, priya);
    expect(overview.subscription).toMatchObject({ state: "cancelled", autopay: { status: "off_by_customer" } });
  });

  it("expires the plan when its grace runs out", async () => {
    const subscription = await subscriptionOf(org);
    await db.update(familySubscriptions).set({ graceEndsAt: new Date(Date.now() - 1000) }).where(eq(familySubscriptions.id, subscription.id));
    await expireBillingState();
    expect((await subscriptionOf(org)).state).toBe("expired");
  });

  it("starts tracking straight away when no free days are left", async () => {
    const parent = await user("Asha");
    const otherOrg = await family([parent]);
    const used = await shoe(otherOrg, -5 * DAY_MS);
    const quote = await createBillingQuote(otherOrg, parent, { kind: "new_plan", deviceIds: [used], termMonths: 3 });
    expect(quote.coverageStartsNow).toBe(true);
    const declined = await startPlanCheckout(otherOrg, parent, { quoteId: quote.id, idempotencyKey: randomUUID() });
    await fake("mandate", (declined.token as { mandateId: string }).mandateId, "decline");
    expect((await getCheckout(otherOrg, parent, declined.id)).state).toBe("failed");
    expect(await subscriptionOf(otherOrg)).toBeUndefined();

    const retry = await startPlanCheckout(otherOrg, parent, { quoteId: quote.id, idempotencyKey: randomUUID() });
    await fake("mandate", (retry.token as { mandateId: string }).mandateId, "approve");
    const subscription = await subscriptionOf(otherOrg);
    expect(subscription.state).toBe("active");
    const overview = await getBillingOverview(otherOrg, parent);
    expect(overview.devices[0].coverage).toBe("provisional");
  });
});

run("billing safety: money is never taken twice or lost", () => {
  async function planWithPaidFirstCharge(trialEndsInMs = DAY_MS + 3_600_000) {
    const parent = await user("Meera");
    const orgId = await family([parent]);
    const first = await shoe(orgId, trialEndsInMs);
    const second = await shoe(orgId, 20 * DAY_MS);
    const quote = await createBillingQuote(orgId, parent, { kind: "new_plan", deviceIds: [first], termMonths: 3 });
    const checkout = await startPlanCheckout(orgId, parent, { quoteId: quote.id, idempotencyKey: randomUUID() });
    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "approve");
    return { parent, orgId, first, second, subscription: await subscriptionOf(orgId) };
  }

  it("refunds a debit the bank takes after the plan was cancelled, and gives the free month back", async () => {
    const { parent, orgId, first, subscription } = await planWithPaidFirstCharge();
    await submitDueCharges();
    const [charge] = await chargesOf(subscription.id);
    expect(charge.status).toBe("submitted");
    await cancelPlan(orgId, parent, subscription.revision);
    expect((await subscriptionOf(orgId)).state).toBe("expired");
    const [activation] = await db.select().from(deviceActivations).where(eq(deviceActivations.deviceId, first));
    expect(activation.trialConvertedAt).toBeNull();
    // The bank debits anyway.
    await fake("charge", charge.id, "pay");
    const [late] = await db.select().from(billingCharges).where(eq(billingCharges.id, charge.id));
    expect(late.status).toBe("refunded");
    const refunds = await db.select().from(billingRefunds).where(eq(billingRefunds.chargeId, charge.id));
    expect(refunds).toHaveLength(1);
    expect((await subscriptionOf(orgId)).state).toBe("expired");
  });

  it("refunds the second of two pay-now payments for the same failed charge", async () => {
    const { parent, orgId, subscription } = await planWithPaidFirstCharge();
    await submitDueCharges();
    const [charge] = await chargesOf(subscription.id);
    await fake("charge", charge.id, "fail");
    const one = await payNow(orgId, parent, charge.id);
    const two = await payNow(orgId, parent, charge.id);
    await fake("payment", one.chargeId, "pay");
    await fake("payment", two.chargeId, "pay");
    const [first, second] = await Promise.all([one.chargeId, two.chargeId].map(async (id) => (await db.select().from(billingCharges).where(eq(billingCharges.id, id)))[0]));
    expect(first.status).toBe("paid");
    expect(second.status).toBe("refunded");
    expect((await subscriptionOf(orgId)).state).toBe("active");
  });

  it("moves a failed charge to a new autopay once, and leaves pay-now payments alone", async () => {
    const { parent, orgId, subscription } = await planWithPaidFirstCharge();
    await submitDueCharges();
    const [charge] = await chargesOf(subscription.id);
    await fake("charge", charge.id, "fail");
    const payment = await payNow(orgId, parent, charge.id);
    await fake("payment", payment.chargeId, "fail");
    const checkout = await startAutopayCheckout(orgId, parent, randomUUID());
    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "approve");
    await submitDueCharges();
    await submitDueCharges();
    const charges = await chargesOf(subscription.id);
    const live = charges.filter((row) => row.kind === "first" && row.status !== "cancelled");
    expect(live).toHaveLength(1);
    expect(live[0].mandateId).toBe((await subscriptionOf(orgId)).mandateId);
    expect(charges.filter((row) => row.kind === "one_time" && row.status === "scheduled")).toHaveLength(0);
  });

  it("raises an add-shoes charge again when autopay is turned back on", async () => {
    const { parent, orgId, second, subscription } = await planWithPaidFirstCharge();
    await submitDueCharges();
    await fake("charge", (await chargesOf(subscription.id))[0].id, "pay");
    const quote = await createBillingQuote(orgId, parent, { kind: "add_shoes", deviceIds: [second] });
    const added = await addShoes(orgId, parent, { quoteId: quote.id, idempotencyKey: randomUUID() });
    await cancelPlan(orgId, parent, added.revision);
    expect((await chargesOf(subscription.id)).filter((row) => row.kind === "add_shoes" && row.status === "scheduled")).toHaveLength(0);
    const checkout = await startAutopayCheckout(orgId, parent, randomUUID());
    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "approve");
    expect((await chargesOf(subscription.id)).filter((row) => row.kind === "add_shoes" && row.status === "scheduled")).toHaveLength(1);
  });

  it("keeps a bank-pending setup's five-day limit from its start", async () => {
    const parent = await user("Kiran");
    const orgId = await family([parent]);
    const device = await shoe(orgId, 10 * DAY_MS);
    const quote = await createBillingQuote(orgId, parent, { kind: "new_plan", deviceIds: [device], termMonths: 6 });
    const checkout = await startPlanCheckout(orgId, parent, { quoteId: quote.id, idempotencyKey: randomUUID() });
    await fake("mandate", (checkout.token as { mandateId: string }).mandateId, "bank_pending");
    const [before] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, checkout.id));
    await getCheckout(orgId, parent, checkout.id);
    await reconcileMandates();
    const [after] = await db.select().from(billingCheckoutIntents).where(eq(billingCheckoutIntents.id, checkout.id));
    expect(after.state).toBe("bank_pending");
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });
});
