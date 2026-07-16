import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type {
  SecurityRuleRow,
  SecurityRuleCredentialRow,
  RedirectRuleRow,
} from "../schemas.js";
import { hash } from "bcryptjs";
import {
  rowToCredential,
  rowToSecurityRule,
  rowToRedirectRule,
  type SecurityRuleCredentialResponse,
  type SecurityRuleResponse,
  type RedirectRuleResponse,
} from "./mappers.js";

export type { SecurityRuleCredentialResponse, SecurityRuleResponse, RedirectRuleResponse };

const BCRYPT_ROUNDS = 10;

export const NetworkError = createDomainErrorClass<"not_found" | "bad_request" | "internal">("NetworkError");
export type NetworkError = InstanceType<typeof NetworkError>;

// ─── Security Rules ───

export async function listSecurityRules(params: {
  tenantId: string;
  projectId: string;
}): Promise<SecurityRuleResponse[]> {
  const { tenantId, projectId } = params;

  const { data: rules, error } = await supabaseAdmin
    .from("security_rules")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const rows = unwrapList(rules, error, NetworkError, { internalMsg: "Failed to list security rules" });

  if (rows.length === 0) return [];

  // Fetch all credentials for these rules in one query
  const ruleIds = rows.map((r) => r.id);
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("security_rule_credentials")
    .select("*")
    .in("security_rule_id", ruleIds)
    .order("created_at", { ascending: true });

  const credRows = unwrapList(creds, credsError, NetworkError, { internalMsg: "Failed to list credentials" });

  const credsByRule = credRows.reduce((acc, c) => {
    const key = c.security_rule_id;
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {} as Record<string, SecurityRuleCredentialRow[]>);

  return rows.map((r) =>
    rowToSecurityRule(r as SecurityRuleRow, credsByRule[r.id] || []),
  );
}

export async function createSecurityRule(params: {
  tenantId: string;
  projectId: string;
  name: string;
  path?: string;
  credentials?: Array<{ username: string; password: string }>;
}): Promise<SecurityRuleResponse> {
  const { tenantId, projectId, name, path, credentials } = params;

  const { data, error } = await supabaseAdmin
    .from("security_rules")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      name,
      path: path || null,
    })
    .select()
    .single();

  const rule = unwrapQuery(data, error, NetworkError, { internalMsg: "Failed to create security rule" });

  let credRows: SecurityRuleCredentialRow[] = [];

  if (credentials && credentials.length > 0) {
    const inserts = await Promise.all(
      credentials.map(async (c) => ({
        security_rule_id: rule.id,
        username: c.username,
        password_hash: await hash(c.password, BCRYPT_ROUNDS),
      })),
    );

    const { data: insertedCreds, error: credError } = await supabaseAdmin
      .from("security_rule_credentials")
      .insert(inserts)
      .select();

    throwOnError(credError, NetworkError, { internalMsg: "Failed to create credentials" });
    credRows = (insertedCreds || []) as SecurityRuleCredentialRow[];
  }

  return rowToSecurityRule(rule as SecurityRuleRow, credRows);
}

export async function deleteSecurityRule(params: {
  tenantId: string;
  projectId: string;
  ruleId: string;
}): Promise<void> {
  const { tenantId, projectId, ruleId } = params;

  const { error, count } = await supabaseAdmin
    .from("security_rules")
    .delete({ count: "exact" })
    .eq("id", ruleId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, NetworkError, { internalMsg: "Failed to delete security rule" });
  if (count === 0) throw new NetworkError("Security rule not found", "not_found");
}

export async function addSecurityRuleCredential(params: {
  tenantId: string;
  projectId: string;
  ruleId: string;
  username: string;
  password: string;
}): Promise<SecurityRuleCredentialResponse> {
  const { tenantId, projectId, ruleId, username, password } = params;

  // Verify the rule belongs to this tenant/project
  const { data: rule, error: ruleError } = await supabaseAdmin
    .from("security_rules")
    .select("id")
    .eq("id", ruleId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .single();

  unwrapQuery(rule, ruleError, NetworkError, { notFoundMsg: "Security rule not found" });

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const { data, error } = await supabaseAdmin
    .from("security_rule_credentials")
    .insert({
      security_rule_id: ruleId,
      username,
      password_hash: passwordHash,
    })
    .select()
    .single();

  const cred = unwrapQuery(data, error, NetworkError, { internalMsg: "Failed to add credential" });

  return rowToCredential(cred as SecurityRuleCredentialRow);
}

export async function deleteSecurityRuleCredential(params: {
  tenantId: string;
  projectId: string;
  ruleId: string;
  credentialId: string;
}): Promise<void> {
  const { tenantId, projectId, ruleId, credentialId } = params;

  // Verify the rule belongs to this tenant/project
  const { data: rule, error: ruleError } = await supabaseAdmin
    .from("security_rules")
    .select("id")
    .eq("id", ruleId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .single();

  unwrapQuery(rule, ruleError, NetworkError, { notFoundMsg: "Security rule not found" });

  const { error, count } = await supabaseAdmin
    .from("security_rule_credentials")
    .delete({ count: "exact" })
    .eq("id", credentialId)
    .eq("security_rule_id", ruleId);

  throwOnError(error, NetworkError, { internalMsg: "Failed to delete credential" });
  if (count === 0) throw new NetworkError("Credential not found", "not_found");
}

// ─── Redirect Rules ───

export async function listRedirectRules(params: {
  tenantId: string;
  projectId: string;
}): Promise<RedirectRuleResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("redirect_rules")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const rows = unwrapList(data, error, NetworkError, { internalMsg: "Failed to list redirect rules" });

  return rows.map((r) => rowToRedirectRule(r as RedirectRuleRow));
}

export async function createRedirectRule(params: {
  tenantId: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  type: "temporary" | "permanent";
}): Promise<RedirectRuleResponse> {
  const { tenantId, projectId, fromPath, toPath, type } = params;

  const { data, error } = await supabaseAdmin
    .from("redirect_rules")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      from_path: fromPath,
      to_path: toPath,
      type,
    })
    .select()
    .single();

  const row = unwrapQuery(data, error, NetworkError, { internalMsg: "Failed to create redirect rule" });

  return rowToRedirectRule(row as RedirectRuleRow);
}

export async function deleteRedirectRule(params: {
  tenantId: string;
  projectId: string;
  ruleId: string;
}): Promise<void> {
  const { tenantId, projectId, ruleId } = params;

  const { error, count } = await supabaseAdmin
    .from("redirect_rules")
    .delete({ count: "exact" })
    .eq("id", ruleId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, NetworkError, { internalMsg: "Failed to delete redirect rule" });
  if (count === 0) throw new NetworkError("Redirect rule not found", "not_found");
}
