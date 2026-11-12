import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { DeviceReservationSchema, JoinFamilyPreviewSchema, StartOrJoinFamilySchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { authMiddleware } from "../../middlewares/auth";
import { created, ok } from "../../shared/http";
import { releaseDeviceReservation, reserveDeviceForOnboarding } from "../devices/devices.service";
import { ensureActiveFamilyForUser, joinFamilyWithToken, previewJoinFamilyToken, startFamily } from "../family/family.service";

const joinFamilySchema = z.object({
  token: z.string().trim().min(1),
});

const reserveDeviceSchema = z.object({
  hardwareIdentifier: z.string().trim().min(1),
});

const joinFamilyPreviewQuerySchema = z.object({
  token: z.string().trim().min(1).optional().openapi({
    param: {
      name: "token",
      in: "query",
    },
  }),
});

const startFamilyRoute = createRoute({
  method: "post",
  path: "/onboarding/start-family",
  tags: ["Onboarding"],
  security: bearerSecurity,
  middleware: [authMiddleware] as const,
  responses: {
    201: jsonDataResponse(StartOrJoinFamilySchema, "Started a family."),
    ...errorResponses([401, 409]),
  },
});

const reserveDeviceRoute = createRoute({
  method: "post",
  path: "/onboarding/device-reservations",
  tags: ["Onboarding"],
  security: bearerSecurity,
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: reserveDeviceSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(DeviceReservationSchema, "Reserved device for onboarding."),
    ...errorResponses([400, 401, 404, 409]),
  },
});

const releaseDeviceReservationRoute = createRoute({
  method: "delete",
  path: "/onboarding/device-reservations/current",
  tags: ["Onboarding"],
  security: bearerSecurity,
  middleware: [authMiddleware] as const,
  responses: {
    200: jsonDataResponse(z.object({ released: z.boolean() }), "Released current onboarding reservation."),
    ...errorResponses([401]),
  },
});

const joinFamilyPreviewRoute = createRoute({
  method: "get",
  path: "/onboarding/join-family/preview",
  tags: ["Onboarding"],
  security: bearerSecurity,
  middleware: [authMiddleware] as const,
  request: {
    query: joinFamilyPreviewQuerySchema,
  },
  responses: {
    200: jsonDataResponse(JoinFamilyPreviewSchema, "Join family preview."),
  },
});

const joinFamilyRoute = createRoute({
  method: "post",
  path: "/onboarding/join-family",
  tags: ["Onboarding"],
  security: bearerSecurity,
  middleware: [authMiddleware] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: joinFamilySchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(StartOrJoinFamilySchema, "Joined a family."),
    ...errorResponses([400, 401, 403, 404, 409]),
  },
});

const onboardingRoutes = createOpenApiApp();

onboardingRoutes.openapi(startFamilyRoute, async (c) => {
  const user = c.get("user");
  return created(c, await startFamily({
    userId: user.id,
    headers: c.req.raw.headers,
  }));
});

onboardingRoutes.openapi(reserveDeviceRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const body = c.req.valid("json");
  const membership = await ensureActiveFamilyForUser({
    userId: user.id,
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  });

  return ok(c, await reserveDeviceForOnboarding({
    userId: user.id,
    organizationId: membership.organization.id,
    hardwareIdentifier: body.hardwareIdentifier,
  }));
});

onboardingRoutes.openapi(releaseDeviceReservationRoute, async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  const membership = await ensureActiveFamilyForUser({
    userId: user.id,
    headers: c.req.raw.headers,
    activeOrganizationId: session.activeOrganizationId ?? null,
  });

  return ok(c, await releaseDeviceReservation({
    userId: user.id,
    organizationId: membership.organization.id,
  }));
});

onboardingRoutes.openapi(joinFamilyPreviewRoute, async (c) => {
  const { token } = c.req.valid("query");

  if (!token) {
    return ok(c, {
      isValid: false,
      organization: {
        id: "00000000-0000-0000-0000-000000000000",
        name: "",
        slug: "",
        familyName: null,
      },
      role: "member",
      phoneNumber: null,
      inviteKind: "phone",
      expiresAt: new Date(0).toISOString(),
    });
  }

  return ok(c, await previewJoinFamilyToken(token));
});

onboardingRoutes.openapi(joinFamilyRoute, async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  return created(c, await joinFamilyWithToken({
    userId: user.id,
    headers: c.req.raw.headers,
    token: body.token,
  }));
});

export { onboardingRoutes };
