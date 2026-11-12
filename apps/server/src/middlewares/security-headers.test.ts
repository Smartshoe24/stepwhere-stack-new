import { describe, expect, it } from "vitest";

import { app } from "../app";
import { SECURITY_HEADERS } from "./security-headers";

function expectSecurityHeaders(response: Response) {
  expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
}

describe("API security headers", () => {
  it("defines exactly the headers the edge Caddy used to add", () => {
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(3);
  });

  it("adds them to normal responses", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expectSecurityHeaders(response);
  });

  it("adds them to error responses", async () => {
    const response = await app.request("/v1/users/me");

    expect(response.status).toBe(401);
    expectSecurityHeaders(response);
  });

  it("keeps CORS preflight headers intact", async () => {
    const origin = "https://panel.stepwhere.in";
    const response = await app.request("/v1/admin/users", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expectSecurityHeaders(response);
  });
});
