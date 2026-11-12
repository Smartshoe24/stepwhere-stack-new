import { beforeAll, describe, expect, it } from "vitest";

let app: typeof import("./app").app;

describe("route protection", () => {
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

    ({ app } = await import("./app"));
  }, 30_000);

  it("rejects anonymous access to authenticated user routes", async () => {
    const response = await app.request("/v1/me");

    expect(response.status).toBe(401);
  });

  it("rejects anonymous access to onboarding routes", async () => {
    const response = await app.request("/v1/onboarding/start-family", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    });

    expect(response.status).toBe(401);
  });

  it("rejects anonymous access to the device registration route", async () => {
    const response = await app.request("/v1/device-auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ hardwareIdentifier: "STEP-DEVICE-001" }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects anonymous access to CMS routes and leaves public share routes unauthenticated", async () => {
    const cmsResponse = await app.request("/v1/cms-pages");
    const shareResponse = await app.request("/v1/share-links/test-token");

    expect(cmsResponse.status).toBe(401);
    expect(shareResponse.status).not.toBe(401);
  });

  it("rejects telemetry ingestion without the device ingest api key", async () => {
    const response = await app.request("/v1/telemetry/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        hardwareIdentifier: "STEP-DEVICE-001",
        latitude: 18.5204,
        longitude: 73.8567,
        stepCounter: 42,
      }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects anonymous access to family telemetry routes", async () => {
    const childId = "310e257c-74b8-4fbe-a041-95c5e6d7a097";

    const [liveResponse, historyResponse, trailResponse] = await Promise.all([
      app.request(`/v1/children/${childId}/live`),
      app.request(`/v1/children/${childId}/history`),
      app.request(`/v1/children/${childId}/trail`),
    ]);

    expect(liveResponse.status).toBe(401);
    expect(historyResponse.status).toBe(401);
    expect(trailResponse.status).toBe(401);
  });
});
