import { useState, useEffect } from "react";
import { gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { clearProjectBadgeCache } from "@/utils/projectBadgeCache";
import { getErrorMessage } from "@/utils/errors";
import type { Project } from "@/types";
import type { RepoAnalysis } from "@/components/DeployWizard";
import { TEMPLATE_ANALYSIS } from "../constants/templateAnalysis";

// ─── Analysis session cache ────────────────────────────────────────
const CACHE_VERSION = 11;
function getCachedAnalysis(key: string): RepoAnalysis | null {
  try {
    const raw = sessionStorage.getItem(`analysis:v${CACHE_VERSION}:${key}`);
    return raw ? JSON.parse(raw) as RepoAnalysis : null;
  } catch { return null; }
}
function setCachedAnalysis(key: string, data: RepoAnalysis) {
  try { sessionStorage.setItem(`analysis:v${CACHE_VERSION}:${key}`, JSON.stringify(data)); } catch { /* quota */ }
}


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
    const cached = getCachedAnalysis(cacheKey);
    if (cached?.aiAnalysis) {
      setAnalysis(cached);
      setAnalysisLoading(false);
    } else {
      gitApi.analyzeRepo(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, "openai", project.id)
        .then((res) => { setCachedAnalysis(cacheKey, res); setAnalysis(res); })
        .catch((err: unknown) => setAnalysisError(getErrorMessage(err, "Failed to analyze repo")))
        .finally(() => setAnalysisLoading(false));
    }
  }, [project?.id, project?.connectionId, project?.repository, project?.branch, project?.sourceType, project?.template]);

  const refreshAnalysis = async () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const repoKey = `${parsed.owner}/${parsed.repo}`;
    const cacheKey = `${repoKey}:${project.branch || "main"}`;
    // Clear all caches
    try { sessionStorage.removeItem(`analysis:v${CACHE_VERSION}:${cacheKey}`); } catch { /* ignore */ }
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
          setCachedAnalysis(cacheKey, merged);
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
