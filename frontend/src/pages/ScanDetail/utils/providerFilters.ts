/**
 * The engine tabs on the findings list, and what to say when one comes back
 * empty.
 *
 * Data and a pure function rather than part of FindingsList.tsx, so that file
 * only exports components and keeps working with Fast Refresh.
 */

export type ProviderKey = "semgrep" | "sonarqube" | "custom";

export const PROVIDER_DEFS: Array<{
  key: string;
  label: string;
  countKey: ProviderKey | null;
}> = [
  { key: "", label: "All", countKey: null },
  // Semgrep is also the catch-all bucket: findingProvider() on the backend
  // returns it for any rule id without a known prefix, so a new engine whose
  // prefix is not registered there lands under this tab rather than its own.
  { key: "semgrep", label: "Semgrep", countKey: "semgrep" },
  { key: "custom", label: "Custom rules", countKey: "custom" },
  { key: "sonarqube", label: "SonarQube", countKey: "sonarqube" },
];

/**
 * What to say when the filtered list comes back empty.
 *
 * Phrased as a statement about the engine rather than about the filter, because
 * an engine that found nothing is the common and reassuring case — the scan ran
 * and there is nothing to fix. The previous wording ("No findings match Semgrep
 * and severity \"error\"") described the query instead of the answer, and read
 * as though something had gone wrong.
 *
 * This is also the reply when an engine has nothing in the whole scan. Its tab
 * stays selected on purpose — the hook no longer moves the user to All behind
 * their back — so this text carries the answer.
 */
export function emptyFilterMessage(severityFilter: string, providerFilter: string): string {
  const engine = providerFilter
    ? (PROVIDER_DEFS.find((p) => p.key === providerFilter)?.label ?? providerFilter)
    : "";
  const severity = severityFilter ? ` with severity "${severityFilter}"` : "";

  if (engine) return `No ${engine} findings${severity} in this scan.`;
  if (severity) return `No findings${severity} in this scan.`;
  return "No security findings for this scan.";
}
