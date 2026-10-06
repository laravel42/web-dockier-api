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
import { classifyDbError, type StaticFailure } from "./failures.js";
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
  /**
   * When the CURRENT PHASE began — not when the attach began.
   *
   * Widened from its original meaning so one column can drive both the backoff
   * tiers and the phase-scoped deadlines. Stamped on phase ENTRY only: see the
   * invariant on {@link setCertState}.
   */
  attachStartedAt: string | null;
  /** NOT NULL in the schema, so every clock fallback chain terminates here. */
  createdAt: string | null;
  issuedAt: string | null;
  /**
   * Last time the sweep LOOKED at this row, not last time it changed.
   * `touchCertPolled` is what writes it on a look.
   */
  updatedAt: string | null;
}

/** A read or write that failed, carrying why and whether a retry could help. */
export interface CertRowFailure {
  ok: false;
  failure: StaticFailure;
}

export type ListCertRowsResult = { ok: true; rows: StaticCertRow[] } | CertRowFailure;
export type EnsureCertRowResult = { ok: true; row: StaticCertRow } | CertRowFailure;
/** `row: null` means "read succeeded, nothing there" — distinct from a failure. */
export type FindCertRowResult = { ok: true; row: StaticCertRow | null } | CertRowFailure;

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
    createdAt: row.created_at ?? null,
    issuedAt: row.issued_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// `created_at`, `issued_at` and `updated_at` all already exist on
// `ssl_certificates` (migration 0050) and are already written — they were
// simply dropped from this projection. No migration.
const SELECT_COLUMNS =
  "id, domain_name, type, status, provider_ref, validation_record, verification_state, verification_message, attach_started_at, created_at, issued_at, updated_at";

/**
 * Every platform-owned certificate row for a project.
 *
 * Returns a result rather than an array, because a FAILED read and an EMPTY
 * table are not the same thing: callers derive "orphaned" rows from this list
 * and delete them, so collapsing a failure into `[]` would run a destructive
 * delete over data that could not be read.
 */
export async function listStaticCertRows(projectId: string): Promise<ListCertRowsResult> {
  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .in("type", STATIC_CERT_TYPES as unknown as string[]);

  if (error) {
    logger.error({ err: error, projectId }, "[domains:static] failed to list certificate rows");
    return { ok: false, failure: classifyDbError(error, { operation: "list certificate rows" }) };
  }
  return { ok: true, rows: (data ?? []).map((r) => toStaticCertRow(r as SslCertificateRow)) };
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
}): Promise<EnsureCertRowResult> {
  const { tenantId, projectId, domainName, domainId, type } = params;

  const existing = await findStaticCertRow(projectId, domainName);
  if (!existing.ok) return existing;
  if (existing.row) return { ok: true, row: existing.row };

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
      // Another worker inserted it between our read and write. Re-read rather
      // than report: the row exists, we simply did not create it.
      const reread = await findStaticCertRow(projectId, domainName);
      if (!reread.ok) return reread;
      if (reread.row) return { ok: true, row: reread.row };
      // Unique violation but nothing to read back — treat as a real failure
      // rather than returning a null row the caller cannot act on.
      logger.error(
        { err: error, projectId, domainName },
        "[domains:static] unique violation with no row to re-read",
      );
      return {
        ok: false,
        failure: classifyDbError(error, { operation: "create certificate row", domainName }),
      };
    }
    logger.error({ err: error, projectId, domainName }, "[domains:static] failed to create certificate row");
    return {
      ok: false,
      failure: classifyDbError(error, { operation: "create certificate row", domainName }),
    };
  }

  return { ok: true, row: toStaticCertRow(data as SslCertificateRow) };
}

/** The platform-owned certificate row for one (project, domain), if any. */
export async function findStaticCertRow(
  projectId: string,
  domainName: string,
): Promise<FindCertRowResult> {
  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("domain_name", domainName)
    .in("type", STATIC_CERT_TYPES as unknown as string[])
    .maybeSingle();

  if (error) {
    logger.error({ err: error, projectId, domainName }, "[domains:static] failed to read certificate row");
    return {
      ok: false,
      failure: classifyDbError(error, { operation: "read certificate row", domainName }),
    };
  }
  return { ok: true, row: data ? toStaticCertRow(data as SslCertificateRow) : null };
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
 *
 * THE PHASE-CLOCK INVARIANT: `attach_started_at` is written if and only if the
 * `verificationState` being written DIFFERS from the one already persisted. A
 * write that re-asserts the state the row already holds must leave the clock
 * alone.
 *
 * This is not a formality. Before the background sweep existed, the only caller
 * was a user click, so re-stamping the clock on every write was harmless. Under
 * a repeating sweep it is fatal: a clock re-stamped on every look never ages
 * past one poll interval, so every phase-scoped deadline silently never fires
 * and the upper backoff tiers are unreachable. Pass `currentVerificationState`
 * and let this function decide.
 */
export async function setCertState(
  certificateId: string,
  update: CertStateUpdate,
  currentVerificationState?: CertVerificationState,
): Promise<boolean> {
  const row: TableUpdate<"ssl_certificates"> = { updated_at: nowIso() };

  if (update.status !== undefined) row.status = update.status;
  if (update.verificationState !== undefined) row.verification_state = update.verificationState;

  // Stamp the phase clock on a genuine phase ENTRY. Only applies when the
  // caller told us what the row currently holds; an explicit `attachStartedAt`
  // in the update still wins (resume sets it deliberately).
  if (
    update.attachStartedAt === undefined &&
    update.verificationState !== undefined &&
    currentVerificationState !== undefined &&
    update.verificationState !== currentVerificationState
  ) {
    row.attach_started_at = nowIso();
  }
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
    logger.error({ err: error, certificateId }, "[domains:static] failed to update certificate state");
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
export async function deleteStaticCertRows(
  projectId: string,
  domainNames: string[],
): Promise<{ ok: boolean }> {
  if (domainNames.length === 0) return { ok: true };

  const { error } = await supabaseAdmin
    .from("ssl_certificates")
    .delete()
    .eq("project_id", projectId)
    .in("type", STATIC_CERT_TYPES as unknown as string[])
    .in("domain_name", domainNames);

  if (error) {
    // The raw error, not getErrMsg: `code`, `details` and `hint` are what make
    // a failed delete diagnosable, and getErrMsg discards all three.
    logger.error({ err: error, projectId }, "[domains:static] failed to delete certificate rows");
    return { ok: false };
  }
  return { ok: true };
}
