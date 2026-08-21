import type { ProviderSeverityCounts, SecurityFindingCounts } from "@/types";

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

  if (providerFilter === "semgrep" || providerFilter === "sonar" || providerFilter === "custom") {
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
  provider: "semgrep" | "sonar" | "custom",
): number {
  return findingCounts?.[provider] ?? 0;
}
