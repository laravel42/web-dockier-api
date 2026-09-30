import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { providerSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import {
  createProvider,
  listProviders,
  updateProvider,
  deleteProvider,
} from "../domain/providers.js";

// ─── Per-provider credential request shapes ────────────────────────
// Credential fields differ per provider, so the request body is a union
// discriminated on `provider`. AWS takes an access key id + secret access key;
// GCP takes a single service-account JSON key string.

const awsCreateSchema = z.object({
  provider: z.literal("aws"),
  label: z.string().min(1).max(100),
  accessKeyId: z.string().min(1).max(500),
  secretAccessKey: z.string().min(1).max(500),
  region: z.string().max(50).optional(),
});

const gcpCreateSchema = z.object({
  provider: z.literal("gcp"),
  label: z.string().min(1).max(100),
  // A service-account JSON key is large; allow up to 8KB.
  serviceAccountKey: z.string().min(1).max(8192),
  region: z.string().max(50).optional(),
});

const createProviderSchema = z.discriminatedUnion("provider", [awsCreateSchema, gcpCreateSchema]);

const awsUpdateSchema = z.object({
  provider: z.literal("aws"),
  label: z.string().max(100).optional(),
  accessKeyId: z.string().max(500).optional(),
  secretAccessKey: z.string().max(500).optional(),
});

const gcpUpdateSchema = z.object({
  provider: z.literal("gcp"),
  label: z.string().max(100).optional(),
  serviceAccountKey: z.string().max(8192).optional(),
});

const updateProviderSchema = z.discriminatedUnion("provider", [awsUpdateSchema, gcpUpdateSchema]);

export async function registerProviderRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/providers",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Add deployment provider credentials",
        body: createProviderSchema,
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const body = request.body;
      return await createProvider({
        tenantId: auth.tenantId,
        provider: body.provider,
        label: body.label,
        credentials: body.provider === "aws"
          ? { accessKeyId: body.accessKeyId, secretAccessKey: body.secretAccessKey }
          : { serviceAccountKey: body.serviceAccountKey },
        region: body.region,
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
        summary: "Update provider label or credentials",
        params: z.object({ providerId: z.uuid() }),
        body: updateProviderSchema,
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const body = request.body;
      // Only forward credential fields the caller actually supplied; the domain
      // layer merges them over the existing credential so blank fields are kept.
      const credentials = body.provider === "aws"
        ? { accessKeyId: body.accessKeyId, secretAccessKey: body.secretAccessKey }
        : { serviceAccountKey: body.serviceAccountKey };
      const hasCredentialUpdate = Object.values(credentials).some((v) => v !== undefined);
      return await updateProvider({
        providerId: request.params.providerId,
        tenantId: auth.tenantId,
        label: body.label,
        credentials: hasCredentialUpdate ? credentials : undefined,
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

  // REMOVED: GET /deploy/providers/:providerId/credentials
  //
  // Returned a tenant's raw AWS access key id and secret access key looked up by
  // providerId alone, with no organization_id filter — so any caller past the
  // pre-handler could enumerate provider ids and read any tenant's cloud
  // credentials. It had zero callers: all 29 credential resolutions happen
  // in-process via getProviderCredentials / getProviderCredentialsSafe.
  // Deleted rather than tenant-scoped, since there is no consumer to scope it
  // for. Do not reintroduce an HTTP endpoint that returns a secret.
}
