/**
 * Persistence and summary building for scan results.
 *
 * Owns writing findings to the database, computing the security summary shown
 * in the UI, and marking a scan as failed (with a best-effort status broadcast).
 */

import { randomUUID } from "node:crypto";
import { logger as obsLogger } from "../../../shared/logger.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import type { Json, TableInsert } from "../../../shared/supabase/types.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { withRetry } from "../../../shared/utils/retry.js";
import { nowIso } from "../../../shared/utils/time.js";
import { filterSecurityFindings } from "./findings.js";
import { defaultSummary, parseSummary } from "./mappers.js";
import { toRepoRelativePath, type ScanFindingInput } from "./scan-analysis.js";
import { broadcastScanStatus } from "./scan-progress.js";

/** Findings are inserted in batches of this size to stay under payload limits. */
const INSERT_BATCH_SIZE = 100;

/** Cloudflare in front of Supabase answers a block with an HTML page, handed back as error.message. */
function isEdgeBlock(message: string): boolean {
  return /^\s*<(!doctype html|html)/i.test(message);
}

/**
 * The user-facing part of a database error. It ends up in summary.error, which every
 * member of the tenant can read, so the raw text (constraint and column names,
 * PostgREST internals) goes to the log only. An edge block is described instead.
 */
function describeDbError(message: string, context: string): string {
  if (!isEdgeBlock(message)) {
    obsLogger.error({ err: message }, `[scan] Database error ${context}`);
    return `a database error ${context}; try running the scan again`;
  }
  const ray = /Cloudflare Ray ID:[^<]*<strong[^>]*>([a-z0-9]+)</i.exec(message)?.[1];
  return `blocked by the database edge (Cloudflare) ${context}${ray ? `, Cloudflare Ray ID ${ray}` : ""}`;
}

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

type FindingRow = TableInsert<"findings">;

async function insertOnce(rows: FindingRow[], attempts: number): Promise<void> {
  await withRetry(
    async () => {
      const { error } = await supabaseAdmin.from("findings").insert(rows);
      if (error) throw new Error(error.message);
    },
    {
      attempts,
      backoffMs: 2_000,
      label: "findings.insert",
      // A rejected row fails the same way forever; only the edge or the network is worth a retry.
      shouldRetry: (err) => {
        const message = getErrMsg(err);
        return isEdgeBlock(message) || /fetch failed|ECONN|socket hang up|terminated/i.test(message);
      },
    },
  );
}

/**
 * A block that survives retries is content-driven (e.g. Cloudflare's SSRF rule on
 * 'http://2852039166/'), so bisect to the row and store it without its snippet.
 */
async function insertRows(rows: FindingRow[], attempts: number): Promise<void> {
  try {
    await insertOnce(rows, attempts);
    return;
  } catch (err) {
    if (!isEdgeBlock(getErrMsg(err))) throw err;
    if (rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      await insertRows(rows.slice(0, mid), 1);
      await insertRows(rows.slice(mid), 1);
      return;
    }
    const [row] = rows;
    obsLogger.warn(
      { ruleId: row.rule_id, filePath: row.file_path, line: row.start_line, snippetLength: row.snippet?.length ?? 0 },
      "[scan] Edge blocked a finding row; storing it without its snippet",
    );
    // Empty, not a placeholder: every reader handles "" and would show a placeholder as code.
    await insertOnce([{ ...row, snippet: "" }], 1);
  }
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
  if (deleteError) {
    throw new Error(
      `Failed to delete existing findings: ${describeDbError(deleteError.message, "while clearing previous findings")}`,
    );
  }

  if (findings.length === 0) return;

  const now = nowIso();
  const batchCount = Math.ceil(findings.length / INSERT_BATCH_SIZE);
  for (let i = 0; i < findings.length; i += INSERT_BATCH_SIZE) {
    const batchNumber = i / INSERT_BATCH_SIZE + 1;
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

    try {
      await insertRows(batch, 3);
    } catch (err) {
      throw new Error(
        `Failed to insert findings: ${describeDbError(
          getErrMsg(err),
          `on batch ${batchNumber}/${batchCount} of ${batch.length} rows`,
        )}`,
      );
    }
  }
}

/**
 * Mark a still-running scan as failed, keep its file counts, drop its partial
 * findings and broadcast. A scan that already finished is left alone. Never
 * throws, so it cannot mask the error that brought the caller here.
 */
export async function markScanFailed(
  scanId: string,
  message: string,
  extra: { cancelled?: boolean } = {},
): Promise<void> {
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
    ...(extra.cancelled ? { cancelled: true } : {}),
  };
  // The status filter is the guard: it stops this from deleting the findings of
  // a scan that completed, and makes a check-then-write by the caller unneeded.
  const { data: updated, error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "failed",
      summary: summary as unknown as Json,
      updated_at: nowIso(),
    })
    .eq("id", scanId)
    .in("status", ["running", "pending"])
    .select("id")
    .maybeSingle();
  if (error) {
    obsLogger.error({ err: error.message }, `[scan] Failed to mark scan ${scanId} as failed`);
    return;
  }
  if (!updated) return;

  // A new run gets a new scan id, so nothing else would reclaim these rows.
  const { error: cleanupError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  if (cleanupError) {
    obsLogger.warn({ err: cleanupError.message }, `[scan] Could not clear partial findings of failed scan ${scanId}`);
  }

  broadcastScanStatus(scanId, "failed", summary);
}

/**
 * Store a finished run's result. Status-guarded like `markScanFailed`: a scan
 * marked failed meanwhile (stale, cancelled) stays failed, its just-persisted
 * findings are dropped, and `false` is returned so the caller announces nothing.
 * Unguarded, a failed scan flipped back to completed when its run ended.
 */
export async function markScanCompleted(
  scanId: string,
  summary: Record<string, unknown>,
  commitSha: string,
): Promise<boolean> {
  const { data: completed, error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "completed",
      summary: { ...summary, progress: undefined } as unknown as Json,
      commit_sha: commitSha,
      updated_at: nowIso(),
    })
    .eq("id", scanId)
    .in("status", ["running", "pending"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to save the scan result: ${describeDbError(error.message, "while saving the result")}`);
  if (completed) return true;

  // shortcut: a re-run of the same scan id while an old run lives on also passes the guard. The owner's poll keeps a live run "running", so that needs the owner SIGKILLed with its child blocked; a per-run token would close it.
  obsLogger.warn(`[scan] Scan ${scanId} is no longer running; discarding this run's result`);
  await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  return false;
}
