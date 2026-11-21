import type { BillingCheckoutTokenDto, BillingPaymentTokenDto } from "@stepwhere/types";
import type { BillingProvider, MandateStatus } from "../../../db/schema";

// The payment provider only moves money: it holds the autopay mandate, debits
// the charges our server raises, takes one-off payments and refunds. Prices,
// periods, coverage and schedules stay in the billing domain, so swapping
// providers means one class here and one checkout adapter in the app.

export type ProviderCustomer = { name: string; email: string; phone: string };

export type MandateSnapshot = {
  ref: string; providerMandateId: string | null; status: MandateStatus;
  method: "upi" | "card" | "enach" | null; methodLabel: string | null; failureReason: string | null;
};
export type ChargeSnapshot = {
  ref: string; status: "submitted" | "paid" | "failed" | "cancelled";
  providerPaymentId: string | null; paidAt: Date | null; failureReason: string | null;
  /** UPI autopay retries a failed debit itself; cards and eNACH don't. */
  providerWillRetry: boolean;
};
export type RefundSnapshot = { ref: string; status: "pending" | "succeeded" | "failed"; providerRefundId: string | null };

/** A verified callback. The worker re-reads the object from the provider before acting on it. */
export type ProviderEvent = { id: string; kind: "mandate" | "charge" | "payment" | "refund"; ref: string };

export interface BillingProviderClient {
  readonly name: BillingProvider;
  createMandate(input: { mandateRef: string; customer: ProviderCustomer; maxAmountMinor: number; expiresAt: Date; note: string }): Promise<{ providerMandateId: string | null; token: BillingCheckoutTokenDto }>;
  getMandate(input: { mandateRef: string; providerMandateId: string | null }): Promise<MandateSnapshot>;
  cancelMandate(input: { mandateRef: string; providerMandateId: string | null }): Promise<void>;
  /** Raises a debit against an active mandate. dueOn is an IST date at least one day ahead. */
  scheduleCharge(input: { mandateRef: string; providerMandateId: string | null; chargeRef: string; amountMinor: number; dueOn: string; note: string }): Promise<ChargeSnapshot>;
  /** Stops a debit that hasn't happened yet. If the bank takes it anyway, the ledger refunds it. */
  cancelCharge(input: { mandateRef: string; providerMandateId: string | null; chargeRef: string }): Promise<void>;
  retryCharge(input: { mandateRef: string; providerMandateId: string | null; chargeRef: string; dueOn: string }): Promise<ChargeSnapshot>;
  getCharge(input: { mandateRef: string; providerMandateId: string | null; chargeRef: string }): Promise<ChargeSnapshot>;
  /** A one-off payment outside the mandate, for "Pay now". */
  createPayment(input: { paymentRef: string; amountMinor: number; customer: ProviderCustomer; note: string }): Promise<{ token: BillingPaymentTokenDto }>;
  getPayment(input: { paymentRef: string }): Promise<ChargeSnapshot>;
  refund(input: { chargeRef: string; mandateRef: string | null; refundRef: string; amountMinor: number; reason: string }): Promise<RefundSnapshot>;
  getRefund(input: { chargeRef: string; mandateRef: string | null; refundRef: string }): Promise<RefundSnapshot>;
  /** Verifies the signature and returns the objects to refresh. Throws on a bad signature. */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderEvent[];
}

/** The provider refused or failed a request. `retryable` failures are tried again later. */
export class ProviderError extends Error {
  constructor(readonly reason: string, message: string, readonly retryable = false) {
    super(message);
    this.name = "ProviderError";
  }
}
