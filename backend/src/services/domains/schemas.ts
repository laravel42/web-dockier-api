import { z } from "zod";

// ─── Domains ───

export const domainSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  name: z.string(),
  isPrimary: z.boolean(),
  redirectWww: z.boolean(),
  wildcard: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createDomainBodySchema = z.object({
  name: z.string().min(1).max(253).regex(
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Invalid domain name format",
  ),
});

export const updateDomainBodySchema = z.object({
  isPrimary: z.boolean().optional(),
  redirectWww: z.boolean().optional(),
  wildcard: z.boolean().optional(),
});

// ─── SSL Certificates ───

/** The DNS record a user must publish to validate a certificate. */
export const dnsValidationRecordSchema = z.object({
  name: z.string(),
  type: z.string(),
  value: z.string(),
});

/**
 * Where a certificate is in its provider handshake. Distinct from `status`,
 * which answers "is there a usable certificate"; this answers "what is the user
 * waiting for, and is it their turn to act".
 */
export const certVerificationStateSchema = z.enum([
  "pending",
  "awaiting_dns",
  "provisioning",
  "attaching",
  "live",
  "failed",
  "timed_out",
]);

export const sslCertificateSchema = z.object({
  id: z.uuid(),
  projectId: z.string(),
  domainId: z.uuid().nullable(),
  // `acm` and `gcp_managed` are issued and renewed by the cloud provider for
  // static-hosting deployments; they are never requested by a client.
  type: z.enum(["lets_encrypt", "custom", "clone", "acm", "gcp_managed"]),
  status: z.enum(["pending", "active", "expired", "failed"]),
  domainName: z.string(),
  expiresAt: z.string().nullable(),
  issuedAt: z.string().nullable(),
  providerRef: z.string().nullable().optional(),
  validationRecord: dnsValidationRecordSchema.nullable().optional(),
  verificationState: certVerificationStateSchema.optional(),
  verificationMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCertificateBodySchema = z.object({
  // Deliberately NOT widened: the two platform-owned types are issued by the
  // provider, so a client must not be able to create one.
  type: z.enum(["lets_encrypt", "custom", "clone"]),
  domainName: z.string().min(1).max(253).regex(
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Invalid domain name format",
  ),
});

// ─── Response Schemas ───

export const verifyDnsResponseSchema = z.object({
  verified: z.boolean(),
  serverIp: z.string().optional(),
  resolvedIp: z.string().optional(),
  message: z.string(),
});

export const configPreviewResponseSchema = z.object({
  generatedConfig: z.string(),
});

export const applyDomainResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  generatedConfig: z.string().optional(),
});

/**
 * The DNS records a user must publish for one domain.
 *
 * Served fresh rather than stored: the CNAME target and validation record come
 * from the live CDN and certificate, and a cached copy would go stale the
 * moment a distribution is recreated.
 */
export const dnsInstructionsResponseSchema = z.object({
  /** false when this deployment type has no DNS instructions to give. */
  supported: z.boolean(),
  domainName: z.string().optional(),
  records: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      value: z.string(),
      purpose: z.string(),
    }),
  ),
  note: z.string(),
  /** Set when `supported` is false, explaining why. */
  message: z.string().optional(),
});

// ─── DB Row Types ───

import type { TableRow } from "../../shared/supabase/types.js";

export type DomainRow = TableRow<"domains">;

export type SslCertificateRow = TableRow<"ssl_certificates">;
