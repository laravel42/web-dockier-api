/**
 * Project Tags Routes
 *
 * CRUD for organization-level tags and per-project tag assignments.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { tagResponseSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  listTags,
  listTagsWithCounts,
  createTag,
  updateTag,
  deleteTag,
  getProjectTags,
  setProjectTags,
} from "../domain/tags.js";

export async function registerTagRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/projects/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "List all organization tags",
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await listTags(auth.tenantId);
      return { tags };
    },
  );

  typed.get(
    "/projects/tags/manage",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "List all organization tags with project counts",
        response: {
          200: z.object({
            tags: z.array(tagResponseSchema.extend({ projectCount: z.number() })),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await listTagsWithCounts(auth.tenantId);
      return { tags };
    },
  );

  typed.post(
    "/projects/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Create a tag",
        body: z.object({
          name: z.string().min(1).max(50),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        }),
        response: { 200: tagResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createTag({
        tenantId: auth.tenantId,
        name: request.body.name,
        color: request.body.color,
      });
    },
  );

  typed.put(
    "/projects/tags/:tagId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Update a tag",
        params: z.object({ tagId: z.uuid() }),
        body: z.object({
          name: z.string().min(1).max(50).optional(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        }),
        response: { 200: tagResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateTag({
        tenantId: auth.tenantId,
        tagId: request.params.tagId,
        name: request.body.name,
        color: request.body.color,
      });
    },
  );

  typed.delete(
    "/projects/tags/:tagId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Delete a tag",
        params: z.object({ tagId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteTag({ tenantId: auth.tenantId, tagId: request.params.tagId });
      return { success: true as const };
    },
  );

  typed.get(
    "/projects/:projectId/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["projects"],
        summary: "Get tags assigned to a project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await getProjectTags({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { tags };
    },
  );

  typed.put(
    "/projects/:projectId/tags",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["projects"],
        summary: "Set tags for a project (replaces all)",
        params: z.object({ projectId: z.uuid() }),
        body: z.object({
          tagIds: z.array(z.uuid()).max(20),
        }),
        response: { 200: z.object({ tags: z.array(tagResponseSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const tags = await setProjectTags({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        tagIds: request.body.tagIds,
      });
      return { tags };
    },
  );
}
