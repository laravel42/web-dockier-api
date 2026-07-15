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
  verifyDnsResponseSchema,
  configPreviewResponseSchema,
  applyDomainResponseSchema,
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
import { applyDomainConfig, verifyDomainDns, previewDomainConfig } from "./domain/applier.js";
import { enqueueDomainApply, enqueueCertificateIssue } from "./domain/worker.js";

export async function registerDomainsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Domains ───

  typed.get(
    "/projects/:projectId/domains",
    {
      preHandler: app.requirePermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "List domains for a project",
        params: z.object({ projectId: z.uuid() }),
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
        params: z.object({ projectId: z.uuid() }),
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
      await enqueueDomainApply(auth.tenantId, request.params.projectId);
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
          projectId: z.uuid(),
          domainId: z.uuid(),
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
      await enqueueDomainApply(auth.tenantId, request.params.projectId);
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
          projectId: z.uuid(),
          domainId: z.uuid(),
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
      await enqueueDomainApply(auth.tenantId, request.params.projectId);
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
        params: z.object({ projectId: z.uuid() }),
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
        params: z.object({ projectId: z.uuid() }),
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
        await enqueueCertificateIssue({
          tenantId: auth.tenantId,
          projectId: request.params.projectId,
          certificateId: cert.id,
          domainName: request.body.domainName,
        });
      } else {
        await enqueueDomainApply(auth.tenantId, request.params.projectId);
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
          projectId: z.uuid(),
          certificateId: z.uuid(),
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
      await enqueueDomainApply(auth.tenantId, request.params.projectId);
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
          projectId: z.uuid(),
          domainId: z.uuid(),
        }),
        response: {
          200: verifyDnsResponseSchema,
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
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: configPreviewResponseSchema,
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
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: applyDomainResponseSchema,
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
