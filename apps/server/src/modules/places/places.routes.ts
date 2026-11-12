import { createRoute, z } from "@hono/zod-openapi";

import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import {
  AddressPlaceSuggestionSchema,
  PlaceSchema,
  ResolvedAddressSchema,
  SchoolPlaceSuggestionSchema,
} from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { ok } from "../../shared/http";
import {
  resolveAddressPlace,
  resolveSchoolPlace,
  searchAddressPlaces,
  searchSchoolPlaces,
} from "./places.service";

const autocompleteSchoolPlacesRoute = createRoute({
  method: "get",
  path: "/places/schools/autocomplete",
  tags: ["Places"],
  security: bearerSecurity,
  request: {
    query: z.object({
      query: z.string().trim().min(1),
      sessionToken: z.string().trim().min(1).optional(),
    }),
  },
  responses: {
    200: jsonDataResponse(z.array(SchoolPlaceSuggestionSchema), "School place suggestions."),
    ...errorResponses([400, 401, 409]),
  },
});

const resolveSchoolPlaceRoute = createRoute({
  method: "post",
  path: "/places/schools/resolve",
  tags: ["Places"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            providerPlaceId: z.string().trim().min(1),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(PlaceSchema, "Resolved school place."),
    ...errorResponses([400, 401, 409]),
  },
});

const autocompleteAddressPlacesRoute = createRoute({
  method: "get",
  path: "/places/addresses/autocomplete",
  tags: ["Places"],
  security: bearerSecurity,
  request: {
    query: z.object({
      query: z.string().trim().min(1),
      sessionToken: z.string().trim().min(1).optional(),
    }),
  },
  responses: {
    200: jsonDataResponse(z.array(AddressPlaceSuggestionSchema), "Address suggestions."),
    ...errorResponses([400, 401, 409]),
  },
});

const resolveAddressPlaceRoute = createRoute({
  method: "post",
  path: "/places/addresses/resolve",
  tags: ["Places"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            providerPlaceId: z.string().trim().min(1),
            sessionToken: z.string().trim().min(1).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonDataResponse(ResolvedAddressSchema, "Resolved address."),
    ...errorResponses([400, 401, 409]),
  },
});

const placesRoutes = createOpenApiApp();

placesRoutes.openapi(autocompleteSchoolPlacesRoute, async (c) => {
  const { query, sessionToken } = c.req.valid("query");
  return ok(c, await searchSchoolPlaces(query, sessionToken));
});

placesRoutes.openapi(resolveSchoolPlaceRoute, async (c) => {
  const { providerPlaceId } = c.req.valid("json");
  return ok(c, await resolveSchoolPlace(providerPlaceId));
});

placesRoutes.openapi(autocompleteAddressPlacesRoute, async (c) => {
  const { query, sessionToken } = c.req.valid("query");
  return ok(c, await searchAddressPlaces(query, sessionToken));
});

placesRoutes.openapi(resolveAddressPlaceRoute, async (c) => {
  const { providerPlaceId, sessionToken } = c.req.valid("json");
  return ok(c, await resolveAddressPlace(providerPlaceId, sessionToken));
});

export { placesRoutes };
