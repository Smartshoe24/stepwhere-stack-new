import { eq } from "drizzle-orm";
import { createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "../../app-types";
import { db } from "../../db/client";
import { cmsPages, feedbackSubmissions } from "../../db/schema";
import { createOpenApiApp } from "../../openapi/create-app";
import { errorResponses, jsonDataResponse } from "../../openapi/responses";
import { CmsPageSchema, FeedbackSubmissionResultSchema } from "../../openapi/schemas";
import { bearerSecurity } from "../../openapi/security";
import { notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";

const slugSchema = z.object({
  slug: z.string().trim().min(1).openapi({
    param: {
      name: "slug",
      in: "path",
    },
  }),
});

const feedbackSchema = z.object({
  name: z.string().trim().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phoneNumber: z.string().trim().nullable().optional(),
  message: z.string().trim().min(1),
});

const listCmsPagesRoute = createRoute({
  method: "get",
  path: "/cms-pages",
  tags: ["CMS"],
  security: bearerSecurity,
  responses: {
    200: jsonDataResponse(z.array(CmsPageSchema), "Public CMS pages."),
    ...errorResponses([401]),
  },
});

const getCmsPageRoute = createRoute({
  method: "get",
  path: "/cms-pages/{slug}",
  tags: ["CMS"],
  security: bearerSecurity,
  request: {
    params: slugSchema,
  },
  responses: {
    200: jsonDataResponse(CmsPageSchema, "CMS page."),
    ...errorResponses([400, 401, 404]),
  },
});

const submitFeedbackRoute = createRoute({
  method: "post",
  path: "/feedback",
  tags: ["CMS"],
  security: bearerSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: feedbackSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: jsonDataResponse(FeedbackSubmissionResultSchema, "Feedback submitted."),
    ...errorResponses([400, 401]),
  },
});

const cmsRoutes = createOpenApiApp();

cmsRoutes.openapi(listCmsPagesRoute, async (c) => {
  const rows = await db.select().from(cmsPages).where(eq(cmsPages.status, "active")).orderBy(cmsPages.slug);
  return ok(c, rows.map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    body: page.body,
    status: page.status,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  })));
});

cmsRoutes.openapi(getCmsPageRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const [page] = await db
    .select()
    .from(cmsPages)
    .where(eq(cmsPages.slug, slug))
    .limit(1);

  if (!page || page.status !== "active") {
    throw notFound("NOT_FOUND", "CMS page not found.");
  }

  return ok(c, {
    id: page.id,
    slug: page.slug,
    title: page.title,
    body: page.body,
    status: page.status,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  });
});

cmsRoutes.openapi(submitFeedbackRoute, async (c) => {
  const body = c.req.valid("json");
  const [submission] = await db.insert(feedbackSubmissions).values(body).returning();
  return created(c, {
    id: submission.id,
    createdAt: submission.createdAt.toISOString(),
  });
});

export { cmsRoutes };
