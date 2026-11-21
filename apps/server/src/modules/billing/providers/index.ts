import { env } from "../../../config/env";
import { AppError } from "../../../shared/errors";
import { fakeProvider } from "./fake.provider";
import type { BillingProviderClient } from "./provider";

const notConnected = () => { throw new AppError(503, "BILLING_DISABLED", "Payments aren't available yet."); };

// Cashfree is connected last (docs/billing-cashfree-plan.md). Until then any
// call fails cleanly instead of pretending to take money.
const cashfreeProvider: BillingProviderClient = {
  name: "cashfree",
  createMandate: notConnected, getMandate: notConnected, cancelMandate: notConnected,
  scheduleCharge: notConnected, cancelCharge: notConnected, retryCharge: notConnected, getCharge: notConnected,
  createPayment: notConnected, getPayment: notConnected, refund: notConnected, getRefund: notConnected,
  parseWebhook: notConnected,
};

const providers: Record<BillingProviderClient["name"], BillingProviderClient> = { fake: fakeProvider, cashfree: cashfreeProvider };

/** The provider new mandates go to. Existing rows use the provider they were created with. */
export function activeBillingProvider() {
  return providers[env.BILLING_PROVIDER];
}

export function billingProvider(name: BillingProviderClient["name"]) {
  return providers[name];
}

export { ProviderError, type BillingProviderClient, type ChargeSnapshot, type MandateSnapshot, type ProviderEvent, type RefundSnapshot } from "./provider";
