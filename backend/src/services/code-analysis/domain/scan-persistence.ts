/**
 * Persistence and summary building for scan results.
 *
 * Owns writing findings to the database, computing the security summary shown
 * in the UI, and marking a scan as failed (with a best-effort status broadcast).
 */

import { randomUUID } from "node:crypto";
import { logger as obsLogger } from "../../../shared/logger.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json } from "../../../shared/supabase/types.js";
import { nowIso } from "../../../shared/utils/time.js";
import { filterSecurityFindings } from "./findings.js";
import { defaultSummary, parseSummary } from "./mappers.js";
import { toRepoRelativePath, type ScanFindingInput } from "./scan-analysis.js";
import { broadcastScanStatus } from "./scan-progress.js";

/** Findings are inserted in batches of this size to stay under payload limits. */
const INSERT_BATCH_SIZE = 100;

/**
 * Build the security summary (finding counts by severity + file totals) that is
 * stored on the scan row and surfaced in the dashboard.
 */
export function buildSummary(findings: ScanFindingInput[], filesInRepo: number, filesScanned: number) {
  const securityFindings = filterSecurityFindings(findings);
  const errors = securityFindings.filter((f) => f.severity === "error").length;
  const warnings = securityFindings.filter((f) => f.severity === "warning").length;
  const infos = securityFindings.filter((f) => f.severity === "info").length;

  return {
    ...defaultSummary(),
    totalFindings: securityFindings.length,
    errors,
    warnings,
    infos,
    filesScanned,
    filesInRepo,
  };
}

/**
 * Replace the persisted findings for a scan: delete any existing rows, then
 * insert the new set in batches. No-ops the insert when there are no findings.
 */
export async function persistFindings(
  scanId: string,
  tenantId: string,
  findings: ScanFindingInput[],
): Promise<void> {
  const { error: deleteError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  if (deleteError) throw new Error(`Failed to delete existing findings: ${deleteError.message}`);

  if (findings.length === 0) return;

  const now = nowIso();
  for (let i = 0; i < findings.length; i += INSERT_BATCH_SIZE) {
    const batch = findings.slice(i, i + INSERT_BATCH_SIZE).map((finding) => ({
      id: randomUUID(),
      organization_id: tenantId,
      scan_id: scanId,
      rule_id: finding.ruleId,
      severity: finding.severity,
      message: finding.message,
      file_path: toRepoRelativePath(finding.filePath),
      start_line: finding.startLine,
      end_line: finding.endLine,
      snippet: finding.snippet,
      created_at: now,
    }));

    const { error } = await supabaseAdmin.from("findings").insert(batch);
    if (error) throw new Error(`Failed to insert findings: ${error.message}`);
  }
}

/**
 * Mark a scan as failed, preserving whatever file-count progress it had reached,
 * and broadcast the failure. Best-effort — a DB update failure is logged, not
 * thrown, so it never masks the original error.
 */
export async function markScanFailed(scanId: string, message: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("scans")
    .select("summary")
    .eq("id", scanId)
    .single();

  const existing = parseSummary(data?.summary) as ReturnType<typeof parseSummary> & {
    progress?: { filesScanned?: number; filesInRepo?: number };
  };
  const summary = {
    ...defaultSummary(),
    filesScanned: existing.filesScanned || existing.progress?.filesScanned || 0,
    filesInRepo: existing.filesInRepo || existing.progress?.filesInRepo || 0,
    error: message,
  };
  const { error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "failed",
      summary: summary as unknown as Json,
      updated_at: nowIso(),
    })
    .eq("id", scanId);
  if (error) obsLogger.error({ err: error.message }, `[scan] Failed to mark scan ${scanId} as failed`);
  broadcastScanStatus(scanId, "failed", summary);
}
