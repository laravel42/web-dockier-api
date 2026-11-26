/**
 * Turning a cached analysis into tech badges.
 *
 * Extracted so the single-repo route and the batch route cannot drift: if they
 * read the same cache rows but shape them differently, the same project shows
 * different badges depending on which page you opened.
 *
 * No imports, so it stays testable without initialising config.
 */

export interface TechBadge {
  name: string;
  category: string;
  confidence: number;
}

/**
 * `stack_cache` holds the multi-service stack analysis. It carries no
 * per-tech confidence, so the 90 is a stand-in for "detected by the stack
 * analyser", which is a stronger signal than a plain file match.
 */
export function badgesFromStackResult(result: unknown): TechBadge[] {
  const parsed = result as { components?: Array<{ techs?: string[] }> } | null;
  if (!parsed) return [];
  const names = new Set<string>();
  for (const component of parsed.components ?? []) {
    for (const tech of component.techs ?? []) names.add(tech);
  }
  return Array.from(names).map((name) => ({ name, category: "framework", confidence: 90 }));
}

/** `analysis_cache` holds runRepoAnalysis output, which carries its own confidences. */
export function badgesFromAnalysisResult(result: unknown): TechBadge[] {
  const parsed = result as { techStack?: TechBadge[] } | null;
  if (!parsed) return [];
  return (parsed.techStack ?? []).map((item) => ({
    name: item.name,
    category: item.category,
    confidence: item.confidence,
  }));
}

/** Cache rows are keyed by repo AND branch, so both belong in the lookup key. */
export function badgeCacheKey(repo: string, branch: string): string {
  return `${repo}@${branch}`;
}
