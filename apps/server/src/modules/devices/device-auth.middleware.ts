import type { MiddlewareHandler } from "hono";

import { authenticateDeviceToken } from "./devices.service";
import { unauthorized } from "../../shared/errors";

export const deviceAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");

  if (!header?.startsWith("Device ")) {
    throw unauthorized("Device authorization header is required.");
  }

  const token = header.slice("Device ".length).trim();

  if (!token) {
    throw unauthorized("Device authorization token is required.");
  }

  const device = await authenticateDeviceToken(token);
  c.set("device", device);

  await next();
};
