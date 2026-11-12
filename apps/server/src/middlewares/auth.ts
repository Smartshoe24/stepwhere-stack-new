import type { MiddlewareHandler } from "hono";

import { auth } from "../infrastructure/better-auth";
import { unauthorized } from "../shared/errors";
import { assertAccountAccessAllowed } from "../modules/account-deletion/account-deletion.service";

type SessionResult = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type AuthSession = SessionResult["session"];
export type AuthUser = SessionResult["user"];

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!sessionData?.session || !sessionData.user) {
    throw unauthorized();
  }

  await assertAccountAccessAllowed(sessionData.user.id);

  c.set("session", sessionData.session);
  c.set("user", sessionData.user);

  await next();
};
