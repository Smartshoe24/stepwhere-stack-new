import type { MiddlewareHandler } from "hono";

/**
 * Response headers the old edge Caddy added for api.stepwhere.in. Pangolin
 * (Traefik) doesn't add them, so the API sets them itself. Kept to these three
 * so CORS, WebSocket upgrades and the API reference page are unaffected.
 */
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  // Upgraded WebSocket responses have no headers worth setting (and may be
  // immutable); everything else gets the headers, including errors and 404s.
  if (c.res.status === 101) {
    return;
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    c.res.headers.set(name, value);
  }
};
