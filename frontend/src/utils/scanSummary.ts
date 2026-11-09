type ScanSummaryCounts = { totalFindings?: number; errors: number; warnings: number; infos: number };

/**
 * A cancelled scan is stored as `failed` (the status enum has no room for
 * another value) with `summary.cancelled`. Anything that shows a status has to
 * go through here, or a scan the user stopped themselves reads as one that broke.
 */
export function effectiveScanStatus(status: string, summary?: { cancelled?: boolean } | null): string {
  return status === "failed" && summary?.cancelled ? "cancelled" : status;
}

/** Dot color for a `failed` scan: a cancelled one is amber, as cancelled deploys are, not red. */
export function failedScanDotClass(summary?: { cancelled?: boolean } | null): string {
  return summary?.cancelled ? "bg-warning-500" : "bg-danger-500";
}

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

/**
 * History-dot color from findings: red if any errors, yellow if warnings only,
 * green when there are no errors or warnings (infos-only and empty both count).
 */
export function scanFindingSeverityDotClass(summary?: Pick<ScanSummaryCounts, "errors" | "warnings"> | null): string {
  if (summary && summary.errors > 0) return "bg-danger-500";
  if (summary && summary.warnings > 0) return "bg-warning-500";
  return "bg-success-500";
}
