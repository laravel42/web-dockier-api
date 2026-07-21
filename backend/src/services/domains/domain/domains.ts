import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { DomainRow, SslCertificateRow } from "../schemas.js";
import {
  rowToDomain,
  rowToCertificate,
  type DomainResponse,
  type SslCertificateResponse,
} from "./mappers.js";

export type { DomainResponse, SslCertificateResponse };

export const DomainsError = createDomainErrorClass<"not_found" | "bad_request" | "conflict" | "internal">("DomainsError");
export type DomainsError = InstanceType<typeof DomainsError>;

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

  const rows = unwrapList(data, error, DomainsError, { internalMsg: "Failed to list domains" });
  return rows.map((r) => rowToDomain(r as DomainRow));
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

  if (error?.code === "23505") throw new DomainsError("Domain already exists", "conflict");
  const row = unwrapQuery(data, error, DomainsError, { internalMsg: "Failed to create domain" });

  return rowToDomain(row as DomainRow);
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

  const row = unwrapQuery(data, error, DomainsError, {
    notFoundMsg: "Domain not found",
    internalMsg: "Failed to update domain",
  });

  return rowToDomain(row as DomainRow);
}

export async function deleteDomain(params: {
  tenantId: string;
  projectId: string;
  domainId: string;
}): Promise<void> {
  const { tenantId, projectId, domainId } = params;

  // Check if the domain being deleted is currently the primary domain
  const { data: domain, error: fetchError } = await supabaseAdmin
    .from("domains")
    .select("is_primary")
    .eq("id", domainId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  const row = unwrapQuery(domain, fetchError, DomainsError, { notFoundMsg: "Domain not found" });

  const { error, count } = await supabaseAdmin
    .from("domains")
    .delete({ count: "exact" })
    .eq("id", domainId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, DomainsError, { internalMsg: "Failed to delete domain" });
  if (count === 0) throw new DomainsError("Domain not found", "not_found");

  // If the deleted domain was primary, promote the oldest remaining domain
  if (row.is_primary) {
    const { data: nextDomain } = await supabaseAdmin
      .from("domains")
      .select("id")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextDomain) {
      await supabaseAdmin
        .from("domains")
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq("id", nextDomain.id);
    }
  }
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

  const rows = unwrapList(data, error, DomainsError, { internalMsg: "Failed to list certificates" });
  return rows.map((r) => rowToCertificate(r as SslCertificateRow));
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
    .maybeSingle();

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

  const row = unwrapQuery(data, error, DomainsError, { internalMsg: "Failed to create certificate" });

  return rowToCertificate(row as SslCertificateRow);
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

  throwOnError(error, DomainsError, { internalMsg: "Failed to delete certificate" });
  if (count === 0) throw new DomainsError("Certificate not found", "not_found");
}
