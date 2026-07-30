import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { providerSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import { requireInternalToken } from "../../../shared/http/security.js";
import {
  createProvider,
  listProviders,
  updateProvider,
  deleteProvider,
} from "../domain/providers.js";
import { getProviderCredentials } from "../../../lib/provider-credentials.js";

export async function registerProviderRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/providers",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Add deployment provider credentials",
        body: z.object({
          provider: z.string().min(1).max(50),
          label: z.string().min(1).max(100),
          apiKey: z.string().min(1).max(500),
          apiSecret: z.string().min(1).max(500),
          region: z.string().max(50).optional(),
        }),
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createProvider({
        tenantId: auth.tenantId,
        provider: request.body.provider,
        label: request.body.label,
        apiKey: request.body.apiKey,
        apiSecret: request.body.apiSecret,
        region: request.body.region,
      });
    },
  );

  typed.get(
    "/deploy/providers",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List deployment providers",
        response: { 200: z.object({ providers: z.array(providerSchema) }) },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const providers = await listProviders(auth.tenantId);
      return { providers };
    },
  );

  typed.put(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Update provider label or secret",
        params: z.object({ providerId: z.uuid() }),
        body: z.object({ label: z.string().max(100).optional(), apiSecret: z.string().max(500).optional() }),
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await updateProvider({
        providerId: request.params.providerId,
        tenantId: auth.tenantId,
        label: request.body.label,
        apiSecret: request.body.apiSecret,
      });
    },
  );

  typed.delete(
    "/deploy/providers/:providerId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Delete provider and dependent deployments",
        params: z.object({ providerId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteProvider(request.params.providerId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.get(
    "/deploy/providers/:providerId/credentials",
    {
      preHandler: requireInternalToken,
      schema: {
        tags: ["deploy"],
        summary: "Get provider credentials (service-to-service)",
        params: z.object({ providerId: z.uuid() }),
        response: {
          200: z.object({
            provider: z.string(),
            region: z.string(),
            apiKey: z.string(),
            apiSecret: z.string(),
          }),
        },
      },
    },
    async (request) => {
      return await getProviderCredentials(request.params.providerId);
    },
  );
}
