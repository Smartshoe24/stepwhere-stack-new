import { createRoute, z } from "@hono/zod-openapi";

import { auth } from "../../infrastructure/better-auth";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  FamilyContextSchema,
  FamilyJoinCodeSchema,
  FamilyQrInviteSchema,
  LeaveFamilyResultSchema,
  FamilyMemberSchema,
  FamilySchema,
  RemoveFamilyMemberResultSchema,
  UuidSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { AppError } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { familyAdminMiddleware } from "./family.middleware";
import {
  createFamilyJoinCode,
  createFamilyQrInvite,
  getFamilyMemberById,
  leaveCurrentFamily,
  listActiveJoinCodes,
  listFamilyMembers,
  revokeFamilyJoinCode,
  toRemoveFamilyMemberResultDto,
  toFamilyDto,
  toFamilyContextDto,
} from "./family.service";

const createJoinCodeSchema = z.object({
  phoneNumber: z.string().trim().min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

const createQrInviteSchema = z.object({});

const joinCodeParamsSchema = z.object({
  tokenId: UuidSchema.openapi({
    param: {
      name: "tokenId",
      in: "path",
    },
  }),
});

const memberParamsSchema = z.object({
  memberId: UuidSchema.openapi({
    param: {
      name: "memberId",
      in: "path",
    },
  }),
});

const familyStateSchema = z.object({
  family: FamilySchema,
  memberRole: z.enum(["admin", "member"]),
  context: FamilyContextSchema,
}).openapi("FamilyState");

const getFamilyRoute = createRoute({
  method: "get",
  path: "/family",
  tags: ["Family"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(familyStateSchema, "Current family."),
    ...errorResponses([401, 409]),
  },
});

const listFamilyMembersRoute = createRoute({
  method: "get",
  path: "/family/members",
  tags: ["Family"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(z.array(FamilyMemberSchema), "Family members."),
    ...errorResponses([401, 409]),
  },
});

const removeFamilyMemberRoute = createRoute({
  method: "post",
  path: "/family/members/{memberId}/remove",
  tags: ["Family"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: memberParamsSchema,
  },
  responses: {
    200: jsonDataResponse(RemoveFamilyMemberResultSchema, "Removed family member."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const createQrInviteRoute = createRoute({
  method: "post",
  path: "/family/qr-invites",
  tags: ["Family"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createQrInviteSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(FamilyQrInviteSchema, "Created family QR invite."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const leaveFamilyRoute = createRoute({
  method: "post",
  path: "/family/leave",
  tags: ["Family"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(LeaveFamilyResultSchema, "Left current family."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const listJoinCodesRoute = createRoute({
  method: "get",
  path: "/family/join-codes",
  tags: ["Family"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  responses: {
    200: jsonDataResponse(z.array(FamilyJoinCodeSchema), "Active family join codes."),
    ...errorResponses([401, 403, 409]),
  },
});

const createJoinCodeRoute = createRoute({
  method: "post",
  path: "/family/join-codes",
  tags: ["Family"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createJoinCodeSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(FamilyJoinCodeSchema, "Created family join code."),
    ...errorResponses([400, 401, 403, 409]),
  },
});

const revokeJoinCodeRoute = createRoute({
  method: "post",
  path: "/family/join-codes/{tokenId}/revoke",
  tags: ["Family"],
  security: bearerSecurity,
  middleware: [familyAdminMiddleware] as const,
  request: {
    params: joinCodeParamsSchema,
  },
  responses: {
    200: jsonDataResponse(FamilyJoinCodeSchema, "Revoked family join code."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const familyRoutes = createOpenApiApp();

familyRoutes.openapi(getFamilyRoute, async (c) => {
  const organization = c.get("organization");
  const familyMember = c.get("familyMember");

  return ok(c, {
    family: toFamilyDto(organization),
    memberRole: familyMember.role,
    context: toFamilyContextDto({
      organization,
      member: familyMember,
    }),
  });
});

familyRoutes.openapi(listFamilyMembersRoute, async (c) => {
  const organization = c.get("organization");
  return ok(c, await listFamilyMembers(organization.id));
});

familyRoutes.openapi(removeFamilyMemberRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  const { memberId } = c.req.valid("param");
  const member = await getFamilyMemberById(organization.id, memberId);

  if (member.role === "admin") {
    throw new AppError(400, "BAD_REQUEST", "Family admin cannot be removed through this route.");
  }

  if (member.userId === user.id) {
    throw new AppError(400, "BAD_REQUEST", "You cannot remove yourself through this route.");
  }

  await auth.api.removeMember({
    headers: c.req.raw.headers,
    body: {
      memberIdOrEmail: memberId,
      organizationId: organization.id,
    },
  });

  return ok(c, toRemoveFamilyMemberResultDto(memberId));
});

familyRoutes.openapi(listJoinCodesRoute, async (c) => {
  const organization = c.get("organization");
  return ok(c, await listActiveJoinCodes(organization.id));
});

familyRoutes.openapi(createJoinCodeRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  const body = c.req.valid("json");
  return created(c, await createFamilyJoinCode({
    organizationId: organization.id,
    createdByUserId: user.id,
    phoneNumber: body.phoneNumber,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  }));
});

familyRoutes.openapi(createQrInviteRoute, async (c) => {
  const organization = c.get("organization");
  const user = c.get("user");
  return created(c, await createFamilyQrInvite({
    organizationId: organization.id,
    createdByUserId: user.id,
  }));
});

familyRoutes.openapi(revokeJoinCodeRoute, async (c) => {
  const organization = c.get("organization");
  const { tokenId } = c.req.valid("param");
  return ok(c, await revokeFamilyJoinCode(organization.id, tokenId));
});

familyRoutes.openapi(leaveFamilyRoute, async (c) => {
  const organization = c.get("organization");
  const familyMember = c.get("familyMember");
  const user = c.get("user");
  return ok(c, await leaveCurrentFamily({
    organizationId: organization.id,
    memberId: familyMember.id,
    userId: user.id,
    role: familyMember.role as "admin" | "member",
    headers: c.req.raw.headers,
  }));
});

export { familyRoutes };
