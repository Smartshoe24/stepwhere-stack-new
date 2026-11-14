import { open, stat } from "node:fs/promises";
import path from "node:path";

import type { Context } from "hono";

/*
 * OTA firmware downloads for trackers (Smartshoe24/Stepwhere-Firmware, ota.ino).
 *
 *   GET /fw/manifest.json                      newest release
 *   GET /fw/devices/<hardwareIdentifier>.json  per-device override (optional)
 *   GET /fw/releases/<x.y.z>/stepwhere.ota     signed image, byte ranges
 *   GET /fw/releases/<x.y.z>/stepwhere.ota?enc=hex
 *                                              same bytes as lowercase hex text
 *
 * Devices fetch over plain HTTP; images are ECDSA-signed and verified on the
 * device, so this route never has to be trusted for integrity.
 *
 * ?enc=hex: the N706B modem passes text replies to the tracker but drops
 * binary ones (live probe: manifest with Range -> 206 OK, image -> no data).
 * Range and Content-Range stay in bytes of the image; the body is the hex of
 * those bytes (2 characters per byte, text/plain).
 *
 * Source, first match wins:
 *   FIRMWARE_UPSTREAM_URL  base URL (e.g. the CloudFront/S3 bucket): proxied,
 *                          Range forwarded
 *   FIRMWARE_DIR           local directory with the same layout (default
 *                          /srv/firmware), served with Range support
 */

const ALLOWED = [
  /^manifest\.json$/,
  /^devices\/[A-Za-z0-9_-]{1,64}\.json$/,
  /^releases\/\d{1,3}\.\d{1,3}\.\d{1,3}\/stepwhere\.ota$/,
];

const UPSTREAM_TIMEOUT_MS = 15_000;

export function firmwarePathAllowed(relative: string): boolean {
  return ALLOWED.some((pattern) => pattern.test(relative));
}

function contentType(relative: string) {
  return relative.endsWith(".json") ? "application/json" : "application/octet-stream";
}

function cacheControl(relative: string) {
  return relative.startsWith("releases/")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=60";
}

export type ByteRange = { start: number; end: number };

/** Parses a single "bytes=a-b" / "bytes=a-" / "bytes=-n" range. */
export function parseRange(header: string | undefined, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

async function serveFromDirectory(c: Context, dir: string, relative: string) {
  const file = path.join(dir, relative);
  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) return c.json({ code: "NOT_FOUND" }, 404);
    size = info.size;
  } catch {
    return c.json({ code: "NOT_FOUND" }, 404);
  }

  const range = parseRange(c.req.header("range"), size);
  const headers: Record<string, string> = {
    "content-type": contentType(relative),
    "cache-control": cacheControl(relative),
    "accept-ranges": "bytes",
  };
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  const length = end - start + 1;
  headers["content-length"] = String(length);
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  const status = range ? 206 : 200;

  if (c.req.method === "HEAD" || length === 0) return new Response(null, { status, headers });
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return new Response(buffer, { status, headers });
  } finally {
    await handle.close();
  }
}

async function serveFromUpstream(c: Context, base: string, relative: string) {
  const headers: Record<string, string> = {};
  const range = c.req.header("range");
  if (range) headers.range = range;
  const upstream = await fetch(`${base.replace(/\/+$/, "")}/${relative}`, {
    method: c.req.method === "HEAD" ? "HEAD" : "GET",
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  // S3 answers a missing key with 403 when listing is not allowed.
  if (upstream.status === 403 || upstream.status === 404) return c.json({ code: "NOT_FOUND" }, 404);
  const out: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") ?? contentType(relative),
    "cache-control": upstream.headers.get("cache-control") ?? cacheControl(relative),
    "accept-ranges": "bytes",
  };
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) out[name] = value;
  }
  const body = c.req.method === "HEAD" ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: out });
}

/** Re-encodes a successful image reply as hex text (see ?enc=hex above). */
async function toHex(response: Response) {
  if (response.status !== 200 && response.status !== 206) return response;
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/plain");
  if (!response.body) {   // HEAD
    const length = headers.get("content-length");
    if (length) headers.set("content-length", String(Number(length) * 2));
    return new Response(null, { status: response.status, headers });
  }
  const hex = Buffer.from(await response.arrayBuffer()).toString("hex");
  headers.set("content-length", String(hex.length));
  return new Response(hex, { status: response.status, headers });
}

export async function handleFirmware(c: Context) {
  const relative = c.req.path.replace(/^\/fw\//, "");
  const startedAt = Date.now();
  if (!firmwarePathAllowed(relative)) return c.json({ code: "NOT_FOUND" }, 404);
  const encoding = c.req.query("enc");
  if (encoding !== undefined && (encoding !== "hex" || !relative.startsWith("releases/"))) {
    return c.json({ code: "NOT_FOUND" }, 404);
  }

  const upstream = process.env.FIRMWARE_UPSTREAM_URL;
  let response: Response;
  try {
    response = upstream
      ? await serveFromUpstream(c, upstream, relative)
      : await serveFromDirectory(c, process.env.FIRMWARE_DIR ?? "/srv/firmware", relative);
    if (encoding === "hex") response = await toHex(response);
  } catch (error) {
    console.error("[device-ingest-proxy] firmware request failed", {
      path: c.req.path,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return c.json({ code: "FIRMWARE_UNAVAILABLE" }, 502);
  }
  console.info("[device-ingest-proxy] firmware request", {
    method: c.req.method,
    path: c.req.path,
    encoding: encoding ?? null,
    range: c.req.header("range") ?? null,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return response;
}
