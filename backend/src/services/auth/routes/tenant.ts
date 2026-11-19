/**
 * Tenant Routes
 *
 * Handles organization creation, switching, membership management,
 * and ownership transfer.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { authSessionSchema } from "../schemas.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
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

  // Membership add/list/remove live in the users service (/users), which checks role
  // hierarchy and owner protection. The copies that were here did neither: "adding"
  // the owner demoted them, and anyone could be added by email without consent.
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
