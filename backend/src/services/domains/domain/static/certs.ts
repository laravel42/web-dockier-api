/**
 * Certificate row helpers for static-hosting custom domains.
 *
 * The `ssl_certificates` table is shared with the VPS/certbot and Dokploy
 * flows, so everything here is scoped to the two platform-owned types
 * (`acm`, `gcp_managed`) and never touches a `lets_encrypt`/`custom`/`clone`
 * row belonging to another path.
 */

import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { logger } from "../../../../shared/logger.js";
import { nowIso } from "../../../../shared/utils/time.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import type { Json, TableUpdate } from "../../../../shared/supabase/types.js";
import type { SslCertificateRow } from "../../schemas.js";
import type { CertVerificationState, DnsValidationRecord } from "../mappers.js";

/** The platform-owned certificate types. */
export type StaticCertType = "acm" | "gcp_managed";

export const STATIC_CERT_TYPES: readonly StaticCertType[] = ["acm", "gcp_managed"];

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

export interface StaticCertRow {
  id: string;
  domainName: string;
  type: StaticCertType;
  status: string;
  providerRef: string | null;
  validationRecord: DnsValidationRecord | null;
  verificationState: CertVerificationState;
  verificationMessage: string | null;
  attachStartedAt: string | null;
}

function toStaticCertRow(row: SslCertificateRow): StaticCertRow {
  const vr = row.validation_record as Record<string, unknown> | null;
  return {
    id: row.id,
    domainName: row.domain_name,
    type: row.type as StaticCertType,
    status: row.status,
    providerRef: row.provider_ref ?? null,
    validationRecord:
      vr && typeof vr.name === "string" && typeof vr.type === "string" && typeof vr.value === "string"
        ? { name: vr.name, type: vr.type, value: vr.value }
        : null,
    verificationState: (row.verification_state as CertVerificationState) ?? "pending",
    verificationMessage: row.verification_message ?? null,
    attachStartedAt: row.attach_started_at ?? null,
  };
}

const SELECT_COLUMNS =
  "id, domain_name, type, status, provider_ref, validation_record, verification_state, verification_message, attach_started_at";

/** Every platform-owned certificate row for a project. */
export async function listStaticCertRows(projectId: string): Promise<StaticCertRow[]> {
  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .in("type", STATIC_CERT_TYPES as unknown as string[]);

  if (error) {
    logger.warn({ err: error, projectId }, "[domains:static] failed to list certificate rows");
    return [];
  }
  return (data ?? []).map((r) => toStaticCertRow(r as SslCertificateRow));
}

/**
 * Get or create the certificate row for one (project, domain).
 *
 * Deliberately select-then-insert rather than `.upsert()`: the uniqueness guard
 * `idx_ssl_certificates_static_unique` (migration 0075) is a PARTIAL index, and
 * PostgREST cannot emit the predicate that ON CONFLICT inference needs, so an
 * upsert against it fails with 42P10. A concurrent insert is caught via the
 * unique violation and re-read instead.
 */
export async function ensureStaticCertRow(params: {
  tenantId: string;
  projectId: string;
  domainName: string;
  domainId: string | null;
  type: StaticCertType;
}): Promise<StaticCertRow | null> {
  const { tenantId, projectId, domainName, domainId, type } = params;

  const existing = await findStaticCertRow(projectId, domainName);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      domain_id: domainId,
      domain_name: domainName,
      type,
      status: "pending",
      verification_state: "pending",
      updated_at: nowIso(),
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Another worker inserted it between our read and write.
      return await findStaticCertRow(projectId, domainName);
    }
    logger.warn({ err: error, projectId, domainName }, "[domains:static] failed to create certificate row");
    return null;
  }

  return toStaticCertRow(data as SslCertificateRow);
}

/** The platform-owned certificate row for one (project, domain), if any. */
export async function findStaticCertRow(
  projectId: string,
  domainName: string,
): Promise<StaticCertRow | null> {
  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("domain_name", domainName)
    .in("type", STATIC_CERT_TYPES as unknown as string[])
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, projectId, domainName }, "[domains:static] failed to read certificate row");
    return null;
  }
  return data ? toStaticCertRow(data as SslCertificateRow) : null;
}

export interface CertStateUpdate {
  status?: "pending" | "active" | "expired" | "failed";
  verificationState?: CertVerificationState;
  verificationMessage?: string | null;
  providerRef?: string | null;
  validationRecord?: DnsValidationRecord | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  attachStartedAt?: string | null;
}

/**
 * Write certificate state. Returns false on failure rather than throwing —
 * every caller is inside a best-effort reconcile that must report its own
 * outcome rather than blowing up mid-loop.
 */
export async function setCertState(certificateId: string, update: CertStateUpdate): Promise<boolean> {
  const row: TableUpdate<"ssl_certificates"> = { updated_at: nowIso() };

  if (update.status !== undefined) row.status = update.status;
  if (update.verificationState !== undefined) row.verification_state = update.verificationState;
  if (update.verificationMessage !== undefined) row.verification_message = update.verificationMessage;
  if (update.providerRef !== undefined) row.provider_ref = update.providerRef;
  if (update.validationRecord !== undefined) {
    row.validation_record = (update.validationRecord as unknown as Json) ?? null;
  }
  if (update.issuedAt !== undefined) row.issued_at = update.issuedAt;
  if (update.expiresAt !== undefined) row.expires_at = update.expiresAt;
  if (update.attachStartedAt !== undefined) row.attach_started_at = update.attachStartedAt;

  const { error } = await supabaseAdmin.from("ssl_certificates").update(row).eq("id", certificateId);

  if (error) {
    logger.warn({ err: error, certificateId }, "[domains:static] failed to update certificate state");
    return false;
  }
  return true;
}

/**
 * Delete the platform-owned certificate rows for domains no longer configured.
 *
 * Scoped to the static types so a VPS certificate for the same hostname is
 * never collaterally removed.
 */
export async function deleteStaticCertRows(projectId: string, domainNames: string[]): Promise<void> {
  if (domainNames.length === 0) return;

  const { error } = await supabaseAdmin
    .from("ssl_certificates")
    .delete()
    .eq("project_id", projectId)
    .in("type", STATIC_CERT_TYPES as unknown as string[])
    .in("domain_name", domainNames);

  if (error) {
    logger.warn({ err: getErrMsg(error), projectId }, "[domains:static] failed to delete certificate rows");
  }
}
