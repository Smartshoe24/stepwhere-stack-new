import { beforeAll, describe, expect, it } from "vitest";

let app: typeof import("../app").app;
let shouldExposeApiReference: typeof import("./docs").shouldExposeApiReference;

describe("OpenAPI docs", () => {
  beforeAll(async () => {
    process.env.NODE_ENV ??= "test";
    process.env.PORT ??= "3001";
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/postgres";
    process.env.BETTER_AUTH_SECRET ??= "test-secret";
    process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
    process.env.AWS_REGION ??= "ap-south-1";
    process.env.AWS_ACCESS_KEY_ID ??= "test-access-key-id";
    process.env.AWS_SECRET_ACCESS_KEY ??= "test-secret-access-key";
    process.env.AWS_S3_STORAGE_BUCKET ??= "stepwhere-test-storage";
    process.env.DEVICE_INGEST_API_KEY ??= "test-device-ingest-api-key";
    process.env.DEVICE_PROVISIONING_SECRET ??= "test-provisioning-secret";

    ({ app } = await import("../app"));
    ({ shouldExposeApiReference } = await import("./docs"));
  }, 30_000);

  it("exposes the OpenAPI spec for /v1 routes", async () => {
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);

    const document = await response.json();
    expect(document.paths["/v1/auth/request-otp"]).toBeDefined();
    expect(document.paths["/v1/auth/prepare-otp"]).toBeDefined();
    expect(document.paths["/v1/auth/signin-recovery/start"]).toBeDefined();
    expect(document.paths["/v1/auth/signin-recovery/verify"]).toBeDefined();
    expect(document.paths["/v1/onboarding/start-family"]).toBeDefined();
    expect(document.paths["/v1/overview"]).toBeDefined();
    expect(document.paths["/v1/children/{childId}/trail"]).toBeDefined();
    expect(document.paths["/v1/home"]).toBeUndefined();
    expect(document.paths["/v1/family"]).toBeDefined();
    expect(document.paths["/v1/admin/users"]).toBeDefined();
    expect(document.paths["/v1/admin/setup"].get).toBeDefined();
    expect(document.paths["/v1/admin/setup"].post).toBeDefined();
    expect(document.paths["/v1/auth/admin/bootstrap-status"]).toBeUndefined();
    expect(document.paths["/api/auth/session"]).toBeUndefined();
    expect(document.components.schemas.UserProfile.properties.onboardingCompleted).toBeDefined();
    expect(document.components.schemas.OverviewResponse).toBeDefined();
    expect(document.components.schemas.ChildGeofence).toBeDefined();
    expect(document.components.schemas.HistoryDataSource.enum).toEqual(["live", "fixture"]);
    expect(document.components.schemas.ChildHistoryRangeResponse.required).toContain("dataSource");
    expect(document.components.schemas.ChildHistoryDayResponse.required).toContain("dataSource");
    expect(document.components.schemas.ChildHistoryRangeResponse.properties.dataSource).toEqual({
      $ref: "#/components/schemas/HistoryDataSource",
    });
    expect(document.components.schemas.ChildHistoryDayResponse.properties.dataSource).toEqual({
      $ref: "#/components/schemas/HistoryDataSource",
    });
    expect(document.components.securitySchemes.bearerAuth).toBeDefined();
    expect(document.components.securitySchemes.deviceAuth).toBeDefined();
    expect(document.components.securitySchemes.deviceIngestKey).toBeDefined();
    expect(document.paths["/v1/device-auth/register"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(document.paths["/v1/telemetry/location"].post.security).toEqual([{ deviceIngestKey: [] }]);
    expect(document.paths["/v1/telemetry/location"].post.responses["503"]).toBeDefined();
  });

  it("renders Scalar against /openapi.json", async () => {
    const response = await app.request("/reference");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("/openapi.json");
  });

  it("returns normalized validation errors from OpenAPI routes", async () => {
    const response = await app.request("/v1/auth/request-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      message: "Request validation failed.",
    });
  });

  it("rejects non-E.164 input for prepare-otp", async () => {
    const response = await app.request("/v1/auth/prepare-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ phoneNumber: "9876543210" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "BAD_REQUEST",
      message: "Enter a valid phone number.",
    });
  });

  it("keeps docs disabled in production unless explicitly enabled", () => {
    expect(shouldExposeApiReference({
      ...process.env,
      NODE_ENV: "production",
      ENABLE_API_REFERENCE: false,
      PORT: 3001,
      DATABASE_URL: "postgresql://example",
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "http://localhost:3001",
      BETTER_AUTH_TRUSTED_ORIGINS: [],
      AWS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "test-access-key-id",
      AWS_SECRET_ACCESS_KEY: "test-secret-access-key",
      AWS_S3_STORAGE_BUCKET: "stepwhere-test-storage",
      DEVICE_INGEST_API_KEY: "secret",
      DEVICE_PROVISIONING_SECRET: "secret",
    } as never)).toBe(false);

    expect(shouldExposeApiReference({
      ...process.env,
      NODE_ENV: "production",
      ENABLE_API_REFERENCE: true,
      PORT: 3001,
      DATABASE_URL: "postgresql://example",
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "http://localhost:3001",
      BETTER_AUTH_TRUSTED_ORIGINS: [],
      AWS_REGION: "ap-south-1",
      AWS_ACCESS_KEY_ID: "test-access-key-id",
      AWS_SECRET_ACCESS_KEY: "test-secret-access-key",
      AWS_S3_STORAGE_BUCKET: "stepwhere-test-storage",
      DEVICE_INGEST_API_KEY: "secret",
      DEVICE_PROVISIONING_SECRET: "secret",
    } as never)).toBe(true);
  });
});
