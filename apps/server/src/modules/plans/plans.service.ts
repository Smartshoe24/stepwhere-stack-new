import { and, desc, eq, gt, lte } from "drizzle-orm";
import type { ActiveSubscriptionDto, PlanDto } from "@stepwhere/types";

import { db } from "../../db/client";
import { childPlanSubscriptions, plans } from "../../db/schema";
import { toIsoString } from "../../shared/mappers";

function toPlanDto(plan: typeof plans.$inferSelect): PlanDto {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    durationMonths: plan.durationMonths,
    amountMinor: plan.amountMinor,
    currencyCode: plan.currencyCode,
    status: plan.status,
  };
}

export async function listActivePlans() {
  const results = await db.select().from(plans).where(eq(plans.status, "active")).orderBy(plans.durationMonths);
  return results.map(toPlanDto);
}

export async function getActiveSubscriptionForChild(childId: string): Promise<ActiveSubscriptionDto | null> {
  const [subscription] = await db
    .select({
      subscription: childPlanSubscriptions,
      plan: plans,
    })
    .from(childPlanSubscriptions)
    .innerJoin(plans, eq(childPlanSubscriptions.planId, plans.id))
    .where(and(eq(childPlanSubscriptions.childId, childId), eq(childPlanSubscriptions.status, "active"), lte(childPlanSubscriptions.startsAt, new Date()), gt(childPlanSubscriptions.endsAt, new Date())))
    .orderBy(desc(childPlanSubscriptions.startsAt))
    .limit(1);

  if (!subscription) {
    return null;
  }

  return {
    id: subscription.subscription.id,
    childId: subscription.subscription.childId,
    planId: subscription.subscription.planId,
    source: subscription.subscription.source,
    status: subscription.subscription.status,
    startsAt: subscription.subscription.startsAt.toISOString(),
    endsAt: subscription.subscription.endsAt.toISOString(),
    externalOrderId: subscription.subscription.externalOrderId,
    externalPurchaseId: subscription.subscription.externalPurchaseId,
    plan: toPlanDto(subscription.plan),
  };
}
