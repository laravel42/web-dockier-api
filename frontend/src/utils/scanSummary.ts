type ScanSummaryCounts = { totalFindings?: number; errors: number; warnings: number; infos: number };

/** Cancelled is stored as `failed` + `summary.cancelled`; show every status through here. */
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

type DotSummary = Pick<ScanSummaryCounts, "errors" | "warnings"> & { cancelled?: boolean };

/**
 * A scan's status dot: its color and the words it stands for. Five list views
 * each built the color with their own ternary (a pending scan was blue in two and
 * grey in three) and none said it in text, so status was color-only.
 *
 * `findings` is the summary whose counts color a completed scan; list views pass
 * the latest completed scan's, which can differ from the newest scan's.
 */
export function scanStatusDot(
  status: string,
  summary?: DotSummary | null,
  findings: Pick<ScanSummaryCounts, "errors" | "warnings"> | null | undefined = summary,
): { className: string; label: string } {
  if (status === "completed") {
    const className = scanFindingSeverityDotClass(findings);
    const label = findings && findings.errors > 0
      ? "Completed with errors"
      : findings && findings.warnings > 0
        ? "Completed with warnings"
        : "Completed, no errors or warnings";
    return { className, label };
  }
  if (status === "failed") {
    return { className: failedScanDotClass(summary), label: summary?.cancelled ? "Cancelled" : "Failed" };
  }
  if (status === "running") return { className: "bg-primary-500", label: "Running" };
  return { className: "bg-secondary-400", label: "Pending" };
}
