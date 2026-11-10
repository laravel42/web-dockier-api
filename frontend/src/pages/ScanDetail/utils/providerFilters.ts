/** Kept out of FindingsList.tsx so that file exports only components (Fast Refresh). */

import type { SkippedEngine } from "@/types";

export type ProviderKey = "semgrep" | "sonarqube" | "custom";

export const PROVIDER_DEFS: Array<{
  key: string;
  label: string;
  countKey: ProviderKey | null;
}> = [
  { key: "", label: "All", countKey: null },
  // Also the catch-all: the backend files any unknown rule prefix under semgrep.
  { key: "semgrep", label: "Semgrep", countKey: "semgrep" },
  { key: "custom", label: "Custom rules", countKey: "custom" },
  { key: "sonarqube", label: "SonarQube", countKey: "sonarqube" },
];

/** Answers about the engine, not the query: an engine that found nothing is the reassuring case. */
export function emptyFilterMessage(
  severityFilter: string,
  providerFilter: string,
  skippedEngines: SkippedEngine[] = [],
): string {
  const engine = providerFilter
    ? (PROVIDER_DEFS.find((p) => p.key === providerFilter)?.label ?? providerFilter)
    : "";
  // "Did not run" must not be answered with "found nothing".
  const skipped = skippedEngines.find((e) => e.engine === providerFilter);
  if (engine && skipped) return `${engine} ${skipped.reason}, so this scan has no ${engine} results.`;
  const severity = severityFilter ? ` with severity "${severityFilter}"` : "";

  if (engine) return `No ${engine} findings${severity} in this scan.`;
  if (severity) return `No findings${severity} in this scan.`;
  return "No security findings for this scan.";
}
