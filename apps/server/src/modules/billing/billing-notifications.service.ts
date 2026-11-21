// Billing reminders and receipts, sent as push notifications through the
// existing outbox. They are stored as already read and kept out of the safety
// inbox, so they never add to the alert badge.
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db/client";
import { billingCharges, billingCustomers, childDeviceBindings, children, deviceActivations, deviceOwnerships, familySubscriptions, members, pushDeliveryJobs, pushInstallations, sessions, userNotifications, users } from "../../db/schema";
import { billingEnforced } from "./billing-coverage.service";
import type { BillingTransaction } from "./billing-ownership.service";
import { addDays, DAY_MS, istDate } from "./billing-pricing";
import { LIVE_STATES } from "./billing.service";

type Executor = typeof db | BillingTransaction;
export type BillingNotice = { key: string; title: string; body: string };

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** "26 Nov", with the year only when it isn't this year. */
export function shortDate(on: string | Date) {
  const date = typeof on === "string" ? new Date(`${on}T00:00:00+05:30`) : on;
  const sameYear = istDate(date).slice(0, 4) === istDate(new Date()).slice(0, 4);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Asia/Kolkata" });
}

export const billingCopy = {
  autopaySetUp: (amountMinor: number, dueOn: string) => ({ title: "Autopay is set up", body: `Your first charge of ${rupees(amountMinor)} is on ${shortDate(dueOn)}.` }),
  chargeTomorrow: (amountMinor: number, termMonths: number) => ({ title: `${rupees(amountMinor)} will be charged tomorrow`, body: `For your ${termMonths}-month Stepwhere plan. You can cancel from Profile → Subscription.` }),
  paymentReceived: (amountMinor: number) => ({ title: "Payment received", body: `${rupees(amountMinor)} for your Stepwhere plan. Your invoice is in Profile → Subscription.` }),
  paymentFailed: (graceEndsAt: Date, retrying: boolean) => ({ title: "Payment didn't go through", body: `${retrying ? "We'll try again tomorrow. " : ""}Tracking continues until ${shortDate(graceEndsAt)}.` }),
  otherPaymentFailed: (name: string, graceEndsAt: Date) => ({ title: `${name}'s autopay didn't go through`, body: `Only ${name} can fix it, by ${shortDate(graceEndsAt)}.` }),
  freeMonthEnding: (childName: string, daysLeft: number, endsAt: Date) => ({
    title: daysLeft <= 0 ? `${childName}'s free month ends today` : `${childName}'s free month ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
    body: `Set up autopay to keep tracking ${childName}. Nothing is charged until ${shortDate(endsAt)}.`,
  }),
  planEnded: () => ({ title: "Tracking has paused", body: "Your Stepwhere plan has ended. Choose a plan to see live location and history again." }),
};

async function familyUserIds(executor: Executor, organizationId: string) {
  const rows = await executor.select({ userId: users.id }).from(members).innerJoin(users, eq(users.id, members.userId)).where(and(eq(members.organizationId, organizationId), eq(users.status, "active")));
  return rows.map((row) => row.userId);
}

export async function purchaserUserId(executor: Executor, customerId: string) {
  const [row] = await executor.select({ userId: billingCustomers.userId, name: users.name }).from(billingCustomers).leftJoin(users, eq(users.id, billingCustomers.userId)).where(eq(billingCustomers.id, customerId));
  return row ?? null;
}

/** Sends once per user per key. */
export async function notifyBilling(executor: Executor, organizationId: string, userIds: string[], notice: BillingNotice) {
  if (!userIds.length) return;
  const already = await executor.select({ userId: userNotifications.userId }).from(userNotifications).where(and(eq(userNotifications.organizationId, organizationId), eq(userNotifications.type, "billing"), inArray(userNotifications.userId, userIds), sql`${userNotifications.data}->>'billingKey' = ${notice.key}`));
  const recipients = userIds.filter((id) => !already.some((row) => row.userId === id));
  if (!recipients.length) return;
  const now = new Date();
  const rows = await executor.insert(userNotifications).values(recipients.map((userId) => ({
    userId, organizationId, type: "billing" as const, priority: "general" as const, title: notice.title, body: notice.body,
    data: { route: "/billing", billingKey: notice.key }, readAt: now, occurredAt: now,
  }))).returning({ id: userNotifications.id, userId: userNotifications.userId });
  const installations = await executor.select({ id: pushInstallations.id, userId: pushInstallations.userId }).from(pushInstallations).innerJoin(sessions, eq(sessions.id, pushInstallations.sessionId))
    .where(and(inArray(pushInstallations.userId, recipients), eq(pushInstallations.status, "active"), gt(sessions.expiresAt, now)));
  const byUser = new Map(rows.map((row) => [row.userId, row.id]));
  const jobs = installations.flatMap((installation) => {
    const userNotificationId = byUser.get(installation.userId);
    return userNotificationId ? [{ userNotificationId, pushInstallationId: installation.id, status: "pending" as const }] : [];
  });
  if (jobs.length) await executor.insert(pushDeliveryJobs).values(jobs);
}

export async function notifyFamily(executor: Executor, organizationId: string, notice: BillingNotice, exceptUserId?: string | null) {
  await notifyBilling(executor, organizationId, (await familyUserIds(executor, organizationId)).filter((id) => id !== exceptUserId), notice);
}

/** Hourly: the day-before charge notice and free-month reminders. */
export async function sendBillingReminders() {
  if (!env.BILLING_PURCHASES_ENABLED) return;
  const tomorrow = addDays(istDate(new Date()), 1);
  const due = await db.select({ charge: billingCharges, termMonths: familySubscriptions.termMonths }).from(billingCharges).innerJoin(familySubscriptions, eq(familySubscriptions.id, billingCharges.subscriptionId))
    .where(and(eq(billingCharges.dueOn, tomorrow), inArray(billingCharges.status, ["scheduled", "submitted"]), inArray(billingCharges.kind, ["first", "renewal", "add_shoes"])));
  for (const { charge, termMonths } of due) {
    const purchaser = await purchaserUserId(db, charge.customerId);
    if (!purchaser?.userId || !charge.organizationId) continue;
    await notifyBilling(db, charge.organizationId, [purchaser.userId], { key: `charge_tomorrow:${charge.id}:${charge.dueOn}`, ...billingCopy.chargeTomorrow(charge.amountMinor, charge.breakdown.termMonths ?? termMonths) });
  }

  // Free months ending in 7, 3 or 0 days, for families billing applies to and only without a plan.
  const now = new Date();
  const shoes = await db.select({ deviceId: deviceActivations.deviceId, trialEndsAt: deviceActivations.trialEndsAt, organizationId: deviceOwnerships.organizationId, childName: children.name })
    .from(deviceActivations).innerJoin(deviceOwnerships, and(eq(deviceOwnerships.deviceId, deviceActivations.deviceId), isNull(deviceOwnerships.releasedAt)))
    .innerJoin(childDeviceBindings, and(eq(childDeviceBindings.deviceId, deviceActivations.deviceId), isNull(childDeviceBindings.unboundAt))).innerJoin(children, eq(children.id, childDeviceBindings.childId))
    .where(and(isNull(deviceActivations.trialConvertedAt), gt(deviceActivations.trialEndsAt, new Date(now.getTime() - DAY_MS)), lte(deviceActivations.trialEndsAt, new Date(now.getTime() + 7 * DAY_MS))));
  for (const shoe of shoes) {
    if (!shoe.organizationId || !billingEnforced(shoe.organizationId)) continue;
    const [live] = await db.select({ id: familySubscriptions.id }).from(familySubscriptions).where(and(eq(familySubscriptions.organizationId, shoe.organizationId), inArray(familySubscriptions.state, [...LIVE_STATES]))).limit(1);
    if (live) continue;
    const daysLeft = Math.max(0, Math.ceil((shoe.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    const bucket = daysLeft <= 0 ? 0 : daysLeft <= 3 ? 3 : 7;
    if (bucket === 7 && daysLeft < 6) continue;
    await notifyFamily(db, shoe.organizationId, { key: `free_month:${shoe.deviceId}:${bucket}`, ...billingCopy.freeMonthEnding(shoe.childName, bucket === 0 ? 0 : daysLeft, shoe.trialEndsAt) });
  }
}
