import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList, deleteOrThrow } from "../../../shared/supabase/query.js";
import type {
  SecurityRuleRow,
  SecurityRuleCredentialRow,
  RedirectRuleRow,
} from "../schemas.js";
import { hash } from "bcryptjs";
import { encryptJson, decryptJson } from "../../../shared/auth/crypto.js";
import { logger } from "../../../shared/logger.js";
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
        // bcrypt hash for the legacy nginx/htpasswd applier; encrypted plaintext
        // for the Dokploy security.create applier (which needs the real password).
        password_hash: await hash(c.password, BCRYPT_ROUNDS),
        password_encrypted: encryptJson(c.password),
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

  await deleteOrThrow(
    supabaseAdmin
      .from("security_rules")
      .delete({ count: "exact" })
      .eq("id", ruleId)
      .eq("organization_id", tenantId)
      .eq("project_id", projectId),
    NetworkError,
    { notFoundMsg: "Security rule not found", internalMsg: "Failed to delete security rule" },
  );
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
      password_encrypted: encryptJson(password),
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

  await deleteOrThrow(
    supabaseAdmin
      .from("security_rule_credentials")
      .delete({ count: "exact" })
      .eq("id", credentialId)
      .eq("security_rule_id", ruleId),
    NetworkError,
    { notFoundMsg: "Credential not found", internalMsg: "Failed to delete credential" },
  );
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

  await deleteOrThrow(
    supabaseAdmin
      .from("redirect_rules")
      .delete({ count: "exact" })
      .eq("id", ruleId)
      .eq("organization_id", tenantId)
      .eq("project_id", projectId),
    NetworkError,
    { notFoundMsg: "Redirect rule not found", internalMsg: "Failed to delete redirect rule" },
  );
}

// ─── Server-only: decrypted credentials (for the Dokploy applier) ───

/** A security rule with its credentials' PLAINTEXT passwords decrypted. */
export interface SecurityRuleWithSecrets {
  id: string;
  name: string;
  path: string | null;
  credentials: Array<{ username: string; password: string }>;
}

/**
 * List security rules with decrypted plaintext passwords, for server-side
 * appliers that must forward the real password to an upstream (Dokploy's
 * `security.create`). This is NEVER exposed via the API — it exists only for
 * the config-apply path.
 *
 * Credentials created before the `password_encrypted` column existed (or whose
 * ciphertext can't be decrypted) are skipped with a warning: there's no way to
 * recover their plaintext, so the user must recreate them to protect the app
 * on Dokploy. bcrypt `password_hash` remains for the legacy nginx path.
 */
export async function listSecurityRulesWithSecrets(params: {
  tenantId: string;
  projectId: string;
}): Promise<SecurityRuleWithSecrets[]> {
  const { tenantId, projectId } = params;

  const { data: rules, error } = await supabaseAdmin
    .from("security_rules")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const ruleRows = unwrapList(rules, error, NetworkError, { internalMsg: "Failed to list security rules" });
  if (ruleRows.length === 0) return [];

  const ruleIds = ruleRows.map((r) => r.id);
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("security_rule_credentials")
    .select("*")
    .in("security_rule_id", ruleIds)
    .order("created_at", { ascending: true });

  const credRows = unwrapList(creds, credsError, NetworkError, { internalMsg: "Failed to list credentials" });

  const byRule = new Map<string, Array<{ username: string; password: string }>>();
  for (const c of credRows as SecurityRuleCredentialRow[]) {
    if (!c.password_encrypted) {
      logger.warn(
        { ruleId: c.security_rule_id, credentialId: c.id },
        "[network] Security credential has no encrypted password — recreate it to protect the app on Dokploy.",
      );
      continue;
    }
    let password: string;
    try {
      password = decryptJson(c.password_encrypted) as string;
    } catch {
      logger.warn(
        { ruleId: c.security_rule_id, credentialId: c.id },
        "[network] Failed to decrypt security credential — recreate it to protect the app on Dokploy.",
      );
      continue;
    }
    const list = byRule.get(c.security_rule_id) ?? [];
    list.push({ username: c.username, password });
    byRule.set(c.security_rule_id, list);
  }

  return (ruleRows as SecurityRuleRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
    credentials: byRule.get(r.id) ?? [],
  }));
}
