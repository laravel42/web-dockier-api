/** Schema-parsed sensitive-data findings belong in project info, not security scans. */
export const SENSITIVE_DATA_RULE_PREFIX = "sensitive-data.";

export function isSensitiveDataFinding(ruleId: string): boolean {
  return ruleId.startsWith(SENSITIVE_DATA_RULE_PREFIX);
}
