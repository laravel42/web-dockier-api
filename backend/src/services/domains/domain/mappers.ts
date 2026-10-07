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

export type SslCertificateType = "lets_encrypt" | "custom" | "clone" | "acm" | "gcp_managed";

export type CertVerificationState =
  | "pending"
  | "awaiting_dns"
  | "provisioning"
  | "attaching"
  | "live"
  | "failed"
  | "timed_out";

/** The DNS record a user must publish to validate a certificate. */
export interface DnsValidationRecord {
  name: string;
  type: string;
  value: string;
}

export interface SslCertificateResponse {
  id: string;
  projectId: string;
  domainId: string | null;
  type: SslCertificateType;
  status: "pending" | "active" | "expired" | "failed";
  domainName: string;
  expiresAt: string | null;
  issuedAt: string | null;
  /** ACM certificate ARN, or a GCP sslCertificates self-link. */
  providerRef: string | null;
  /** For ACM: the CNAME the user must publish. Null for GCP-managed. */
  validationRecord: DnsValidationRecord | null;
  verificationState: CertVerificationState;
  verificationMessage: string | null;
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

/**
 * Narrow the jsonb `validation_record` column to the shape the API exposes.
 *
 * Returns null rather than throwing on anything unexpected: a malformed record
 * must not break listing certificates, and the UI treats null as "no record to
 * publish yet".
 */
export function toValidationRecord(value: unknown): DnsValidationRecord | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.type !== "string" || typeof r.value !== "string") {
    return null;
  }
  return { name: r.name, type: r.type, value: r.value };
}

export function rowToCertificate(row: SslCertificateRow): SslCertificateResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    domainId: row.domain_id,
    type: row.type as SslCertificateType,
    status: row.status as SslCertificateResponse["status"],
    domainName: row.domain_name,
    expiresAt: row.expires_at,
    issuedAt: row.issued_at,
    providerRef: row.provider_ref ?? null,
    validationRecord: toValidationRecord(row.validation_record),
    // Rows written before migration 0075 have no state; treat them as pending.
    verificationState: (row.verification_state as CertVerificationState) ?? "pending",
    verificationMessage: row.verification_message ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The outcome of applying a project's domain configuration.
 *
 * Declared ONCE here, and imported by every branch. It was previously written
 * out in `applier.ts`, `static/index.ts` and `dokploy-applier.ts`
 * independently, and the Dokploy copy had already drifted — it was missing
 * `retryable`, which compiled silently because the field is optional, so the
 * Dokploy path returned a result that could never carry retryability.
 */
export interface ApplyDomainsResult {
  success: boolean;
  message: string;
  generatedConfig?: string;
  /**
   * Whether retrying could plausibly succeed.
   *
   * `undefined` on the VPS and Dokploy paths, which have no classifier — those
   * keep the legacy substring rule in `worker.ts`. Only the static paths set it.
   */
  retryable?: boolean;
}

/**
 * The outcome of one cloud's static-domain reconcile.
 *
 * Narrower than {@link ApplyDomainsResult}: a reconcile reports whether any
 * domain is serving, which the dispatch layer above it does not.
 */
export interface StaticApplyOutcome {
  success: boolean;
  retryable?: boolean;
  message: string;
  /** True when at least one domain is serving over TLS. */
  anyLive?: boolean;
}
