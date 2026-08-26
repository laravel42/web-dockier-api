import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { tenantRateLimit } from "../../../shared/http/rate-limit.js";
import { dockerfilePreviewRequestSchema, dockerfilePreviewResponseSchema } from "../schemas.js";
import { previewDockerfile } from "../domain/dockerfile-preview.js";

export async function registerDockerfilePreviewRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/deploy/dockerfile/preview",
    {
      preHandler: [
        app.requirePermission(PERMISSIONS.DEPLOY_CREATE),
        // Cloning is heavy; cap how often a tenant can trigger a preview.
        tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "dockerfile-preview" }),
      ],
      // Clone (shallow, up to 120s) plus the AI review (up to 20s). Give headroom.
      handlerTimeout: 150_000,
      schema: {
        tags: ["deploy"],
        summary: "Preview the Dockerfile and AI review for a repo before deploying",
        body: dockerfilePreviewRequestSchema,
        response: { 200: dockerfilePreviewResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await previewDockerfile({
        tenantId: auth.tenantId,
        gitConnectionId: request.body.gitConnectionId,
        repo: request.body.repo,
        branch: request.body.branch,
        projectId: request.body.projectId,
        useRepoDockerfile: request.body.useRepoDockerfile,
      });
    },
  );
}
