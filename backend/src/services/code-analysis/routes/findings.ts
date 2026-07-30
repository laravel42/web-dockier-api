import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { findingSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { paginationQuerySchema } from "../../../shared/schemas/responses.js";
import { listFindings } from "../domain/findings.js";

export async function registerFindingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/code-analysis/scans/:scanId/findings",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List scan findings",
        params: z.object({ scanId: z.uuid() }),
        querystring: paginationQuerySchema.extend({
          severity: z.string().optional(),
          provider: z.enum(["semgrep", "sonar", "custom"]).optional(),
        }),
        response: {
          200: z.object({
            findings: z.array(findingSchema),
            total: z.number().int().nonnegative(),
            hasMore: z.boolean(),
            counts: z.object({
              total: z.number().int().nonnegative(),
              errors: z.number().int().nonnegative(),
              warnings: z.number().int().nonnegative(),
              infos: z.number().int().nonnegative(),
              semgrep: z.number().int().nonnegative(),
              sonar: z.number().int().nonnegative(),
              custom: z.number().int().nonnegative(),
              byProvider: z.object({
                semgrep: z.object({
                  total: z.number().int().nonnegative(),
                  errors: z.number().int().nonnegative(),
                  warnings: z.number().int().nonnegative(),
                  infos: z.number().int().nonnegative(),
                }),
                sonar: z.object({
                  total: z.number().int().nonnegative(),
                  errors: z.number().int().nonnegative(),
                  warnings: z.number().int().nonnegative(),
                  infos: z.number().int().nonnegative(),
                }),
                custom: z.object({
                  total: z.number().int().nonnegative(),
                  errors: z.number().int().nonnegative(),
                  warnings: z.number().int().nonnegative(),
                  infos: z.number().int().nonnegative(),
                }),
              }),
            }),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await listFindings({
        scanId: request.params.scanId,
        tenantId: auth.tenantId,
        severity: request.query.severity,
        provider: request.query.provider,
        limit: request.query.limit,
        offset: request.query.offset,
      });
    },
  );
}
