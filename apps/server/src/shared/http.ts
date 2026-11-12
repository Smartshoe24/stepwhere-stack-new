import type { ApiErrorDto } from "@stepwhere/types";
import type { Context } from "hono";

export function ok<T>(c: Context, data: T, status = 200) {
  return c.json({ data }, status as 200);
}

export function created<T>(c: Context, data: T) {
  return c.json({ data }, 201);
}

export function errorResponse(c: Context, status: number, error: ApiErrorDto) {
  return c.json(error, status as 400);
}
