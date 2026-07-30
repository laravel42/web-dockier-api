/**
 * Tenant Routes
 *
 * Handles organization creation, switching, membership management,
 * and ownership transfer.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth, getResolvedAuth } from "../../../shared/auth/auth.js";
import { authSessionSchema, membershipSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  addMemberToTenant,
  removeMemberFromTenant,
  listTenantMemberships,
} from "../domain/membership.js";
import {
  createTenant,
  switchTenant,
  transferOwnership,
} from "../domain/tenant.js";

export async function registerTenantRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Create Tenant ─────────────────────────────────────────────────────────

  typed.post(
    "/auth/tenants",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "Create a new organization and make current user Primary Owner",
        body: z.object({ name: z.string().min(2).max(120) }),
        response: { 200: z.object({ tenantId: z.uuid(), slug: z.string(), session: authSessionSchema }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createTenant({ name: request.body.name, userId: auth.userId, email: auth.email });
    },
  );

  // ─── Switch Tenant ─────────────────────────────────────────────────────────

  typed.post(
    "/auth/tenants/:tenantId/switch",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["auth"],
        summary: "Switch active tenant and issue a new JWT",
        params: z.object({ tenantId: z.uuid() }),
        response: { 200: authSessionSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await switchTenant({ tenantId: request.params.tenantId, userId: auth.userId, email: auth.email });
    },
  );

  // ─── List Tenant Memberships (Admin) ───────────────────────────────────────

  typed.get(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_VIEW),
      schema: {
        tags: ["auth"],
        summary: "List tenant memberships",
        params: z.object({ tenantId: z.uuid() }),
        response: {
          200: z.object({
            memberships: z.array(
              z.object({
                id: z.uuid(),
                userId: z.uuid(),
                email: z.email(),
                name: z.string(),
                roleName: z.string(),
                isOwner: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant to view its memberships");
      }
      return { memberships: await listTenantMemberships(request.params.tenantId) };
    },
  );

  // ─── Add Member to Tenant ──────────────────────────────────────────────────

  typed.post(
    "/auth/tenants/:tenantId/memberships",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["auth"],
        summary: "Add existing user to tenant",
        params: z.object({ tenantId: z.uuid() }),
        body: z.object({
          email: z.email(),
          roleId: z.string().min(1).max(100),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }
      await addMemberToTenant({
        tenantId: auth.tenantId,
        email: request.body.email,
        roleId: request.body.roleId,
        actorHierarchyLevel: getResolvedAuth(request).hierarchyLevel,
      });
      return { success: true as const };
    },
  );

  // ─── Remove Member from Tenant ─────────────────────────────────────────────

  typed.delete(
    "/auth/tenants/:tenantId/memberships/:userId",
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: {
        tags: ["auth"],
        summary: "Remove a member from the tenant",
        params: z.object({ tenantId: z.uuid(), userId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before managing memberships");
      }
      await removeMemberFromTenant({
        tenantId: request.params.tenantId,
        targetUserId: request.params.userId,
        actorUserId: auth.userId,
      });
      return { success: true as const };
    },
  );

  // ─── Transfer Ownership ────────────────────────────────────────────────────

  typed.post(
    "/auth/tenants/:tenantId/transfer-ownership",
    {
      preHandler: app.requireOwner,
      schema: {
        tags: ["auth"],
        summary: "Transfer organization ownership to another member",
        params: z.object({ tenantId: z.uuid() }),
        body: z.object({ targetUserId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      if (auth.tenantId !== request.params.tenantId) {
        throw app.httpErrors.forbidden("Switch to the tenant before transferring ownership");
      }
      await transferOwnership({
        tenantId: request.params.tenantId,
        currentOwnerId: auth.userId,
        targetUserId: request.body.targetUserId,
      });
      return { success: true as const };
    },
  );
}
