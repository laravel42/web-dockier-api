import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import type { Database } from "../../../shared/supabase/types.js";
import { rowToCustomRule } from "./mappers.js";
import { CodeAnalysisError } from "./scans.js";

export interface ListCustomRulesParams {
  tenantId: string;
  type?: string;
}

export async function listCustomRules(params: ListCustomRulesParams) {
  const { tenantId } = params;
  const type = params.type ?? "custom";
  const { data, error } = await supabaseAdmin
    .from("custom_rules")
    .select("id,organization_id,rule_id,severity,message,pattern,extensions,enabled,type,yaml_content,created_at")
    .or(`organization_id.eq.,organization_id.eq.${tenantId}`)
    .eq("type", type)
    .order("rule_id", { ascending: true });
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list custom rules" });
  return rows.map(rowToCustomRule);
}

export interface CreateCustomRuleParams {
  tenantId: string;
  ruleId: string;
  severity: string;
  message: string;
  pattern: string;
  extensions: string[];
  type?: string;
  yamlContent?: string;
}

export async function createCustomRule(params: CreateCustomRuleParams) {
  const { tenantId, ruleId, severity, message, pattern, extensions } = params;
  const ruleType = params.type ?? "custom";

  if (ruleType === "custom" && pattern) {
    try {
      new RegExp(pattern);
    } catch {
      throw new CodeAnalysisError("Invalid regex pattern", "bad_request");
    }
  }

  const id = randomUUID();
  const payload = {
    id,
    organization_id: tenantId,
    rule_id: ruleId,
    severity,
    message,
    pattern,
    extensions,
    type: ruleType,
    yaml_content: params.yamlContent ?? "",
    enabled: true,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("custom_rules").insert(payload);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to create custom rule" });

  return {
    id: payload.id,
    ruleId: payload.rule_id,
    severity: payload.severity,
    message: payload.message,
    pattern: payload.pattern,
    extensions: payload.extensions,
    enabled: true,
    isSystem: false,
    type: payload.type,
    yamlContent: payload.yaml_content,
    createdAt: payload.created_at,
  };
}

export interface UpdateCustomRuleParams {
  ruleDbId: string;
  tenantId: string;
  ruleId?: string;
  severity?: string;
  message?: string;
  pattern?: string;
  extensions?: string[];
  enabled?: boolean;
  yamlContent?: string;
}

export async function updateCustomRule(params: UpdateCustomRuleParams) {
  const { ruleDbId, tenantId } = params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("custom_rules")
    .select("organization_id,type")
    .eq("id", ruleDbId)
    .single();
  const rule = unwrapQuery(existing, fetchError, CodeAnalysisError, { notFoundMsg: "Rule not found" });
  if (rule.organization_id !== "" && rule.organization_id !== tenantId) {
    throw new CodeAnalysisError("Not your rule", "forbidden");
  }
  if (rule.organization_id === "") {
    if (params.enabled === undefined) {
      throw new CodeAnalysisError("System rules only support enable/disable", "forbidden");
    }
    if (
      params.ruleId !== undefined ||
      params.severity !== undefined ||
      params.message !== undefined ||
      params.pattern !== undefined ||
      params.extensions !== undefined ||
      params.yamlContent !== undefined
    ) {
      throw new CodeAnalysisError("System rules only support enable/disable", "forbidden");
    }
  }
  if (params.pattern && rule.type === "custom") {
    try {
      new RegExp(params.pattern);
    } catch {
      throw new CodeAnalysisError("Invalid regex pattern", "bad_request");
    }
  }

  const updates: Database["public"]["Tables"]["custom_rules"]["Update"] = {};
  if (params.ruleId !== undefined) updates.rule_id = params.ruleId;
  if (params.severity !== undefined) updates.severity = params.severity;
  if (params.message !== undefined) updates.message = params.message;
  if (params.pattern !== undefined) updates.pattern = params.pattern;
  if (params.extensions !== undefined) updates.extensions = params.extensions;
  if (params.enabled !== undefined) updates.enabled = params.enabled;
  if (params.yamlContent !== undefined) updates.yaml_content = params.yamlContent;

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.from("custom_rules").update(updates).eq("id", ruleDbId);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to update custom rule" });
}

export async function deleteCustomRule(ruleDbId: string, tenantId: string) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("custom_rules")
    .select("organization_id")
    .eq("id", ruleDbId)
    .single();
  const rule = unwrapQuery(existing, fetchError, CodeAnalysisError, { notFoundMsg: "Rule not found" });
  if (rule.organization_id === "") throw new CodeAnalysisError("Cannot delete system rules", "forbidden");
  if (rule.organization_id !== tenantId) throw new CodeAnalysisError("Not your rule", "forbidden");

  const { error } = await supabaseAdmin.from("custom_rules").delete().eq("id", ruleDbId);
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to delete custom rule" });
}
