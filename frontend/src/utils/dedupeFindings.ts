import type { Finding } from "../types";

/** Collapse duplicate issue rows (same rule, file, and line span). */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  const severityRank: Record<Finding["severity"], number> = {
    error: 3,
    warning: 2,
    info: 1,
  };

  for (const finding of findings) {
    const key = `${finding.ruleId}\0${finding.filePath}\0${finding.startLine}\0${finding.endLine}`;
    const existing = byKey.get(key);
    if (!existing || severityRank[finding.severity] > severityRank[existing.severity]) {
      byKey.set(key, finding);
    }
  }

  return Array.from(byKey.values());
}
