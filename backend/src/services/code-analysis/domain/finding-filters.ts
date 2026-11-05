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

/**
 * Rule ids that look for hard-coded credentials.
 *
 * The opengrep corpus namespaces all 225 of them under `generic.secrets.`
 * (`generic.secrets.gitleaks.*`, 175, and `generic.secrets.security.*`, 50), and
 * the id is persisted intact, so the prefix is the whole test. Dockier's own
 * regex rule for the same job is named explicitly.
 *
 * A new engine with its own secret rules needs adding here, or its findings keep
 * reporting test fixtures.
 */
const SECRET_RULE_PREFIXES = ["generic.secrets."];
const SECRET_RULE_IDS = new Set(["custom.auth.hardcoded-secret"]);

export function isSecretDetectionFinding(ruleId: string): boolean {
  return (
    SECRET_RULE_IDS.has(ruleId) || SECRET_RULE_PREFIXES.some((prefix) => ruleId.startsWith(prefix))
  );
}

/**
 * Drop secret findings that point at test code.
 *
 * A test fixture holds fake credentials on purpose, so a secret rule firing
 * there is a false positive by construction — not a judgement call. On the first
 * real scan with Semgrep enabled, 3 of the 5 secret findings were fixtures
 * (`vault.test.ts`, `vault-note-language.test.ts`, `password-recovery.test.ts`),
 * a 60% false-positive rate in the category users check first.
 *
 * Scoped to secret rules alone, and applied to findings rather than to the file
 * walk, because tests themselves are still worth scanning: a test can call an
 * unsafe API for real, and an injection or XSS finding there says something true
 * about the code under test. Excluding the directories outright — which is what
 * the deleted Bearer engine did with `skipTest` — would throw that away too.
 */
export function dropSecretFindingsInTests<T extends { ruleId: string; filePath: string }>(
  findings: T[],
  isTestPath: (filePath: string) => boolean,
): { kept: T[]; dropped: number } {
  const kept = findings.filter(
    (finding) => !(isSecretDetectionFinding(finding.ruleId) && isTestPath(finding.filePath)),
  );
  return { kept, dropped: findings.length - kept.length };
}
