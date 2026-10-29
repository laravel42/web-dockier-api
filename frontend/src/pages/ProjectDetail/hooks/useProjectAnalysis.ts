import { useState, useEffect } from "react";
import { gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { clearProjectBadgeCache } from "@/utils/projectBadgeCache";
import { SessionCache } from "@/pages/ProjectDetail/utils/sessionCache";
import { getErrorMessage } from "@/utils/errors";
import type { Project } from "@/types";
import type { RepoAnalysis } from "@/components/DeployWizard";
import { TEMPLATE_ANALYSIS } from "../constants/templateAnalysis";

// ─── Analysis session cache ────────────────────────────────────────
// v13: the analysis schema gained `detectedDbEngine` (authoritative DB engine
// from .env.example, so the wizard stops showing the AI's guessed Postgres for
// a MySQL project). v12 added `staticCapable`. Bumping discards analyses cached
// before each field existed, which would otherwise keep showing stale/guessed
// values.
// v14: Nuxt/Next static-capability re-evaluated (a `nuxt generate` script and a
// real `output: 'export'` match are now detected), so pre-fix verdicts must be
// discarded.
// v15: the analysis schema gained `multiService`, so pre-field cached analyses
// would never show the multi-service warning.
// v16: the analysis schema gained `compose` (compose files, their services, the
// entry service and the variables a deploy requires). Without a bump, a repo
// analysed before it existed would still be offered only a single-service
// deploy.
const analysisCache = new SessionCache<RepoAnalysis>("analysis", 16);


/**
 * AI-powered repository analysis with session-storage caching and refresh.
 */
export function useProjectAnalysis(project: Project | null) {
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    if (!project) return;

    // Template projects use pre-built data
    if (project.sourceType === "template" && project.template && TEMPLATE_ANALYSIS[project.template]) {
      setAnalysis(TEMPLATE_ANALYSIS[project.template]);
      setAnalysisLoading(false);
      return;
    }

    if (!project.connectionId || !project.repository) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    setAnalysisLoading(true);
    setAnalysisError("");
    const cacheKey = `${parsed.owner}/${parsed.repo}:${project.branch || "main"}`;
    const cached = analysisCache.get(cacheKey);
    if (cached?.aiAnalysis) {
      setAnalysis(cached);
      setAnalysisLoading(false);
    } else {
      gitApi.analyzeRepo(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, "openai", project.id)
        .then((res) => { analysisCache.set(cacheKey, res); setAnalysis(res); })
        .catch((err: unknown) => setAnalysisError(getErrorMessage(err, "Failed to analyze repo")))
        .finally(() => setAnalysisLoading(false));
    }
    // Fields, not the whole `project`: the parent hands down a new object on
    // every refresh, and depending on it would re-fire the paid OpenAI analysis
    // for changes that cannot affect its result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.connectionId, project?.repository, project?.branch, project?.sourceType, project?.template]);

  const refreshAnalysis = async () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const repoKey = `${parsed.owner}/${parsed.repo}`;
    const cacheKey = `${repoKey}:${project.branch || "main"}`;
    // Clear all caches
    analysisCache.remove(cacheKey);
    clearProjectBadgeCache(project.id);
    await Promise.all([
      gitApi.invalidateAnalysisCache(repoKey, project.branch || "main").catch(() => {}),
      gitApi.invalidateStackCache(repoKey, project.branch || "main").catch(() => {}),
      gitApi.invalidateStatsCache(repoKey, project.branch || "main").catch(() => {}),
    ]);
    // Re-run analysis with merge strategy
    setAnalysisLoading(true);
    setAnalysisError("");
    gitApi.analyzeRepo(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, "openai", project.id)
      .then((res) => {
        setAnalysis((prev) => {
          const merged: RepoAnalysis = prev
            ? {
                ...prev,
                ...res,
                aiAnalysis: res.aiAnalysis ?? prev.aiAnalysis,
                dependencies: res.dependencies ?? prev.dependencies,
              }
            : res;
          analysisCache.set(cacheKey, merged);
          return merged;
        });
      })
      .catch((err: unknown) => setAnalysisError((err as Error).message || "Failed to analyze repo"))
      .finally(() => setAnalysisLoading(false));
    // Re-run stack analysis in background
    gitApi.getStackAnalysis(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, project.id)
      .catch(() => {});
  };

  return { analysis, analysisLoading, analysisError, refreshAnalysis };
}
