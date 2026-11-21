import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { BillingFakeOutcome } from "@stepwhere/types";
import { db } from "../../../db/client";
import { billingFakeObjects, billingProviderEvents, type MandateStatus } from "../../../db/schema";
import { badRequest, notFound } from "../../../shared/errors";
import { istDate } from "../billing-pricing";
import { ProviderError, type BillingProviderClient, type ChargeSnapshot, type MandateSnapshot, type RefundSnapshot } from "./provider";

// Stands in for Cashfree until it is connected. Objects live in
// billing_fake_objects; the dev routes move them to any outcome and queue the
// same event a webhook would. Submitted charges settle on their due date.

type FakeKind = "mandate" | "charge" | "payment" | "refund";
type FakeRow = typeof billingFakeObjects.$inferSelect;

async function read(kind: FakeKind, ref: string) {
  const [row] = await db.select().from(billingFakeObjects).where(eq(billingFakeObjects.ref, ref));
  if (!row || row.kind !== kind) throw new ProviderError("not_found", `Fake ${kind} ${ref} does not exist.`);
  return row;
}

async function write(kind: FakeKind, ref: string, status: string, data: Record<string, unknown>) {
  const now = new Date();
  await db.insert(billingFakeObjects).values({ ref, kind, status, data, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: billingFakeObjects.ref, set: { status, data, updatedAt: now } });
}

function mandateSnapshot(row: FakeRow): MandateSnapshot {
  const data = row.data as { method?: MandateSnapshot["method"]; methodLabel?: string };
  return { ref: row.ref, providerMandateId: `fake_${row.ref}`, status: row.status as MandateStatus, method: data.method ?? null, methodLabel: data.methodLabel ?? null, failureReason: row.status === "failed" ? "declined" : null };
}

async function chargeSnapshot(row: FakeRow): Promise<ChargeSnapshot> {
  const data = row.data as { dueOn?: string; paidAt?: string };
  // The fake bank debits on the due date unless a dev outcome said otherwise.
  if (row.status === "submitted" && data.dueOn && data.dueOn <= istDate(new Date())) {
    const paidAt = new Date().toISOString();
    await write(row.kind as FakeKind, row.ref, "paid", { ...data, paidAt });
    return { ref: row.ref, status: "paid", providerPaymentId: `fake_pay_${row.ref}`, paidAt: new Date(paidAt), failureReason: null, providerWillRetry: false };
  }
  const status = row.status as ChargeSnapshot["status"];
  return { ref: row.ref, status, providerPaymentId: `fake_pay_${row.ref}`, paidAt: data.paidAt ? new Date(data.paidAt) : null, failureReason: status === "failed" ? "insufficient_funds" : null, providerWillRetry: false };
}

export const fakeProvider: BillingProviderClient = {
  name: "fake",
  async createMandate({ mandateRef, maxAmountMinor }) {
    await write("mandate", mandateRef, "pending_authorization", { maxAmountMinor });
    return { providerMandateId: `fake_${mandateRef}`, token: { provider: "fake", environment: "SANDBOX", mandateId: mandateRef, sessionId: randomUUID() } };
  },
  async getMandate({ mandateRef }) {
    return mandateSnapshot(await read("mandate", mandateRef));
  },
  async cancelMandate({ mandateRef }) {
    const row = await read("mandate", mandateRef);
    if (row.status === "active" || row.status === "bank_pending" || row.status === "pending_authorization") await write("mandate", mandateRef, "cancelled", row.data);
  },
  async scheduleCharge({ mandateRef, chargeRef, amountMinor, dueOn }) {
    const mandate = await read("mandate", mandateRef);
    if (mandate.status !== "active") throw new ProviderError("mandate_inactive", "The autopay is not active.");
    if (amountMinor > Number((mandate.data as { maxAmountMinor: number }).maxAmountMinor)) throw new ProviderError("amount_over_limit", "The charge is above the autopay limit.");
    await write("charge", chargeRef, "submitted", { mandateRef, amountMinor, dueOn });
    return chargeSnapshot(await read("charge", chargeRef));
  },
  async cancelCharge({ chargeRef }) {
    const row = await read("charge", chargeRef);
    if (row.status === "submitted") await write("charge", chargeRef, "cancelled", row.data);
  },
  async retryCharge({ chargeRef, dueOn }) {
    const row = await read("charge", chargeRef);
    await write("charge", chargeRef, "submitted", { ...row.data, dueOn, paidAt: undefined });
    return chargeSnapshot(await read("charge", chargeRef));
  },
  async getCharge({ chargeRef }) {
    return chargeSnapshot(await read("charge", chargeRef));
  },
  async createPayment({ paymentRef, amountMinor }) {
    await write("payment", paymentRef, "submitted", { amountMinor });
    return { token: { provider: "fake", environment: "SANDBOX", paymentId: paymentRef, sessionId: randomUUID() } };
  },
  async getPayment({ paymentRef }) {
    return chargeSnapshot(await read("payment", paymentRef));
  },
  async refund({ refundRef, amountMinor }): Promise<RefundSnapshot> {
    await write("refund", refundRef, "succeeded", { amountMinor });
    return { ref: refundRef, status: "succeeded", providerRefundId: `fake_refund_${refundRef}` };
  },
  async getRefund({ refundRef }) {
    const row = await read("refund", refundRef);
    return { ref: refundRef, status: row.status as RefundSnapshot["status"], providerRefundId: `fake_refund_${refundRef}` };
  },
  parseWebhook() {
    throw new ProviderError("unsupported", "The fake provider has no webhooks.");
  },
};

const MANDATE_OUTCOMES: Partial<Record<BillingFakeOutcome, { status: MandateStatus; method?: "upi" | "card" | "enach"; methodLabel?: string }>> = {
  approve: { status: "active", method: "upi", methodLabel: "UPI · test@okfake" },
  bank_pending: { status: "bank_pending", method: "enach", methodLabel: "Net banking · Test Bank ••4321" },
  decline: { status: "failed" },
  expire: { status: "expired" },
  cancel_by_customer: { status: "customer_cancelled" },
  pause_by_customer: { status: "customer_paused" },
  card_expired: { status: "card_expired", method: "card", methodLabel: "Card ••4242" },
};

/** Dev only: moves a fake object to an outcome and queues the event a webhook would send. */
export async function applyFakeOutcome(kind: "mandate" | "charge" | "payment", ref: string, outcome: BillingFakeOutcome) {
  const row = await read(kind, ref).catch(() => { throw notFound("NOT_FOUND", `No fake ${kind} with that id.`); });
  if (kind === "mandate") {
    const next = MANDATE_OUTCOMES[outcome];
    if (!next) throw badRequest(`"${outcome}" doesn't apply to an autopay.`);
    // A bank-pending approval completes later; "approve" on it keeps the bank method.
    const data = row.data as Record<string, unknown>;
    const keepMethod = outcome === "approve" && row.status === "bank_pending";
    await write(kind, ref, next.status, { ...data, method: keepMethod ? data.method : next.method ?? data.method, methodLabel: keepMethod ? data.methodLabel : next.methodLabel ?? data.methodLabel });
  } else {
    if (outcome !== "pay" && outcome !== "fail") throw badRequest(`"${outcome}" doesn't apply to a payment.`);
    await write(kind, ref, outcome === "pay" ? "paid" : "failed", { ...row.data, paidAt: outcome === "pay" ? new Date().toISOString() : undefined });
  }
  await db.insert(billingProviderEvents).values({ id: `fake:${randomUUID()}`, payload: { provider: "fake", kind, ref } });
}
