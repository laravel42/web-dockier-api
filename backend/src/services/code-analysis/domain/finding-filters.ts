/** Schema-parsed sensitive-data findings belong in project info, not security scans. */
export const SENSITIVE_DATA_RULE_PREFIX = "sensitive-data.";

export type FindingProvider = "semgrep" | "sonarqube" | "custom";

export function isSensitiveDataFinding(ruleId: string): boolean {
  return ruleId.startsWith(SENSITIVE_DATA_RULE_PREFIX);
}

/**
 * The prefix names the engine, and `sonar.` is the only one SonarQube writes
 * (see parseSonarIssues in sonarqube.ts).
 *
 * This used to report `sonar.` findings as a provider called "bearer", which is
 * how the whole UI came to label SonarQube's output as Bearer — a half-finished
 * rename, not a real engine. Anything that does not match a known prefix falls
 * through to semgrep, so a new engine needs its branch added here or its
 * findings are silently attributed to Semgrep.
 */
export function findingProvider(ruleId: string): FindingProvider {
  if (ruleId.startsWith("sonar.")) return "sonarqube";
  if (ruleId.startsWith("custom.")) return "custom";
  return "semgrep";
}
