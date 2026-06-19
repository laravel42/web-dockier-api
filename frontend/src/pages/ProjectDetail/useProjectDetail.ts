import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi, deployApi, codeAnalysisApi } from "../../services/api";
import { parseOwnerRepo, getRepoKey } from "../../utils/parseOwnerRepo";
import {
  clearProjectBadgeCache,
  getProjectBadgeCache,
  setProjectBadgeCache,
  selectProjectBadges,
} from "../../utils/projectBadgeCache";
import { getErrorMessage } from "../../utils/errors";
import { parseApiTimestamp } from "../../utils/timeAgo";
import type { Project, Deployment as DeployInfo, Provider as ProviderInfo, RepoStats, CommitInfo, Scan, RepoIssue, RepoPullRequest } from "../../types";
import type { RepoAnalysis } from "../../components/DeployWizard";

// ─── Analysis cache (survives navigation within session) ───
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

// Pre-built analysis data for template projects (no repo analysis needed)
const TEMPLATE_ANALYSIS: Record<string, RepoAnalysis> = {
  wordpress: {
    techStack: [
      { name: "WordPress", category: "CMS", confidence: 1 },
      { name: "PHP", category: "Language", confidence: 1 },
      { name: "MySQL", category: "Database", confidence: 1 },
      { name: "Apache", category: "Server", confidence: 1 },
    ],
    deployOptions: [],
    detectedServices: [
      { type: "database", name: "MySQL", provider: "MySQL", confidence: 1 },
    ],
    repoSize: 0,
    primaryLanguage: "PHP",
    hasDocker: true,
    hasCi: false,
    aiAnalysis: {
      runtime: "php",
      runtimeVersion: "8.3",
      framework: "WordPress",
      frameworkVersion: "latest",
      buildCommand: "",
      startCommand: "apache2-foreground",
      port: 80,
      needsScheduler: false,
      needsQueueWorker: false,
      needsWebsockets: false,
      envVars: [
        "WORDPRESS_DB_HOST=host.docker.internal:3306",
        "WORDPRESS_DB_USER=wordpress",
        "WORDPRESS_DB_PASSWORD=wordpress",
        "WORDPRESS_DB_NAME=wordpress",
      ],
      postDeployCommands: [],
      nginxConfig: "reverse-proxy",
      summary: "WordPress CMS with MySQL database, served via Apache on port 80.",
    },
  },
};

export function useProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Header actions
  const [showDelete, setShowDelete] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // Pull from origin
  const [pullLog, setPullLog] = useState<string[] | null>(null);
  const [pullLoading, setPullLoading] = useState(false);

  // Branch selector
  const [branchList, setBranchList] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  // Stats & analysis
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Tech badges (from getRepoBadges — shared with card list)
  const [badges, setBadges] = useState<Array<{ name: string; category: string; confidence: number }>>([]);
  const [allBadges, setAllBadges] = useState<Array<{ name: string; category: string; confidence: number }>>([]);

  // Recent commits
  const [recentCommits, setRecentCommits] = useState<CommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState("");

  // Open issues
  const [openIssues, setOpenIssues] = useState<RepoIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState("");

  // Pull requests
  const [pullRequests, setPullRequests] = useState<RepoPullRequest[]>([]);
  const [pullRequestsLoading, setPullRequestsLoading] = useState(false);
  const [pullRequestsError, setPullRequestsError] = useState("");

  // Providers
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);

  // Deploy wizard
  const [showDeployWizard, setShowDeployWizard] = useState(false);

  // Recent deploys
  const [recentDeploys, setRecentDeploys] = useState<DeployInfo[]>([]);

  // Recent security scans
  const [recentScans, setRecentScans] = useState<Scan[]>([]);

  // Inline name edit
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Auto-open deploy wizard from navigation state
  useEffect(() => {
    if ((location.state as { openDeploy?: boolean })?.openDeploy) {
      setShowDeployWizard(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Fetch project, stats, analysis, providers
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    deployApi.listProviders()
      .then((res) => {
        setAllProviders(res.providers.map((p: { id: string; provider: string; label: string }) => ({ id: p.id, provider: p.provider, label: p.label })));
      })
      .catch(() => {});
    projectsApi.get(projectId)
      .then((p) => {
        setProject(p);

        // For template projects, use pre-built analysis data
        if (p.sourceType === "template" && p.template && TEMPLATE_ANALYSIS[p.template]) {
          setAnalysis(TEMPLATE_ANALYSIS[p.template]);
          setAnalysisLoading(false);
          // No stats to fetch for template projects
          return;
        }

        if (p.connectionId && p.repository) {
          const parsed = parseOwnerRepo(p.repository);
          if (parsed) {
            setStatsLoading(true);
            setStatsError("");
            gitApi.getRepoStats(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined, p.id)
              .then(setStats)
              .catch((err: unknown) => setStatsError(getErrorMessage(err, "Failed to load stats")))
              .finally(() => setStatsLoading(false));

            // Fetch badges (same source as card list)
            const repoKey = getRepoKey(p.repository);
            if (repoKey) {
              const branch = p.branch || "main";
              const cached = getProjectBadgeCache(p.id, repoKey, branch, p.connectionId || "");
              if (cached) {
                setBadges(cached);
              }
              gitApi.getRepoBadges(repoKey, branch, p.connectionId)
                .then((res) => {
                  const all = res.badges || [];
                  const selected = selectProjectBadges(all);
                  setProjectBadgeCache(p.id, repoKey, branch, p.connectionId || "", selected);
                  setBadges(selected);
                  setAllBadges(all);
                })
                .catch(() => {});
            }

            setCommitsLoading(true);
            setCommitsError("");
            gitApi.getRecentCommits(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined, 5)
              .then((res) => setRecentCommits(res.commits))
              .catch((err: unknown) => setCommitsError(getErrorMessage(err, "Failed to load commits")))
              .finally(() => setCommitsLoading(false));

            setIssuesLoading(true);
            setIssuesError("");
            gitApi.getOpenIssues(p.connectionId, parsed.owner, parsed.repo, 10)
              .then((res) => setOpenIssues(res.issues))
              .catch((err: unknown) => setIssuesError(getErrorMessage(err, "Failed to load issues")))
              .finally(() => setIssuesLoading(false));

            setPullRequestsLoading(true);
            setPullRequestsError("");
            gitApi.getPullRequests(p.connectionId, parsed.owner, parsed.repo, 10)
              .then((res) => setPullRequests(res.pullRequests))
              .catch((err: unknown) => setPullRequestsError(getErrorMessage(err, "Failed to load pull requests")))
              .finally(() => setPullRequestsLoading(false));

            setAnalysisLoading(true);
            setAnalysisError("");
            const cacheKey = `${parsed.owner}/${parsed.repo}:${p.branch || "main"}`;
            const cached = getCachedAnalysis(cacheKey);
            if (cached?.aiAnalysis) {
              setAnalysis(cached);
              setAnalysisLoading(false);
            } else {
              gitApi.analyzeRepo(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined, "openai", p.id)
                .then((res) => { setCachedAnalysis(cacheKey, res); setAnalysis(res); })
                .catch((err: unknown) => setAnalysisError(getErrorMessage(err, "Failed to analyze repo")))
                .finally(() => setAnalysisLoading(false));
            }

          }
        }
      })
      .catch((err: unknown) => setError(getErrorMessage(err, "Failed to load project")))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Fetch last deploy
  const fetchLastDeploy = () => {
    if (!project) return;
    deployApi.listDeployments()
      .then((res) => {
        const match = res.deployments
          .filter((d: DeployInfo) => d.projectId === project.id)
          .sort((a, b) => parseApiTimestamp(b.createdAt).getTime() - parseApiTimestamp(a.createdAt).getTime());
        setRecentDeploys(match.slice(0, 5));
      })
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLastDeploy(); }, [project?.id]);

  const fetchRecentScans = () => {
    if (!projectId) return;
    codeAnalysisApi.listScans(projectId)
      .then((res) => setRecentScans(res.scans.slice(0, 5)))
      .catch(() => setRecentScans([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRecentScans(); }, [projectId]);

  const handleUpdateName = async (name: string) => {
    if (!projectId || !project) return;
    setNameSaving(true);
    setNameError("");
    try {
      const updated = await projectsApi.update(projectId, { name });
      setProject(updated);
    } catch (err: unknown) {
      setNameError(getErrorMessage(err, "Failed to update project name"));
      throw err;
    } finally {
      setNameSaving(false);
    }
  };

  // Actions
  const handleDelete = async () => {
    if (!projectId || !project) return;
    // Clear all caches for this project
    const parsed = parseOwnerRepo(project.repository);
    if (parsed) {
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey).catch(() => {});
      gitApi.invalidateStatsCache(repoKey).catch(() => {});
      gitApi.invalidateAnalysisCache(repoKey).catch(() => {});
    }
    await projectsApi.delete(projectId);
    navigate("/projects");
  };

  const handlePullOrigin = async () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    setPullLoading(true);
    setPullLog(["$ git pull origin " + (project.branch || "main"), "Connecting to remote…"]);
    try {
      const res = await gitApi.pullOrigin(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", stats?.lastCommitHash);
      setPullLog(res.log);
      // Invalidate and re-run stack analysis + stats after pull
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey, project.branch || "main")
        .then(() => gitApi.getStackAnalysis(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, project.id))
        .catch(() => {});
      gitApi.invalidateStatsCache(repoKey, project.branch || "main").catch(() => {});
    } catch (err: unknown) {
      setPullLog((prev) => [...(prev || []), `error: ${(err as Error).message || "Pull failed"}`]);
    } finally {
      setPullLoading(false);
    }
  };

  const loadBranches = async () => {
    if (!project) return;
    setBranchSearch("");
    setBranchLoading(true);
    try {
      const parsed = parseOwnerRepo(project.repository);
      if (parsed) {
        const res = await gitApi.listBranches(project.connectionId, parsed.owner, parsed.repo);
        setBranchList(res.branches);
      }
    } catch {
      setBranchList([]);
    } finally {
      setBranchLoading(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    if (!project || !projectId) return;
    const parsed = parseOwnerRepo(project.repository);
    if (parsed) {
      // Invalidate stack cache + stats and re-run for the new branch
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey)
        .then(() => gitApi.getStackAnalysis(project.connectionId, parsed.owner, parsed.repo, branch, project.id))
        .catch(() => {});
      gitApi.invalidateStatsCache(repoKey).catch(() => {});
    }
    await projectsApi.update(projectId, { branch });
    window.location.reload();
  };

  return {
    project, setProject, loading, error,
    navigate,
    // Header
    showDelete, setShowDelete, headerMenuOpen, setHeaderMenuOpen,
    handleDelete, handlePullOrigin,
    handleUpdateName, nameSaving, nameError,
    // Deploy wizard
    showDeployWizard, setShowDeployWizard,
    allProviders,
    analysis, analysisLoading, analysisError,
    fetchLastDeploy,
    refreshAnalysis: async () => {
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
      // Re-run analysis. Merge over the previous result so a degraded re-run
      // (e.g. AI sections or dependencies missing from the response) doesn't
      // wipe content that other tabs are already showing.
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
    },
    // Stats
    stats, statsLoading, statsError,
    badges, allBadges,
    // Recent commits
    recentCommits, commitsLoading, commitsError,
    // Open issues
    openIssues, setOpenIssues, issuesLoading, issuesError,
    // Pull requests
    pullRequests, pullRequestsLoading, pullRequestsError,
    // Branch selector
    loadBranches,
    branchList, branchLoading, branchSearch, setBranchSearch,
    handleSwitchBranch,
    // Pull log
    pullLog, setPullLog, pullLoading,
    // Recent deploys
    recentDeploys,
    recentScans,
  };
}
