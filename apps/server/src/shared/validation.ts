import type { Context } from "hono";
import type { ZodType } from "zod";
import { ZodError } from "zod";

import { badRequest } from "./errors";

export async function parseJsonBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest("Request validation failed.", error.flatten());
    }

    throw error;
  }
}

export function parseParams<T>(c: Context, schema: ZodType<T>): T {
  try {
    return schema.parse(c.req.param());
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest("Route parameter validation failed.", error.flatten());
    }

    throw error;
  }
}

export function parseQuery<T>(c: Context, schema: ZodType<T>): T {
  try {
    return schema.parse(c.req.query());
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest("Query validation failed.", error.flatten());
    }

    throw error;
  }
}
