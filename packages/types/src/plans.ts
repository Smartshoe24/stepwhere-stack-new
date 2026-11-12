export type PlanDto = {
  id: string;
  title: string;
  description: string | null;
  durationMonths: number;
  amountMinor: number | null;
  currencyCode: string | null;
  status: "active" | "inactive";
};

export type ActiveSubscriptionDto = {
  id: string;
  childId: string;
  planId: string;
  source: "admin" | "purchase" | "promo";
  status: "active" | "expired" | "cancelled";
  startsAt: string;
  endsAt: string;
  externalOrderId: string | null;
  externalPurchaseId: string | null;
  plan: PlanDto;
};
