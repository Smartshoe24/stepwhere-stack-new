import type { MiddlewareHandler } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "../db/client";
import { accounts } from "../db/schema";
import { forbidden } from "../shared/errors";

export const adminMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");

  if (!user || user.role !== "admin" || user.status !== "active" || user.banned) {
    throw forbidden("Admin access required.");
  }

  const [credentialAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password),
      ),
    )
    .limit(1);

  if (!credentialAccount) {
    throw forbidden("Admin access required.");
  }

  await next();
};
