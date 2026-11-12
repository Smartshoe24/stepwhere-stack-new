import { z } from "@hono/zod-openapi";
import type { ZodTypeAny } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
}).openapi("ApiError");

export function dataEnvelopeSchema(schema: ZodTypeAny) {
  return z.object({
    data: schema,
  });
}

export function jsonDataResponse(schema: ZodTypeAny, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: dataEnvelopeSchema(schema),
      },
    },
  };
}

export function jsonResponse(schema: ZodTypeAny, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

export function errorResponses(statuses: number[]) {
  return Object.fromEntries(statuses.map((status) => [
    status,
    jsonResponse(ApiErrorSchema, toErrorDescription(status)),
  ]));
}

function toErrorDescription(status: number) {
  switch (status) {
    case 400:
      return "Bad request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not found";
    case 409:
      return "Conflict";
    case 410:
      return "Gone";
    case 429:
      return "Too many requests";
    case 500:
      return "Internal server error";
    case 503:
      return "Service unavailable";
    default:
      return "Error";
  }
}
