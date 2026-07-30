/**
 * Billing Routes
 *
 * Handles organization billing details retrieval and update.
 */

import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { billingDetailsSchema, billingDetailsInputSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { getBillingDetails, updateBillingDetails } from "../domain/billing.js";

export async function registerBillingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/auth/billing",
    {
      preHandler: app.requirePermission(PERMISSIONS.BILLING_VIEW),
      schema: {
        tags: ["auth"],
        summary: "Get organization billing details",
        response: { 200: billingDetailsSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getBillingDetails(auth.tenantId);
    },
  );

  typed.put(
    "/auth/billing",
    {
      preHandler: app.requirePermission(PERMISSIONS.BILLING_MANAGE),
      schema: {
        tags: ["auth"],
        summary: "Update organization billing details",
        body: billingDetailsInputSchema,
        response: { 200: billingDetailsSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateBillingDetails(auth.tenantId, request.body);
    },
  );
}
