import type { ProviderSeverityCounts, Scan, SecurityFindingCounts } from "@/types";

export function resolveFilteredCounts(
  findingCounts: SecurityFindingCounts | null,
  providerFilter: string,
  severityFilter: string,
  findingsTotal: number,
  fallback: ProviderSeverityCounts,
): ProviderSeverityCounts {
  if (!findingCounts) return fallback;

  let base: ProviderSeverityCounts = {
    total: findingCounts.total,
    errors: findingCounts.errors,
    warnings: findingCounts.warnings,
    infos: findingCounts.infos,
  };

  if (providerFilter === "semgrep" || providerFilter === "bearer" || providerFilter === "custom" || providerFilter === "codeql") {
    base = findingCounts.byProvider[providerFilter];
  }

  if (severityFilter) {
    return {
      total: findingsTotal,
      errors: severityFilter === "error" ? findingsTotal : base.errors,
      warnings: severityFilter === "warning" ? findingsTotal : base.warnings,
      infos: severityFilter === "info" ? findingsTotal : base.infos,
    };
  }

  if (providerFilter) {
    return base;
  }

  return {
    total: findingCounts.total,
    errors: findingCounts.errors,
    warnings: findingCounts.warnings,
    infos: findingCounts.infos,
  };
}

export function providerCount(
  findingCounts: SecurityFindingCounts | null,
  provider: "semgrep" | "bearer" | "custom" | "codeql",
): number {
  return findingCounts?.[provider] ?? 0;
}

export function severityBucketTotal(counts: { errors: number; warnings: number; infos: number }): number {
  return counts.errors + counts.warnings + counts.infos;
}

export function countsFromSummary(
  summary: { totalFindings: number; errors: number; warnings: number; infos: number } | null | undefined,
): Pick<SecurityFindingCounts, "total" | "errors" | "warnings" | "infos"> | null {
  if (!summary) return null;
  return {
    total: summary.totalFindings,
    errors: summary.errors,
    warnings: summary.warnings,
    infos: summary.infos,
  };
}

/** Keep a history-row summary in lockstep with the open scan's finding totals. */
export function withFindingCounts(
  scan: Scan,
  counts: Pick<SecurityFindingCounts, "total" | "errors" | "warnings" | "infos"> | null,
): Scan {
  if (!counts) return scan;
  const incoming = severityBucketTotal(counts);
  const existing = severityBucketTotal(scan.summary);
  // An empty in-flight fetch must not blank badges that already landed.
  if (incoming === 0 && existing > 0) return scan;
  if (
    scan.summary.totalFindings === counts.total
    && scan.summary.errors === counts.errors
    && scan.summary.warnings === counts.warnings
    && scan.summary.infos === counts.infos
  ) {
    return scan;
  }
  return {
    ...scan,
    summary: {
      ...scan.summary,
      totalFindings: Math.max(counts.total, incoming),
      errors: counts.errors,
      warnings: counts.warnings,
      infos: counts.infos,
    },
  };
}
