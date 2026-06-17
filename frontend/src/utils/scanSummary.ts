import type { ScanSummary } from "../types";

type ScanSummaryCounts = Pick<ScanSummary, "totalFindings" | "errors" | "warnings" | "infos">;

/** Security finding total — prefers severity buckets when summary fields disagree. */
export function scanSecurityFindingCount(summary: ScanSummaryCounts): number {
  const bySeverity = summary.errors + summary.warnings + summary.infos;
  return Math.max(summary.totalFindings ?? 0, bySeverity);
}

export function isScanSecurityClean(summary: ScanSummaryCounts): boolean {
  return scanSecurityFindingCount(summary) === 0;
}

export function scanHasSecurityErrors(summary: ScanSummaryCounts): boolean {
  return summary.errors > 0;
}
