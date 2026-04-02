import { api } from "encore.dev/api";
import { db } from "../shared";

interface TechBadge {
  name: string;
  category: string;
  confidence: number;
}

/**
 * Returns language/framework badges from analysis_cache for a given repo.
 * Filters to category "language" or "framework" with confidence >= 90.
 */
export const getRepoBadges = api(
  { method: "GET", path: "/git/repo-badges", auth: true },
  async (params: { repo: string; branch?: string }): Promise<{ badges: TechBadge[] }> => {
    const branch = params.branch || "main";

    const cached = await db.queryRow<{ result: string }>`
      SELECT result FROM analysis_cache WHERE repo = ${params.repo} AND branch = ${branch}`;

    if (!cached) return { badges: [] };

    try {
      const parsed = JSON.parse(cached.result);
      const techStack: TechBadge[] = parsed.techStack || [];
      const badges = techStack.filter(
        (t) => (t.category === "language" || t.category === "framework") && t.confidence >= 90
      );
      return { badges };
    } catch {
      return { badges: [] };
    }
  }
);
