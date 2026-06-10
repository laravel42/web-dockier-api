const SENSITIVE_DATA_RULE_PREFIX = "sensitive-data.";

export function isSensitiveDataFinding(ruleId: string): boolean {
  return ruleId.startsWith(SENSITIVE_DATA_RULE_PREFIX);
}

export function filterSecurityFindings<T extends { ruleId: string }>(findings: T[]): T[] {
  return findings.filter((finding) => !isSensitiveDataFinding(finding.ruleId));
}
