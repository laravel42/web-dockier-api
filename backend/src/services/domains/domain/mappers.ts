import type { DomainRow, SslCertificateRow } from "../schemas.js";

// ─── Response Types ────────────────────────────────────────────────

export interface DomainResponse {
  id: string;
  projectId: string;
  name: string;
  isPrimary: boolean;
  redirectWww: boolean;
  wildcard: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SslCertificateResponse {
  id: string;
  projectId: string;
  domainId: string | null;
  type: "lets_encrypt" | "custom" | "clone";
  status: "pending" | "active" | "expired" | "failed";
  domainName: string;
  expiresAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Row Mappers ───────────────────────────────────────────────────

export function rowToDomain(row: DomainRow): DomainResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    isPrimary: row.is_primary,
    redirectWww: row.redirect_www,
    wildcard: row.wildcard,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToCertificate(row: SslCertificateRow): SslCertificateResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    domainId: row.domain_id,
    type: row.type as SslCertificateResponse["type"],
    status: row.status as SslCertificateResponse["status"],
    domainName: row.domain_name,
    expiresAt: row.expires_at,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
