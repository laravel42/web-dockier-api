import { z } from "zod";

// ─── Domains ───

export const domainSchema = z.object({
  id: z.string().uuid(),
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

export const sslCertificateSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  domainId: z.string().uuid().nullable(),
  type: z.enum(["lets_encrypt", "custom", "clone"]),
  status: z.enum(["pending", "active", "expired", "failed"]),
  domainName: z.string(),
  expiresAt: z.string().nullable(),
  issuedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCertificateBodySchema = z.object({
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

// ─── DB Row Types ───

export type DomainRow = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  is_primary: boolean;
  redirect_www: boolean;
  wildcard: boolean;
  created_at: string;
  updated_at: string;
};

export type SslCertificateRow = {
  id: string;
  organization_id: string;
  project_id: string;
  domain_id: string | null;
  type: string;
  status: string;
  domain_name: string;
  expires_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};
