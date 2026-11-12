import { describe, expect, it } from "vitest";

import { app } from "./app";

async function preflight(origin: string) {
  return app.request("/v1/telemetry/location", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-device-ingest-key",
    },
  });
}

describe("API CORS", () => {
  it.each([
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "https://panel.stepwhere.in",
  ])("allows configured origin %s", async (origin) => {
    const response = await preflight(origin);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase())
      .toContain("x-device-ingest-key");
  });

  it("does not allow an unconfigured origin", async () => {
    const response = await preflight("https://untrusted.example");

    expect(response.status).toBe(204);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("does not add API-only origins to Better Auth CORS", async () => {
    const response = await app.request("/api/auth/session", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5174",
        "access-control-request-method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
});
