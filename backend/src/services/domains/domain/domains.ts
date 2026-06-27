import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { DomainRow, SslCertificateRow } from "../schemas.js";

// ─── Helpers ───

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

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

function rowToDomain(row: DomainRow): DomainResponse {
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

function rowToCertificate(row: SslCertificateRow): SslCertificateResponse {
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

// ─── Domains ───

export async function listDomains(params: {
  tenantId: string;
  projectId: string;
}): Promise<DomainResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("domains")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw httpError(500, error.message);
  return (data || []).map((r) => rowToDomain(r as DomainRow));
}

export async function createDomain(params: {
  tenantId: string;
  projectId: string;
  name: string;
}): Promise<DomainResponse> {
  const { tenantId, projectId, name } = params;

  // Check if any domains exist already — first one becomes primary
  const { count } = await supabaseAdmin
    .from("domains")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  const isPrimary = (count ?? 0) === 0;

  const { data, error } = await supabaseAdmin
    .from("domains")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      name,
      is_primary: isPrimary,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw httpError(409, "Domain already exists");
    throw httpError(500, error.message);
  }
  if (!data) throw httpError(500, "Failed to create domain");

  return rowToDomain(data as DomainRow);
}

export async function updateDomain(params: {
  tenantId: string;
  projectId: string;
  domainId: string;
  isPrimary?: boolean;
  redirectWww?: boolean;
  wildcard?: boolean;
}): Promise<DomainResponse> {
  const { tenantId, projectId, domainId, isPrimary, redirectWww, wildcard } = params;

  // If setting as primary, unset all others first
  if (isPrimary) {
    await supabaseAdmin
      .from("domains")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("organization_id", tenantId)
      .eq("project_id", projectId);
  }

  const updates: Partial<DomainRow> = { updated_at: new Date().toISOString() };
  if (isPrimary !== undefined) updates.is_primary = isPrimary;
  if (redirectWww !== undefined) updates.redirect_www = redirectWww;
  if (wildcard !== undefined) updates.wildcard = wildcard;

  const { data, error } = await supabaseAdmin
    .from("domains")
    .update(updates)
    .eq("id", domainId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  if (!data) throw httpError(404, "Domain not found");

  return rowToDomain(data as DomainRow);
}

export async function deleteDomain(params: {
  tenantId: string;
  projectId: string;
  domainId: string;
}): Promise<void> {
  const { tenantId, projectId, domainId } = params;

  const { error, count } = await supabaseAdmin
    .from("domains")
    .delete({ count: "exact" })
    .eq("id", domainId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  if (error) throw httpError(500, error.message);
  if (count === 0) throw httpError(404, "Domain not found");
}

// ─── SSL Certificates ───

export async function listCertificates(params: {
  tenantId: string;
  projectId: string;
}): Promise<SslCertificateResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw httpError(500, error.message);
  return (data || []).map((r) => rowToCertificate(r as SslCertificateRow));
}

export async function createCertificate(params: {
  tenantId: string;
  projectId: string;
  type: "lets_encrypt" | "custom" | "clone";
  domainName: string;
}): Promise<SslCertificateResponse> {
  const { tenantId, projectId, type, domainName } = params;

  // Try to link to existing domain
  const { data: domainRow } = await supabaseAdmin
    .from("domains")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .eq("name", domainName)
    .single();

  const { data, error } = await supabaseAdmin
    .from("ssl_certificates")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      domain_id: domainRow?.id ?? null,
      type,
      domain_name: domainName,
      status: type === "lets_encrypt" ? "pending" : "active",
    })
    .select()
    .single();

  if (error || !data) throw httpError(500, error?.message || "Failed to create certificate");

  return rowToCertificate(data as SslCertificateRow);
}

export async function deleteCertificate(params: {
  tenantId: string;
  projectId: string;
  certificateId: string;
}): Promise<void> {
  const { tenantId, projectId, certificateId } = params;

  const { error, count } = await supabaseAdmin
    .from("ssl_certificates")
    .delete({ count: "exact" })
    .eq("id", certificateId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  if (error) throw httpError(500, error.message);
  if (count === 0) throw httpError(404, "Certificate not found");
}
