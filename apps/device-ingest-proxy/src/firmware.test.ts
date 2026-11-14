import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "./app";
import { firmwarePathAllowed, parseRange } from "./firmware";

describe("firmware routes", () => {
  let dir: string;
  const image = Buffer.from(Array.from({ length: 10000 }, (_, i) => i % 251));

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fw-"));
    await mkdir(path.join(dir, "releases/1.3.0"), { recursive: true });
    await writeFile(path.join(dir, "manifest.json"), '{"version":"1.3.0"}');
    await writeFile(path.join(dir, "releases/1.3.0/stepwhere.ota"), image);
    process.env.FIRMWARE_DIR = dir;
  });

  afterAll(async () => {
    delete process.env.FIRMWARE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.FIRMWARE_UPSTREAM_URL;
    vi.unstubAllGlobals();
  });

  it("serves the manifest with a short cache", async () => {
    const response = await app.request("/fw/manifest.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.text()).toBe('{"version":"1.3.0"}');
  });

  it("serves byte ranges that reassemble to the image", async () => {
    const first = await app.request("/fw/releases/1.3.0/stepwhere.ota", { headers: { range: "bytes=0-4095" } });
    const rest = await app.request("/fw/releases/1.3.0/stepwhere.ota", { headers: { range: "bytes=4096-" } });
    expect(first.status).toBe(206);
    expect(first.headers.get("content-range")).toBe("bytes 0-4095/10000");
    expect(rest.status).toBe(206);
    const joined = Buffer.concat([Buffer.from(await first.arrayBuffer()), Buffer.from(await rest.arrayBuffer())]);
    expect(joined.equals(image)).toBe(true);
  });

  it("serves ranges as hex text with ?enc=hex", async () => {
    const response = await app.request("/fw/releases/1.3.0/stepwhere.ota?enc=hex", {
      headers: { range: "bytes=4096-4607" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-range")).toBe("bytes 4096-4607/10000");
    expect(response.headers.get("content-length")).toBe("1024");
    const text = await response.text();
    expect(text).toMatch(/^[0-9a-f]{1024}$/);
    expect(Buffer.from(text, "hex").equals(image.subarray(4096, 4608))).toBe(true);
  });

  it("hex-encodes upstream ranges and rejects other encodings", async () => {
    process.env.FIRMWARE_UPSTREAM_URL = "https://cdn.example/fw";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from([0x00, 0xff, 0x10]), {
      status: 206,
      headers: { "content-range": "bytes 0-2/10", "content-length": "3" },
    })));
    const response = await app.request("/fw/releases/1.3.0/stepwhere.ota?enc=hex", { headers: { range: "bytes=0-2" } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("00ff10");
    expect(response.headers.get("content-length")).toBe("6");
    expect((await app.request("/fw/releases/1.3.0/stepwhere.ota?enc=base64")).status).toBe(404);
    expect((await app.request("/fw/manifest.json?enc=hex")).status).toBe(404);
  });

  it("answers 416 past the end and 404 for missing or disallowed paths", async () => {
    expect((await app.request("/fw/releases/1.3.0/stepwhere.ota", { headers: { range: "bytes=20000-" } })).status).toBe(416);
    expect((await app.request("/fw/devices/861234567890123.json")).status).toBe(404);
    expect((await app.request("/fw/../package.json")).status).toBe(404);
    expect((await app.request("/fw/releases/1.3.0/other.bin")).status).toBe(404);
  });

  it("forwards Range to FIRMWARE_UPSTREAM_URL", async () => {
    process.env.FIRMWARE_UPSTREAM_URL = "https://cdn.example/fw/";
    const fetchMock = vi.fn(async () => new Response("abcd", {
      status: 206,
      headers: { "content-range": "bytes 0-3/10", "content-length": "4" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await app.request("/fw/releases/1.3.0/stepwhere.ota", { headers: { range: "bytes=0-3" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(await response.text()).toBe("abcd");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example/fw/releases/1.3.0/stepwhere.ota",
      expect.objectContaining({ headers: { range: "bytes=0-3" } }),
    );
  });

  it("maps upstream 403 (missing S3 key) to 404", async () => {
    process.env.FIRMWARE_UPSTREAM_URL = "https://cdn.example/fw";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    expect((await app.request("/fw/devices/861234567890123.json")).status).toBe(404);
  });

  it("validates paths and ranges", () => {
    expect(firmwarePathAllowed("manifest.json")).toBe(true);
    expect(firmwarePathAllowed("devices/861234567890123.json")).toBe(true);
    expect(firmwarePathAllowed("releases/2.1.0/stepwhere.ota")).toBe(true);
    expect(firmwarePathAllowed("releases/../../etc/passwd")).toBe(false);
    expect(parseRange("bytes=0-99", 50)).toEqual({ start: 0, end: 49 });
    expect(parseRange("bytes=-10", 50)).toEqual({ start: 40, end: 49 });
    expect(parseRange("bytes=60-", 50)).toBe("invalid");
    expect(parseRange(undefined, 50)).toBeNull();
  });
});
