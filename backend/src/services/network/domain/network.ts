import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type {
  SecurityRuleRow,
  SecurityRuleCredentialRow,
  RedirectRuleRow,
} from "../schemas.js";
import { hash } from "bcryptjs";

const BCRYPT_ROUNDS = 10;

// ─── Helpers ───

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export interface SecurityRuleCredentialResponse {
  id: string;
  username: string;
  createdAt: string;
}

export interface SecurityRuleResponse {
  id: string;
  projectId: string;
  name: string;
  path: string | null;
  credentials: SecurityRuleCredentialResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RedirectRuleResponse {
  id: string;
  projectId: string;
  fromPath: string;
  toPath: string;
  type: "temporary" | "permanent";
  createdAt: string;
  updatedAt: string;
}

function rowToCredential(row: SecurityRuleCredentialRow): SecurityRuleCredentialResponse {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
  };
}

function rowToSecurityRule(row: SecurityRuleRow, credentials: SecurityRuleCredentialRow[]): SecurityRuleResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    path: row.path,
    credentials: credentials.map(rowToCredential),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRedirectRule(row: RedirectRuleRow): RedirectRuleResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    type: row.type as "temporary" | "permanent",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

  if (error) throw httpError(500, error.message);

  if (!rules || rules.length === 0) return [];

  // Fetch all credentials for these rules in one query
  const ruleIds = rules.map((r) => r.id);
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("security_rule_credentials")
    .select("*")
    .in("security_rule_id", ruleIds)
    .order("created_at", { ascending: true });

  if (credsError) throw httpError(500, credsError.message);

  const credsByRule = (creds || []).reduce((acc, c) => {
    const key = c.security_rule_id;
    (acc[key] = acc[key] || []).push(c);
    return acc;
  }, {} as Record<string, SecurityRuleCredentialRow[]>);

  return rules.map((r) =>
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

  if (error || !data) throw httpError(500, error?.message || "Failed to create security rule");

  let credRows: SecurityRuleCredentialRow[] = [];

  if (credentials && credentials.length > 0) {
    const inserts = await Promise.all(
      credentials.map(async (c) => ({
        security_rule_id: data.id,
        username: c.username,
        password_hash: await hash(c.password, BCRYPT_ROUNDS),
      })),
    );

    const { data: insertedCreds, error: credError } = await supabaseAdmin
      .from("security_rule_credentials")
      .insert(inserts)
      .select();

    if (credError) throw httpError(500, credError.message);
    credRows = (insertedCreds || []) as SecurityRuleCredentialRow[];
  }

  return rowToSecurityRule(data as SecurityRuleRow, credRows);
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

  if (error) throw httpError(500, error.message);
  if (count === 0) throw httpError(404, "Security rule not found");
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

  if (ruleError || !rule) throw httpError(404, "Security rule not found");

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

  if (error || !data) throw httpError(500, error?.message || "Failed to add credential");

  return rowToCredential(data as SecurityRuleCredentialRow);
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

  if (ruleError || !rule) throw httpError(404, "Security rule not found");

  const { error, count } = await supabaseAdmin
    .from("security_rule_credentials")
    .delete({ count: "exact" })
    .eq("id", credentialId)
    .eq("security_rule_id", ruleId);

  if (error) throw httpError(500, error.message);
  if (count === 0) throw httpError(404, "Credential not found");
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

  if (error) throw httpError(500, error.message);

  return (data || []).map((r) => rowToRedirectRule(r as RedirectRuleRow));
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

  if (error || !data) throw httpError(500, error?.message || "Failed to create redirect rule");

  return rowToRedirectRule(data as RedirectRuleRow);
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

  if (error) throw httpError(500, error.message);
  if (count === 0) throw httpError(404, "Redirect rule not found");
}
