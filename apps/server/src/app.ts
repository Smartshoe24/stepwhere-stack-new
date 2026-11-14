import { cors } from "hono/cors";
import { sql } from "drizzle-orm";

import type { AppBindings } from "./app-types";
import { env } from "./config/env";
import { db } from "./db/client";
import { auth } from "./infrastructure/better-auth";
import { adminMiddleware } from "./middlewares/admin";
import { authMiddleware } from "./middlewares/auth";
import { appErrorHandler } from "./middlewares/error-handler";
import { requestIdMiddleware } from "./middlewares/request-id";
import { requestTimingMiddleware } from "./middlewares/request-timing";
import { securityHeadersMiddleware } from "./middlewares/security-headers";
import { registerOpenApiDocs } from "./openapi/docs";
import { createOpenApiApp } from "./openapi/create-app";
import { adminRoutes } from "./modules/admin/admin.routes";
import { adminSetupRoutes } from "./modules/admin-setup/admin-setup.routes";
import { accountDeletionRoutes } from "./modules/account-deletion/account-deletion.routes";
import { adminPreviewAccessRoutes } from "./modules/admin/admin-preview-access.routes";
import { adminRealtimeRoutes } from "./modules/admin/admin-realtime.routes";
import { activityRoutes } from "./modules/activity/activity.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { childrenRoutes } from "./modules/children/children.routes";
import { cmsRoutes } from "./modules/cms/cms.routes";
import { devicesRoutes } from "./modules/devices/devices.routes";
import { familyMemberMiddleware } from "./modules/family/family.middleware";
import { familyRoutes } from "./modules/family/family.routes";
import { publicFamilyRoutes } from "./modules/family/family-public.routes";
import { historyRoutes } from "./modules/history/history.routes";
import { notificationsRoutes } from "./modules/notifications/notifications.routes";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes";
import { plansRoutes } from "./modules/plans/plans.routes";
import { placesRoutes } from "./modules/places/places.routes";
import { pushRoutes } from "./modules/push/push.routes";
import { qaAgentRoutes } from "./modules/qa-bench/qa-agent.routes";
import { qaCiRoutes } from "./modules/qa-bench/qa-ci.routes";
import { qaBenchAdminRoutes } from "./modules/qa-bench/qa-bench-admin.routes";
import { qaUnitsAdminRoutes } from "./modules/qa-units/qa-units-admin.routes";
import { realtimeRoutes } from "./modules/realtime/realtime.routes";
import {
  authenticatedSharesRoutes,
  publicSharesRoutes,
} from "./modules/shares/shares.routes";
import {
  familyTelemetryRoutes,
  telemetryIngestRoutes,
} from "./modules/telemetry/telemetry.routes";
import { uploadsRoutes } from "./modules/uploads/uploads.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { billingRoutes, billingWebhookRoutes, purchaserBillingRoutes } from "./modules/billing/billing.routes";
import { billingAdminRoutes } from "./modules/billing/billing-admin.routes";
import { getSafeErrorDetails } from "./shared/background-task";

const app = createOpenApiApp();
const v1App = createOpenApiApp();
const authenticatedV1App = createOpenApiApp();
const familyV1App = createOpenApiApp();
const adminV1App = createOpenApiApp();
const sharedCorsOptions = {
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Provisioning-Secret",
    "x-device-ingest-key",
  ],
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: [
    "Content-Length",
    "Set-Cookie",
    "set-auth-token",
    "x-request-id",
  ],
  maxAge: 600,
  credentials: true,
};

app.use("*", requestIdMiddleware);
app.use("*", requestTimingMiddleware);
app.use("*", securityHeadersMiddleware);
app.onError(appErrorHandler);
app.use("/api/auth/*", cors({
  ...sharedCorsOptions,
  origin: toAuthCorsOrigin,
}));
app.use("/v1/*", cors({
  ...sharedCorsOptions,
  origin: toApiCorsOrigin,
}));

registerOpenApiDocs(app);

app.get("/", (c) => {
  return c.json({
    service: "stepwhere-api",
    status: "ok",
  });
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "stepwhere-api",
    authBasePath: "/api/auth",
  });
});

app.get("/ready", async (c) => {
  try {
    await db.execute(sql`select 1 as ready`);
    return c.json({
      ok: true,
      service: "stepwhere-api",
      database: "ready",
    });
  } catch (error) {
    console.error("[readiness] database check failed", getSafeErrorDetails(error));
    return c.json({
      ok: false,
      service: "stepwhere-api",
      database: "unavailable",
    }, 503);
  }
});

app.options("/api/auth/*", (c) => c.body(null, 204));
app.options("/v1/*", (c) => c.body(null, 204));

app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

v1App.route("/", authRoutes);
v1App.route("/", billingWebhookRoutes);
v1App.route("/", devicesRoutes);
v1App.route("/", publicSharesRoutes);
v1App.route("/", publicFamilyRoutes);
v1App.route("/", realtimeRoutes);
v1App.route("/", qaAgentRoutes);
v1App.route("/", qaCiRoutes);
v1App.route("/", adminRealtimeRoutes);
// Public first-run setup; registered before adminV1App's /admin/* auth guards.
v1App.route("/", adminSetupRoutes);
v1App.route("/", telemetryIngestRoutes);

authenticatedV1App.use("*", authMiddleware);
authenticatedV1App.route("/", usersRoutes);
authenticatedV1App.route("/", accountDeletionRoutes);
authenticatedV1App.route("/", cmsRoutes);
authenticatedV1App.route("/", onboardingRoutes);
authenticatedV1App.route("/", authenticatedSharesRoutes);
authenticatedV1App.route("/", uploadsRoutes);
authenticatedV1App.route("/", pushRoutes);
authenticatedV1App.route("/", placesRoutes);
authenticatedV1App.route("/", purchaserBillingRoutes);

familyV1App.use("*", authMiddleware);
familyV1App.use("*", familyMemberMiddleware);
familyV1App.route("/", childrenRoutes);
familyV1App.route("/", activityRoutes);
familyV1App.route("/", historyRoutes);
familyV1App.route("/", familyRoutes);
familyV1App.route("/", familyTelemetryRoutes);
familyV1App.route("/", notificationsRoutes);
familyV1App.route("/", plansRoutes);
familyV1App.route("/", billingRoutes);

adminV1App.use("/admin/*", authMiddleware);
adminV1App.use("/admin/*", adminMiddleware);
adminV1App.route("/", adminRoutes);
adminV1App.route("/", adminPreviewAccessRoutes);
adminV1App.route("/", billingAdminRoutes);
adminV1App.route("/", qaBenchAdminRoutes);
adminV1App.route("/", qaUnitsAdminRoutes);

v1App.route("/", authenticatedV1App);
v1App.route("/", adminV1App);
v1App.route("/", familyV1App);

app.route("/v1", v1App);

function toAuthCorsOrigin(origin: string) {
  return toCorsOrigin(origin, []);
}

function toApiCorsOrigin(origin: string) {
  return toCorsOrigin(origin, env.API_CORS_ALLOWED_ORIGINS);
}

function toCorsOrigin(origin: string, additionalOrigins: string[]) {
  if (!origin) {
    return env.BETTER_AUTH_URL;
  }

  const allowedOrigins = new Set([
    env.BETTER_AUTH_URL,
    env.PUBLIC_SHARE_APP_URL,
    ...getAdditionalDevOrigins(),
    ...env.BETTER_AUTH_TRUSTED_ORIGINS,
    ...additionalOrigins,
  ]);

  return allowedOrigins.has(origin) ? origin : undefined;
}

function getAdditionalDevOrigins() {
  if (env.NODE_ENV !== "development") {
    return [];
  }

  return [3000, 5173, 5174, 5175, 4800, 5176].flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);
}

export { app };
