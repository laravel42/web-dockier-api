import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema } from "../../../shared/schemas/responses.js";
import { listSshKeys, createSshKey, deleteSshKey } from "../domain/ssh-keys.js";

export async function registerSshKeyRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/deploy/ssh-keys",
    {
      preHandler: app.requirePermission(PERMISSIONS.DEPLOY_VIEW),
      schema: {
        tags: ["deploy"],
        summary: "List SSH keys",
        response: {
          200: z.object({
            keys: z.array(
              z.object({
                id: z.uuid(),
                label: z.string(),
                publicKey: z.string(),
                fingerprint: z.string(),
                createdAt: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const keys = await listSshKeys(auth.tenantId);
      return { keys };
    },
  );

  typed.post(
    "/deploy/ssh-keys",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Add SSH key",
        body: z.object({ label: z.string().min(1), publicKey: z.string().min(1) }),
        response: {
          200: z.object({
            id: z.uuid(),
            label: z.string(),
            publicKey: z.string(),
            fingerprint: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createSshKey({
        tenantId: auth.tenantId,
        label: request.body.label,
        publicKey: request.body.publicKey,
      });
    },
  );

  typed.delete(
    "/deploy/ssh-keys/:keyId",
    {
      preHandler: app.requirePermission(PERMISSIONS.CREDENTIAL_MANAGE),
      schema: {
        tags: ["deploy"],
        summary: "Delete SSH key",
        params: z.object({ keyId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteSshKey(request.params.keyId, auth.tenantId);
      return { success: true as const };
    },
  );
}
