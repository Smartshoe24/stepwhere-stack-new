export type BillingStore = "APP_STORE" | "PLAY_STORE";
export type BillingTermMonths = 3 | 6 | 12;
export type CreateBillingQuoteInput = { deviceIds: string[]; termMonths: BillingTermMonths; store: BillingStore; currency: string; storefront: string };
export type BillingQuoteSnapshotDto = {
  deviceIds: string[]; termMonths: BillingTermMonths; shoeCount: number; store: BillingStore;
  environment: "SANDBOX" | "PRODUCTION"; productId: string; basePlanId: string | null;
  offerId: string | null; currency: string; storefront: string; amountMinor: number;
  renewalAmountMinor: number; trialCreditBand: number; remainingTrialDays: Record<string, number>;
  change: "initial" | "upgrade" | "deferred"; subscriptionRevision: number | null;
};
export type BillingQuoteDto = BillingQuoteSnapshotDto & { id: string; customerId: string; expiresAt: string };
export type BillingCheckoutIntentDto = BillingQuoteSnapshotDto & { id: string; state: "pending" | "completed" | "deferred" | "abandoned" | "needs_review"; customerId: string; offerCode: string | null };
export type BillingDeviceDto = {
  deviceId: string; hardwareIdentifier: string; displayName: string | null; childId: string | null;
  trialStartsAt: string; trialEndsAt: string; trialDaysRemaining: number;
  coverage: "trial" | "paid" | "grace" | "legacy" | "support" | "expired";
  coveredUntil: string | null; graceEndsAt: string | null; expiringSoon: boolean;
  autoRenews: boolean; enforcementEnabled: boolean;
};
export type BillingSubscriptionDto = {
  id: string; store: BillingStore; environment: "SANDBOX" | "PRODUCTION";
  shoeCount: number; termMonths: BillingTermMonths; deviceIds: string[]; nextDeviceIds: string[] | null;
  state: "active" | "billing_issue" | "expired" | "revoked"; autoRenews: boolean;
  periodStartsAt: string; periodEndsAt: string; graceEndsAt: string; revision: number; isPurchaser: boolean;
};
