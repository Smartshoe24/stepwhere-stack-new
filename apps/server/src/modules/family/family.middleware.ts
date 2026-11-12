import type { MiddlewareHandler } from "hono";

import { forbidden } from "../../shared/errors";
import { ensureActiveFamilyForUser } from "./family.service";

export const familyMemberMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  const session = c.get("session");
  const membership = await ensureActiveFamilyForUser({
    userId: user.id,
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  });

  c.set("organization", membership.organization);
  c.set("familyMember", membership.member);

  await next();
};

export const familyAdminMiddleware: MiddlewareHandler = async (c, next) => {
  const member = c.get("familyMember");

  if (!member || member.role !== "admin") {
    throw forbidden("Family admin access required.");
  }

  await next();
};
