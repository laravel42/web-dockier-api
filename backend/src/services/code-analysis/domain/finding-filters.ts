/** Schema-parsed sensitive-data findings belong in project info, not security scans. */
export const SENSITIVE_DATA_RULE_PREFIX = "sensitive-data.";

export type FindingProvider = "semgrep" | "bearer" | "custom" | "codeql";

export function isSensitiveDataFinding(ruleId: string): boolean {
  return ruleId.startsWith(SENSITIVE_DATA_RULE_PREFIX);
}

export function findingProvider(ruleId: string): FindingProvider {
  if (ruleId.startsWith("bearer.")) return "bearer";
  if (ruleId.startsWith("sonar.")) return "bearer";
  if (ruleId.startsWith("custom.")) return "custom";
  if (ruleId.startsWith("codeql.")) return "codeql";
  return "semgrep";
}
