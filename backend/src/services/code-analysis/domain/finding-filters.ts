/** Schema-parsed sensitive-data findings belong in project info, not security scans. */
export const SENSITIVE_DATA_RULE_PREFIX = "sensitive-data.";

export type FindingProvider = "semgrep" | "sonarqube" | "custom";

export function isSensitiveDataFinding(ruleId: string): boolean {
  return ruleId.startsWith(SENSITIVE_DATA_RULE_PREFIX);
}

/** Unknown prefixes fall through to semgrep: a new engine needs its branch here or it is mislabelled. */
export function findingProvider(ruleId: string): FindingProvider {
  if (ruleId.startsWith("sonar.")) return "sonarqube";
  if (ruleId.startsWith("custom.")) return "custom";
  return "semgrep";
}

/** Secret-detection rules: the opengrep corpus keeps all of them under `generic.secrets.`. */
const SECRET_RULE_PREFIXES = ["generic.secrets."];
const SECRET_RULE_IDS = new Set(["custom.auth.hardcoded-secret"]);

export function isSecretDetectionFinding(ruleId: string): boolean {
  return (
    SECRET_RULE_IDS.has(ruleId) || SECRET_RULE_PREFIXES.some((prefix) => ruleId.startsWith(prefix))
  );
}

/** In a test, an http:// URL is an input to the code under test, never a connection the product makes. */
const TEST_FIXTURE_RULE_IDS = new Set(["custom.generic.http-no-tls"]);

export function isTestFixtureFinding(ruleId: string): boolean {
  return isSecretDetectionFinding(ruleId) || TEST_FIXTURE_RULE_IDS.has(ruleId);
}

/**
 * Drop test-file hits of the rules that only ever flag fixtures there. Filters
 * findings rather than skipping test files: an injection in a test is still real.
 */
export function dropFixtureFindingsInTests<T extends { ruleId: string; filePath: string }>(
  findings: T[],
  isTestPath: (filePath: string) => boolean,
): { kept: T[]; dropped: number } {
  const kept = findings.filter(
    (finding) => !(isTestFixtureFinding(finding.ruleId) && isTestPath(finding.filePath)),
  );
  return { kept, dropped: findings.length - kept.length };
}
