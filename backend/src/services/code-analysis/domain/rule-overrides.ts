import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { selectAllRows, throwOnError, unwrapList } from "../../../shared/supabase/query.js";
import { CodeAnalysisError } from "./scans.js";

export type OverrideTool = "semgrep" | "sonarqube";

export interface RuleOverride {
  id: string;
  ruleId: string;
  enabled: boolean;
}

export async function listRuleOverrides(tenantId: string, tool: OverrideTool): Promise<RuleOverride[]> {
  const table = tool === "semgrep" ? "opengrep_rules" : "sonarqube_rules";
  // All of them: the scan worker builds its disabled-rule set from this list, so an
  // override past the 1000-row cap would let a disabled rule run again. rule_id is
  // unique per organization (the upsert's conflict key), so the order is total.
  const { data, error } = await selectAllRows(() =>
    supabaseAdmin
      .from(table)
      .select("id,rule_id,enabled")
      .eq("organization_id", tenantId)
      .order("rule_id", { ascending: true }),
  );
  const rows = unwrapList(data, error, CodeAnalysisError, { internalMsg: "Failed to list rule overrides" });
  return rows.map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    enabled: row.enabled,
  }));
}

export interface UpsertRuleOverrideParams {
  tenantId: string;
  tool: OverrideTool;
  ruleId: string;
  enabled: boolean;
}

export async function upsertRuleOverride(params: UpsertRuleOverrideParams): Promise<void> {
  const { tenantId, tool, ruleId, enabled } = params;
  const table = tool === "semgrep" ? "opengrep_rules" : "sonarqube_rules";
  const payload = {
    id: randomUUID(),
    organization_id: tenantId,
    rule_id: ruleId,
    enabled,
  };
  const { error } = await supabaseAdmin.from(table).upsert(payload, { onConflict: "organization_id,rule_id" });
  throwOnError(error, CodeAnalysisError, { internalMsg: "Failed to upsert rule override" });
}
