import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../../shared/auth/auth.js";
import { scanSchema } from "../schemas.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";
import { successResponseSchema, paginationQuerySchema, paginationMetaSchema, paginatedResponse } from "../../../shared/schemas/responses.js";
import { tenantRateLimit } from "../../../shared/http/rate-limit.js";
import { createScan, listScans, getScan, deleteScan, runScan } from "../domain/scans.js";

export async function registerScanRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/code-analysis/scans",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_RUN), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "scan-create" })],
      handlerTimeout: 45_000,
      schema: {
        tags: ["code-analysis"],
        summary: "Create scan",
        body: z.object({
          projectId: z.uuid(),
          connectionId: z.uuid(),
          repo: z.string(),
          branch: z.string(),
        }),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await createScan({
        tenantId: auth.tenantId,
        projectId: request.body.projectId,
        connectionId: request.body.connectionId,
        repo: request.body.repo,
        branch: request.body.branch,
      });
    },
  );

  typed.get(
    "/code-analysis/scans",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "List scans",
        querystring: paginationQuerySchema.extend({
          projectId: z.string().optional(),
          branch: z.string().optional(),
        }),
        response: {
          200: z.object({
            scans: z.array(scanSchema),
            pagination: paginationMetaSchema,
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { limit, offset } = request.query;
      const result = await listScans({
        tenantId: auth.tenantId,
        projectId: request.query.projectId,
        branch: request.query.branch,
        limit,
        offset,
      });
      return paginatedResponse("scans", result.scans, result.total, limit, offset);
    },
  );

  typed.get(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_VIEW),
      schema: {
        tags: ["code-analysis"],
        summary: "Get scan",
        params: z.object({ scanId: z.uuid() }),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getScan(request.params.scanId, auth.tenantId);
    },
  );

  typed.delete(
    "/code-analysis/scans/:scanId",
    {
      preHandler: app.requirePermission(PERMISSIONS.SCAN_MANAGE),
      schema: {
        tags: ["code-analysis"],
        summary: "Delete scan",
        params: z.object({ scanId: z.uuid() }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteScan(request.params.scanId, auth.tenantId);
      return { success: true as const };
    },
  );

  typed.post(
    "/code-analysis/scans/:scanId/run",
    {
      preHandler: [app.requirePermission(PERMISSIONS.SCAN_RUN), tenantRateLimit({ max: 5, windowMs: 60_000, prefix: "scan-run" })],
      // Scan run validates the scan, updates status, and enqueues the job.
      handlerTimeout: 45_000,
      schema: {
        tags: ["code-analysis"],
        summary: "Run scan asynchronously",
        params: z.object({ scanId: z.uuid() }),
        body: z
          .object({
            enableSemgrep: z.boolean().optional(),
            enableOpengrep: z.boolean().optional(),
            enableSonarqube: z.boolean().optional(),
            enableBearer: z.boolean().optional(),
            enableCustomRules: z.boolean().optional(),
            enableSensitiveData: z.boolean().optional(),
            enableCodeql: z.boolean().optional(),
          })
          .optional(),
        response: { 200: scanSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const body = request.body ?? {};
      const enableSemgrep = body.enableOpengrep ?? body.enableSemgrep;
      const enableBearer = body.enableBearer ?? body.enableSonarqube;
      return await runScan(request.params.scanId, auth.tenantId, {
        ...body,
        enableSemgrep,
        enableBearer,
      }, request.id);
    },
  );
}
