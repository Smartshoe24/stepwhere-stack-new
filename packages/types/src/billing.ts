// Family billing. Prices live on the server; the payment provider only holds
// an autopay mandate and the charges our server raises against it.
// Money is always in minor units (paise). Dates without a time ("on" fields)
// are calendar dates in India time, formatted YYYY-MM-DD.

export type BillingTermMonths = 3 | 6 | 12;
export type BillingCurrency = "INR";
export type BillingEnvironment = "SANDBOX" | "PRODUCTION";
export type BillingProviderName = "cashfree" | "fake";

export type BillingPriceDto = { termMonths: BillingTermMonths; perShoeMinor: number };
export type BillingPricesDto = {
  currency: BillingCurrency;
  version: number;
  maxShoes: number;
  mandateMaxMinor: number;
  prices: BillingPriceDto[];
};

export type BillingDeviceCoverage = "trial" | "paid" | "grace" | "provisional" | "legacy" | "support" | "expired";
export type BillingDeviceDto = {
  deviceId: string; hardwareIdentifier: string; displayName: string | null; childId: string | null;
  trialStartsAt: string; trialEndsAt: string; trialDaysRemaining: number;
  coverage: BillingDeviceCoverage;
  coveredUntil: string | null; graceEndsAt: string | null; expiringSoon: boolean;
  /** On the family plan now. */
  onPlan: boolean;
  /** Joins or leaves the plan at the next renewal. */
  nextOnPlan: boolean | null;
  autoRenews: boolean; enforcementEnabled: boolean;
};

export type CreateBillingQuoteInput =
  | { kind: "new_plan"; deviceIds: string[]; termMonths: BillingTermMonths }
  | { kind: "add_shoes"; deviceIds: string[] };

export type BillingCreditDto = { deviceId: string; days: number; amountMinor: number };
export type BillingScheduleLineDto = {
  kind: "verify" | "first" | "add_shoes" | "renewal";
  on: string;
  amountMinor: number;
  baseMinor: number;
  creditMinor: number;
  deviceIds: string[];
  /** The ₹1 autopay check is refunded straight away. */
  refunded: boolean;
};
export type BillingQuoteDto = {
  id: string; kind: CreateBillingQuoteInput["kind"]; expiresAt: string;
  currency: BillingCurrency;
  /** Every shoe the plan covers once this quote is applied. */
  deviceIds: string[];
  /** Only the shoes this quote adds (equals deviceIds for a new plan). */
  addedDeviceIds: string[];
  shoeCount: number; termMonths: BillingTermMonths; perShoeMinor: number;
  /** Price of every renewal after this quote. */
  renewalAmountMinor: number;
  /** When paid coverage starts for the plan (new plan) or the earliest added shoe. */
  startsAt: string;
  periodEndsAt: string;
  /** No free days are left, so tracking starts as soon as autopay is set up. */
  coverageStartsNow: boolean;
  credits: BillingCreditDto[];
  schedule: BillingScheduleLineDto[];
  requiresMandate: boolean;
  mandateMaxMinor: number;
};

export type BillingCheckoutTokenDto =
  | { provider: "cashfree"; environment: BillingEnvironment; subscriptionId: string; sessionId: string }
  | { provider: "fake"; environment: "SANDBOX"; mandateId: string; sessionId: string };
export type BillingPaymentTokenDto =
  | { provider: "cashfree"; environment: BillingEnvironment; orderId: string; sessionId: string }
  | { provider: "fake"; environment: "SANDBOX"; paymentId: string; sessionId: string };

export type BillingCheckoutState = "awaiting_authorization" | "bank_pending" | "completed" | "failed" | "expired" | "abandoned";
export type BillingCheckoutDto = {
  id: string;
  kind: "new_plan" | "replace_mandate";
  state: BillingCheckoutState;
  /** Present while the user still has to approve the autopay. */
  token: BillingCheckoutTokenDto | null;
  failureReason: "declined" | "expired" | "provider_error" | "superseded" | null;
  subscriptionId: string | null;
  quote: BillingQuoteDto | null;
  createdAt: string; updatedAt: string;
};
export type StartBillingCheckoutInput = { quoteId: string; idempotencyKey: string };

export type BillingSubscriptionState = "scheduled" | "active" | "past_due" | "cancelled" | "expired" | "revoked";
export type BillingAutopayStatus = "active" | "bank_pending" | "off_by_customer" | "paused_by_customer" | "cancelled" | "card_expired" | "failed";
export type BillingAutopayMethod = "upi" | "card" | "enach";
export type BillingChargeKind = "verify" | "first" | "renewal" | "add_shoes" | "one_time";
export type BillingChargeStatus = "scheduled" | "submitted" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export type BillingChargeSummaryDto = {
  id: string; kind: BillingChargeKind; status: BillingChargeStatus;
  dueOn: string; amountMinor: number;
  /** Set for a failed charge we will try again. */
  retryOn: string | null;
};

export type BillingSubscriptionDto = {
  id: string;
  state: BillingSubscriptionState;
  currency: BillingCurrency;
  shoeCount: number; termMonths: BillingTermMonths; deviceIds: string[];
  nextDeviceIds: string[] | null; nextTermMonths: BillingTermMonths | null;
  perShoeMinor: number; renewalAmountMinor: number;
  periodStartsAt: string; periodEndsAt: string; graceEndsAt: string;
  cancelAtPeriodEnd: boolean;
  nextCharge: BillingChargeSummaryDto | null;
  failedCharge: BillingChargeSummaryDto | null;
  autopay: { status: BillingAutopayStatus; method: BillingAutopayMethod | null; label: string | null };
  /** A new autopay is being set up to replace this one. */
  pendingCheckoutId: string | null;
  purchaser: { isYou: boolean; name: string | null };
  revision: number;
};

export type BillingOverviewDto = {
  purchasesEnabled: boolean;
  enforcementEnabled: boolean;
  prices: BillingPricesDto;
  devices: BillingDeviceDto[];
  subscription: BillingSubscriptionDto | null;
  /** Someone in the family is in the middle of setting up a plan. */
  pendingCheckout: { id: string; state: BillingCheckoutState; isYou: boolean; startedByName: string | null } | null;
};

export type ScheduleBillingRenewalInput = {
  revision: number;
  /** Shoes for the next period; null keeps the current shoes. At most the current count. */
  nextDeviceIds: string[] | null;
  /** Billing period for the next period; null keeps the current one. */
  nextTermMonths: BillingTermMonths | null;
};
export type BillingRevisionInput = { revision: number };
export type ApplyBillingQuoteInput = { quoteId: string; idempotencyKey: string };

export type BillingInvoiceDto = {
  number: string; issuedAt: string;
  taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number;
  pdfUrl: string | null;
};
export type BillingChargeDto = BillingChargeSummaryDto & {
  baseMinor: number; creditMinor: number; refundedMinor: number;
  paidAt: string | null; failureReason: string | null;
  description: string;
  method: { kind: BillingAutopayMethod | null; label: string | null };
  invoice: BillingInvoiceDto | null;
};
export type BillingChargesDto = { charges: BillingChargeDto[] };

export type BillingFakeOutcome = "approve" | "bank_pending" | "decline" | "expire" | "pay" | "fail" | "cancel_by_customer" | "pause_by_customer" | "card_expired";
