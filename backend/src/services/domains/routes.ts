import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth/auth.js";
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
  dnsInstructionsResponseSchema,
  domainAttachmentResponseSchema,
  resumeDomainResponseSchema,
} from "./schemas.js";
import {
  listDomains,
  getDomainById,
  createDomain,
  updateDomain,
  deleteDomain,
  listCertificates,
  createCertificate,
  deleteCertificate,
  DomainsError,
} from "./domain/domains.js";
import { validateDomainName } from "./domain/validation.js";
import { appendApexAck, removeApexAck } from "./domain/apex-ack.js";
import { existingRecordAdvisory } from "./domain/dns-advisory.js";
import { resolveStaticCloud } from "./domain/static/cloud.js";
import { isApexDomain, apexRefusalMessage } from "./domain/static/apex.js";
import {
  applyDomainConfig,
  verifyDomainDns,
  previewDomainConfig,
  getDomainDnsInstructions,
  getDomainAttachment,
} from "./domain/applier.js";
import { tenantRateLimit } from "../../shared/http/rate-limit.js";
import { resumeDomainAttachment } from "./domain/resume.js";
import { enqueueDomainApply, enqueueCertificateIssue } from "./domain/worker.js";

export async function registerDomainsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Domains ───

  typed.get(
    "/projects/:projectId/domains",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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

      const validated = validateDomainName(request.body.name);
      if (!validated.ok) {
        throw new DomainsError(validated.message, "bad_request");
      }
      const name = validated.name;
      const projectId = request.params.projectId;

      // Refuse an un-acknowledged apex HERE, at the moment of input, rather
      // than letting the add succeed and the DNS instruction later tell the
      // user to publish a record their provider will reject.
      const { cloud, routeTarget, apexAliasAck } = await resolveStaticCloud(
        projectId,
        auth.tenantId,
      );
      const isApex = isApexDomain(name);
      // The body is read FIRST: on a first add the stored list is always empty.
      const acked = request.body.apexAliasAck === true || apexAliasAck.includes(name);

      if (cloud === "aws" && isApex && !acked) {
        throw new DomainsError(apexRefusalMessage(name, "add-form"), "bad_request", undefined, {
          clientCode: "apex_requires_ack",
        });
      }

      // Persisted BEFORE the domain row, never after: the reverse order leaves
      // a window in which a reconcile refuses a domain the user just
      // acknowledged and writes a confusing message onto it.
      if (cloud === "aws" && isApex && request.body.apexAliasAck === true) {
        const stored = await appendApexAck(auth.tenantId, projectId, name);
        if (!stored) {
          throw new DomainsError(
            "Could not save your DNS provider confirmation, so the domain was not added. Try again.",
            "internal",
          );
        }
      }

      const domain = await createDomain({
        tenantId: auth.tenantId,
        projectId,
        // The normalized form, so `WWW.Example.com.` and `www.example.com`
        // cannot both be stored as separate domains.
        name,
      });
      await enqueueDomainApply(auth.tenantId, projectId);

      // Advisory, never blocking: the domain is already created by this point.
      const warning = await existingRecordAdvisory(name, routeTarget);
      return warning ? { ...domain, warning } : domain;
    },
  );

  typed.patch(
    "/projects/:projectId/domains/:domainId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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

      // Read the name before deleting, so the apex acknowledgement can be
      // pruned. Best-effort: a failed read must not block the delete.
      let removedName: string | null = null;
      try {
        const existing = await getDomainById({
          tenantId: auth.tenantId,
          projectId: request.params.projectId,
          domainId: request.params.domainId,
        });
        removedName = existing?.name ?? null;
      } catch {
        removedName = null;
      }

      await deleteDomain({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
      });

      // Prune the acknowledgement so delete-and-re-add refuses again and shows
      // the explanation. Best-effort by design: a stale entry is a worse
      // outcome than a failed prune, but neither justifies failing the delete.
      if (removedName) {
        await removeApexAck(auth.tenantId, request.params.projectId, removedName);
      }

      await enqueueDomainApply(auth.tenantId, request.params.projectId);
      return { success: true as const };
    },
  );

  // ─── SSL Certificates ───

  typed.get(
    "/projects/:projectId/certificates",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
      const domain = await getDomainById({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
      });
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

  // ─── Attachment progress ───

  typed.get(
    "/projects/:projectId/domains/attachment",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "Staged attachment progress for every domain on a project",
        params: z.object({ projectId: z.uuid() }),
        response: { 200: domainAttachmentResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await getDomainAttachment({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );

  const requireManage = app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE);
  const resumeRateLimit = tenantRateLimit({
    max: 10,
    windowMs: 60_000,
    prefix: "domain-resume",
  });

  typed.post(
    "/projects/:projectId/domains/:domainId/resume",
    {
      // Composed into one hook because the typed-route helper takes a single
      // preHandler. The ORDER matters: tenantRateLimit keys on
      // `request.auth?.tenantId`, so it must run after the permission check
      // has populated auth, or every caller would share one anonymous bucket.
      preHandler: async (request, reply) => {
        // `requireProjectPermission` returns an array of hooks, so they are
        // run in sequence here.
        for (const hook of requireManage) {
          await hook.call(app, request, reply);
          if (reply.sent) return;
        }
        await resumeRateLimit(request, reply);
      },
      schema: {
        tags: ["domains"],
        summary: "Retry a stalled or failed domain attachment",
        params: z.object({ projectId: z.uuid(), domainId: z.uuid() }),
        response: { 200: resumeDomainResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await resumeDomainAttachment({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
      });
    },
  );

  // ─── DNS Instructions ───
  typed.get(
    "/projects/:projectId/domains/:domainId/dns-instructions",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["domains"],
        summary: "The DNS records a user must publish for a domain",
        params: z.object({
          projectId: z.uuid(),
          domainId: z.uuid(),
        }),
        response: { 200: dnsInstructionsResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const domain = await getDomainById({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        domainId: request.params.domainId,
      });
      if (!domain) {
        return { supported: false as const, records: [], note: "", message: "Domain not found." };
      }
      return await getDomainDnsInstructions({
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
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
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
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
