import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "./app";

const fetchMock = vi.fn<typeof fetch>();

describe("device ingest proxy app", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("reports health without calling the upstream API", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "stepwhere-device-ingest-proxy",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers HEAD /health for external health checks", async () => {
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/health", { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-json location requests", async () => {
    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "BAD_REQUEST",
      message: "Content-Type must be application/json.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards json location requests to the main server", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { accepted: true } }), {
        headers: {
          "content-type": "application/json",
        },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = {
      hardwareIdentifier: "SW-DEV-0001",
      latitude: 18.5204,
      longitude: 73.8567,
      stepCounter: 12345,
    };
    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-ingest-key": "firmware-key-that-should-not-forward",
        "x-request-id": "simulator-request-id",
      },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { accepted: true } });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://server:8223/v1/telemetry/location",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "simulator-request-id",
        },
        body: JSON.stringify(body),
        signal: expect.anything(),
      },
    );
    expect(response.headers.get("x-request-id")).toBe("simulator-request-id");
  });

  it("returns upstream error status and body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "BAD_REQUEST" }), {
        headers: {
          "content-type": "application/json",
        },
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "BAD_REQUEST" });
  });

  it("does not require a firmware auth header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { accepted: true } }), {
        headers: {
          "content-type": "application/json",
        },
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        hardwareIdentifier: "SW-DEV-0001",
        latitude: 18.5204,
        longitude: 73.8567,
        stepCounter: 12345,
      }),
    });

    expect(response.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      "x-request-id": expect.any(String),
    });
    expect(init?.signal).toBeTruthy();
    expect(response.headers.get("x-request-id")).toBe(
      (init?.headers as Record<string, string>)["x-request-id"],
    );
  });

  it("returns a controlled timeout response", async () => {
    fetchMock.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "timeout-request-id",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(504);
    expect(response.headers.get("x-request-id")).toBe("timeout-request-id");
    await expect(response.json()).resolves.toEqual({
      code: "UPSTREAM_TIMEOUT",
      message: "Stepwhere API did not respond within 15 seconds.",
    });
  });

  it("returns a controlled unavailable response for transport failures", async () => {
    const cause = Object.assign(new Error("connection refused"), {
      code: "ECONNREFUSED",
    });
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/location", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "UPSTREAM_UNAVAILABLE",
      message: "Stepwhere API is unavailable.",
    });
  });
});
