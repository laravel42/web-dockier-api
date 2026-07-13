import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import {
  domainSchema,
  createDomainBodySchema,
  updateDomainBodySchema,
  sslCertificateSchema,
  createCertificateBodySchema,
} from "./schemas.js";
import {
  listDomains,
  createDomain,
  updateDomain,
  deleteDomain,
  listCertificates,
  createCertificate,
  deleteCertificate,
} from "./domain/domains.js";
import { applyDomainConfig, issueCertificate, verifyDomainDns, previewDomainConfig } from "./domain/applier.js";

export async function registerDomainsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /**
   * Trigger nginx config apply in the background after domain mutations.
   * Non-blocking — the HTTP response returns immediately.
   */
  function scheduleApply(tenantId: string, projectId: string) {
    void applyDomainConfig({ tenantId, projectId }).catch(() => {
      // Failures are logged inside applyDomainConfig
    });
  }

  // ─── Domains ───

  typed.get(
    "/projects/:projectId/domains",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "List domains for a project",
        params: z.object({ projectId: z.string().min(1) }),
        response: {
          200: z.object({ domains: z.array(domainSchema) }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const domains = await listDomains({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { domains };
    },
  );

  typed.post(
    "/projects/:projectId/domains",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Add a custom domain",
        params: z.object({ projectId: z.string().min(1) }),
        body: createDomainBodySchema,
        response: { 200: domainSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const domain = await createDomain({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        name: request.body.name,
      });
      scheduleApply(auth.tenantId, request.params.projectId);
      return domain;
    },
  );

  typed.patch(
    "/projects/:projectId/domains/:domainId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Update a domain",
        params: z.object({
          projectId: z.string().min(1),
          domainId: z.string().uuid(),
        }),
        body: updateDomainBodySchema,
        response: { 200: domainSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const updated = await updateDomain({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
        isPrimary: request.body.isPrimary,
        redirectWww: request.body.redirectWww,
        wildcard: request.body.wildcard,
      });
      scheduleApply(auth.tenantId, request.params.projectId);
      return updated;
    },
  );

  typed.delete(
    "/projects/:projectId/domains/:domainId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Remove a domain",
        params: z.object({
          projectId: z.string().min(1),
          domainId: z.string().uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteDomain({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
      });
      scheduleApply(auth.tenantId, request.params.projectId);
      return { success: true as const };
    },
  );

  // ─── SSL Certificates ───

  typed.get(
    "/projects/:projectId/certificates",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "List SSL certificates for a project",
        params: z.object({ projectId: z.string().min(1) }),
        response: {
          200: z.object({ certificates: z.array(sslCertificateSchema) }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const certificates = await listCertificates({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { certificates };
    },
  );

  typed.post(
    "/projects/:projectId/certificates",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Create an SSL certificate",
        params: z.object({ projectId: z.string().min(1) }),
        body: createCertificateBodySchema,
        response: { 200: sslCertificateSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const cert = await createCertificate({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        type: request.body.type,
        domainName: request.body.domainName,
      });
      // For Let's Encrypt, trigger certificate issuance in background
      if (request.body.type === "lets_encrypt") {
        void issueCertificate({
          tenantId: auth.tenantId,
          projectId: request.params.projectId,
          certificateId: cert.id,
          domainName: request.body.domainName,
        }).catch(() => { /* logged inside */ });
      } else {
        scheduleApply(auth.tenantId, request.params.projectId);
      }
      return cert;
    },
  );

  typed.delete(
    "/projects/:projectId/certificates/:certificateId",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Delete an SSL certificate",
        params: z.object({
          projectId: z.string().min(1),
          certificateId: z.string().uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      await deleteCertificate({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        certificateId: request.params.certificateId,
      });
      scheduleApply(auth.tenantId, request.params.projectId);
      return { success: true as const };
    },
  );

  // ─── DNS Verification ───

  typed.post(
    "/projects/:projectId/domains/:domainId/verify-dns",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Verify DNS configuration for a domain",
        params: z.object({
          projectId: z.string().min(1),
          domainId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            verified: z.boolean(),
            serverIp: z.string().optional(),
            resolvedIp: z.string().optional(),
            message: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      // Get the domain name from the DB
      const domains = await listDomains({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      const domain = domains.find((d) => d.id === request.params.domainId);
      if (!domain) {
        return { verified: false, message: "Domain not found" };
      }
      return await verifyDomainDns({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainName: domain.name,
      });
    },
  );

  // ─── Manual Apply ───

  typed.get(
    "/projects/:projectId/domains/config-preview",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "Preview generated nginx domain configuration",
        params: z.object({ projectId: z.string().min(1) }),
        response: {
          200: z.object({ generatedConfig: z.string() }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await previewDomainConfig({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  typed.post(
    "/projects/:projectId/domains/apply",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["domains"],
        summary: "Apply domain configuration to the deployed server",
        params: z.object({ projectId: z.string().min(1) }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
            generatedConfig: z.string().optional(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await applyDomainConfig({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );
}
