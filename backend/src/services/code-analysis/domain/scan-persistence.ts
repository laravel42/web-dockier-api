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
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { withRetry } from "../../../shared/utils/retry.js";
import { nowIso } from "../../../shared/utils/time.js";
import { filterSecurityFindings } from "./findings.js";
import { defaultSummary, parseSummary } from "./mappers.js";
import { toRepoRelativePath, type ScanFindingInput } from "./scan-analysis.js";
import { broadcastScanStatus } from "./scan-progress.js";

/** Findings are inserted in batches of this size to stay under payload limits. */
const INSERT_BATCH_SIZE = 100;

/**
 * Cloudflare sits in front of the Supabase REST API, and when it blocks a
 * request the body is an HTML error page, which supabase-js hands back as
 * `error.message` — a whole document ends up in summary.error and in the UI.
 * The Ray ID is the only actionable part: it is what Supabase support needs.
 */
function isEdgeBlock(message: string): boolean {
  return /^\s*<(!doctype html|html)/i.test(message);
}

function describeDbError(message: string, context: string): string {
  if (!isEdgeBlock(message)) return message;
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

type FindingRow = {
  id: string;
  organization_id: string;
  scan_id: string;
  rule_id: string;
  severity: string;
  message: string;
  file_path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  created_at: string;
};

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
      // A rejected row (constraint, bad column) fails identically forever;
      // only an edge interception or a dropped connection is worth another try.
      shouldRetry: (err) => {
        const message = getErrMsg(err);
        return isEdgeBlock(message) || /fetch failed|ECONN|socket hang up|terminated/i.test(message);
      },
    },
  );
}

/**
 * Insert rows; if the edge keeps blocking the batch the block is content-driven
 * (a real scan hit the same batch twice), so bisect to the offending row. That
 * row is stored without its snippet — the finding survives, the one field that
 * trips the edge is withheld — and its rule and location are logged so the
 * trigger can be identified. Non-edge errors propagate untouched.
 *
 * The one trigger seen so far: a test asserting that `'http://2852039166/'`
 * (169.254.169.254, the cloud metadata IP, written as a decimal integer) is
 * refused. Cloudflare's SSRF rule blocks that URL in any request body, and a
 * security scanner stores exactly that kind of code.
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
      { ruleId: row.rule_id, filePath: row.file_path, line: row.start_line, snippetLength: row.snippet.length },
      "[scan] Edge blocked a finding row; storing it without its snippet",
    );
    // Empty rather than a placeholder: the UI then falls back to the file from
    // the repo, and Fix with AI and issue summaries already say "snippet
    // unavailable" — a placeholder string would be shown to the user as code.
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
 * Mark a scan as failed, preserving whatever file-count progress it had reached,
 * and broadcast the failure. Best-effort — a DB update failure is logged, not
 * thrown, so it never masks the original error.
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
  const { error } = await supabaseAdmin
    .from("scans")
    .update({
      status: "failed",
      summary: summary as unknown as Json,
      updated_at: nowIso(),
    })
    .eq("id", scanId);
  if (error) obsLogger.error({ err: error.message }, `[scan] Failed to mark scan ${scanId} as failed`);

  // A scan that dies mid-insert leaves its first batches behind. Nothing else
  // removes them: persistFindings deletes by scan_id, and a new scan gets a new
  // id. A failed scan reporting a partial result is worse than one reporting none.
  const { error: cleanupError } = await supabaseAdmin.from("findings").delete().eq("scan_id", scanId);
  if (cleanupError) {
    obsLogger.warn({ err: cleanupError.message }, `[scan] Could not clear partial findings of failed scan ${scanId}`);
  }

  broadcastScanStatus(scanId, "failed", summary);
}
