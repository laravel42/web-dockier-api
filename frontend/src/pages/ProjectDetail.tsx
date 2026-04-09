import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../services/api";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import DeployWizard from "../components/DeployWizard";
import ProviderBadge from "../components/ProviderBadge";

const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  createdAt: string;
}

interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  languages: Record<string, number>;
  lastCommitDate: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  lastCommitHash: string;
  totalCommits: number;
  contributors: number;
  topContributors: Array<{ name: string; avatarUrl: string; commits: number; profileUrl: string }>;
}

interface DetectedService {
  type: string;
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

interface RepoAnalysis {
  techStack: Array<{ name: string; category: string; confidence: number }>;
  deployOptions: Array<{
    provider: string;
    type: string;
    description: string;
    pros: string[];
    cons: string[];
    estimatedMonthlyCost: string;
    bestFor: string;
  }>;
  detectedServices: DetectedService[];
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
  aiAnalysis?: {
    runtime: string;
    runtimeVersion: string;
    framework: string;
    frameworkVersion: string;
    phpExtensions?: string[];
    nodeVersion?: string;
    buildCommand: string;
    startCommand: string;
    port: number;
    needsScheduler: boolean;
    needsQueueWorker: boolean;
    needsWebsockets: boolean;
    envVars: string[];
    postDeployCommands: string[];
    nginxConfig: "php-fpm" | "reverse-proxy" | "static";
    summary: string;
    deployOptions?: Array<{
      provider: string;
      type: string;
      description: string;
      pros: string[];
      cons: string[];
      estimatedMonthlyCost: string;
      bestFor: string;
    }>;
  };
}

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      // For GitLab nested groups: group/subgroup/repo → owner=group/subgroup, repo=repo
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, parts.length - 1).join("/");
      return { owner, repo };
    }
  } catch {}
  return null;
}

const langColors = [
  "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-sky-500",
];

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [pullLog, setPullLog] = useState<string[] | null>(null);
  const [pullLoading, setPullLoading] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchList, setBranchList] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [_expandedOption, _setExpandedOption] = useState<number | null>(null);
  const [_userProviders, setUserProviders] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState<Array<{ id: string; provider: string; label: string }>>([]);
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);

  // Last deploy
  interface DeployInfo { id: string; providerId: string; repo: string; branch: string; status: string; appUrl: string; commitHash: string; dockerImage: string; deployStrategy: string; createdAt: string; }
  const [lastDeploy, setLastDeploy] = useState<DeployInfo | null>(null);

  useEffect(() => {
    if ((location.state as { openDeploy?: boolean })?.openDeploy) {
      setShowDeployWizard(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    // Fetch user's configured deploy providers in parallel
    deployApi.listProviders()
      .then((res) => {
        setUserProviders(res.providers.map((p: any) => p.provider));
        setAllProviders(res.providers.map((p: any) => ({ id: p.id, provider: p.provider, label: p.label })));
      })
      .catch(() => {});
    projectsApi.get(projectId)
      .then((p) => {
        setProject(p);
        if (p.connectionId && p.repository) {
          const parsed = parseOwnerRepo(p.repository);
          if (parsed) {
            // Fetch stats
            setStatsLoading(true);
            setStatsError("");
            gitApi.getRepoStats(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined)
              .then(setStats)
              .catch((err: any) => setStatsError(err.message || "Failed to load stats"))
              .finally(() => setStatsLoading(false));
            // Fetch analysis (with AI if configured)
            setAnalysisLoading(true);
            setAnalysisError("");
            let aiType: string | undefined;
            let aiApiKey: string | undefined;
            const bedrockModel = localStorage.getItem("bedrock_default_model");
            if (bedrockModel) { aiType = "bedrock"; aiApiKey = bedrockModel; }
            gitApi.analyzeRepo(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined, aiType, aiApiKey)
              .then(setAnalysis)
              .catch((err: any) => setAnalysisError(err.message || "Failed to analyze repo"))
              .finally(() => setAnalysisLoading(false));
          }
        }
      })
      .catch((err: any) => setError(err.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Fetch last deploy for this project
  const fetchLastDeploy = () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const repoKey = `${parsed.owner}/${parsed.repo}`;
    deployApi.listDeployments()
      .then((res) => {
        const match = res.deployments.filter((d: DeployInfo) => d.repo === repoKey);
        setLastDeploy(match.length > 0 ? match[0] : null);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchLastDeploy(); }, [project]);

  const handleDelete = async () => {
    if (!projectId) return;
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
    } catch (err: any) {
      setPullLog((prev) => [...(prev || []), `error: ${err.message || "Pull failed"}`]);
    } finally {
      setPullLoading(false);
    }
  };

  const handleOpenBranchModal = async () => {
    if (!project) return;
    setShowBranchModal(true);
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
    await projectsApi.update(projectId, { branch });
    setShowBranchModal(false);
    window.location.reload();
  };



  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Project not found"}</p>
        <button onClick={() => navigate("/projects")} className={btnSecondary}>Back to Projects</button>
      </div>
    );
  }

  const kpiCards = [
    { label: "Stars", value: stats?.stars ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    )},
    { label: "Forks", value: stats?.forks ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
    )},
    { label: "Open Issues", value: stats?.openIssues ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    )},
    { label: "Watchers", value: stats?.watchers ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { label: "Commits", value: stats?.totalCommits ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    )},
    { label: "Contributors", value: stats?.contributors ?? "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )},
  ];

  return (
    <div>
      <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Projects
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text">{project.name}</h1>
            <p className="text-sm text-text-muted">Created {new Date(project.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="relative flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowDeployWizard(true)}
            className={btnPrimary + " flex items-center gap-1.5"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            </svg>
            Deploy
          </button>

          <button
            type="button"
            onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary-50 hover:bg-secondary-100 transition-colors text-sm font-medium text-text"
          >
            Actions
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${headerMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {headerMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-card shadow-lg border border-border py-1">
                <button
                  type="button"
                  onClick={() => { setHeaderMenuOpen(false); handlePullOrigin(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-secondary-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Pull from origin
                </button>
                <button
                  type="button"
                  onClick={() => { setHeaderMenuOpen(false); handleOpenBranchModal(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-secondary-50 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  Switch branch
                </button>
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  onClick={() => { setHeaderMenuOpen(false); setShowDelete(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-500 hover:bg-danger-500/5 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete project
                </button>
              </div>
            </>
          )}
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={`${cardCls} p-5`}>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              {project.repository ? (
                <a href={project.repository} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors truncate">{project.repository}</a>
              ) : (
                <span className="text-sm text-text-muted">No repository linked</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              {project.branch && project.repository ? (
                <a href={`${project.repository}/-/tree/${project.branch}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors">{project.branch}</a>
              ) : project.branch ? (
                <span className="text-sm text-text-secondary">{project.branch}</span>
              ) : (
                <span className="text-sm text-text-muted">No branch selected</span>
              )}
            </div>
            {stats?.lastCommitAuthor && (
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span className="text-sm text-text-secondary">{stats.lastCommitAuthor}</span>
                {stats.lastCommitHash ? (
                  <a href={`${project.repository}/-/commit/${stats.lastCommitHash}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary-500 hover:text-primary-700 transition-colors">{stats.lastCommitHash.slice(0, 7)}</a>
                ) : (
                  <span className="text-xs text-text-muted">last commit</span>
                )}
              </div>
            )}
            {stats?.lastCommitMessage && (
              <div className="flex items-start gap-2 pt-2 mt-2 border-t border-border">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-text-muted shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm text-text truncate">{stats.lastCommitMessage}</p>
                  {stats.lastCommitDate && <p className="text-xs text-text-muted mt-0.5">{new Date(stats.lastCommitDate).toLocaleString()}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={`${cardCls} p-5`}>
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Details</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted">Project ID</p>
              <p className="text-sm text-text-secondary font-mono mt-0.5">{project.id}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Created</p>
              <p className="text-sm text-text-secondary mt-0.5">{new Date(project.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Dashboard */}
      {project.connectionId && project.repository && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository KPIs</h2>
          {statsLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : statsError ? (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-500">{statsError}</div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {kpiCards.map((kpi) => (
                  <div key={kpi.label} className={`${cardCls} p-4 text-center`}>
                    <div className="flex justify-center text-primary-500 mb-2">{kpi.icon}</div>
                    <p className="text-xl font-bold text-text">{typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}</p>
                    <p className="text-xs text-text-muted mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>
              {/* Languages breakdown */}
              {stats.languages && Object.keys(stats.languages).length > 0 && (
                <div className={`${cardCls} p-4 mt-3`}>
                  <p className="text-xs text-text-muted mb-3">Languages</p>
                  <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
                    {Object.entries(stats.languages)
                      .sort(([, a], [, b]) => b - a)
                      .map(([lang, pct], i) => (
                        <div
                          key={lang}
                          className={`${langColors[i % langColors.length]}`}
                          style={{ width: `${Math.max(pct, 1)}%` }}
                          title={`${lang}: ${pct}%`}
                        />
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {Object.entries(stats.languages)
                      .sort(([, a], [, b]) => b - a)
                      .map(([lang, pct], i) => (
                        <div key={lang} className="flex items-center gap-1.5 text-xs">
                          <span className={`w-2.5 h-2.5 rounded-full ${langColors[i % langColors.length]}`} />
                          <span className="text-text-secondary">{lang}</span>
                          <span className="text-text-muted">{pct}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Contributors */}
      {stats && stats.topContributors && stats.topContributors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Contributors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {stats.topContributors.map((c) => (
              <div key={c.name} className={`${cardCls} p-4 flex items-center gap-3`}>
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={c.name} className="w-10 h-10 rounded-full shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {c.profileUrl ? (
                    <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate block">{c.name}</a>
                  ) : (
                    <p className="text-sm font-medium text-text truncate">{c.name}</p>
                  )}
                  <p className="text-xs text-text-muted">{c.commits} commit{c.commits !== 1 ? "s" : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Deploy */}
      {lastDeploy && (() => {
        const prov = allProviders.find(p => p.id === lastDeploy.providerId);
        const provKey = prov?.provider || "";
        const strategyLabels: Record<string, string> = { vps: "VPS", managed: "ECS Fargate", serverless: "App Runner" };
        const statusColors: Record<string, string> = { success: "bg-success-500/10 text-success-500", failed: "bg-danger-500/10 text-danger-500", building: "bg-warning-500/10 text-warning-500", deploying: "bg-primary-500/10 text-primary-500", pending: "bg-secondary-100 text-text-muted", destroyed: "bg-secondary-100 text-text-muted" };
        return (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Last Deploy</h2>
            <div className={`${cardCls} p-5`}>
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[lastDeploy.status] || "bg-secondary-100 text-text-muted"}`}>{lastDeploy.status}</span>
                <ProviderBadge provider={provKey} suffix={` · ${strategyLabels[lastDeploy.deployStrategy] || lastDeploy.deployStrategy}`} iconSize="w-3 h-3" />
                <span className="text-xs text-text-muted ml-auto">{new Date(lastDeploy.createdAt).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Branch</p>
                  <p className="text-sm text-text font-medium mt-0.5">{lastDeploy.branch}</p>
                </div>
                {lastDeploy.commitHash && (
                  <div>
                    <p className="text-xs text-text-muted">Commit</p>
                    <p className="text-sm text-text font-mono mt-0.5">{lastDeploy.commitHash.slice(0, 8)}</p>
                  </div>
                )}
                {lastDeploy.appUrl && (
                  <div>
                    <p className="text-xs text-text-muted">App URL</p>
                    <a href={lastDeploy.appUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors mt-0.5 block truncate">
                      {lastDeploy.appUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
                {lastDeploy.dockerImage && (
                  <div>
                    <p className="text-xs text-text-muted">Docker Image</p>
                    <p className="text-sm text-text font-mono mt-0.5 truncate" title={lastDeploy.dockerImage}>{lastDeploy.dockerImage.split("/").pop()?.split(":")[0] || lastDeploy.dockerImage}</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-text-muted">{prov?.label || provKey}</span>
                <div className="flex items-center gap-3">
                  {(lastDeploy.status === "success") && (
                    <button
                      disabled={destroying}
                      onClick={() => setShowDestroyConfirm(true)}
                      className="text-xs text-danger-500 hover:text-danger-700 font-medium transition-colors disabled:opacity-50"
                    >
                      {destroying ? "Destroying…" : "Destroy"}
                    </button>
                  )}
                  <button onClick={() => navigate(`/deploy/${lastDeploy.id}`)} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">
                    View details →
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Deploy Wizard */}
      <DeployWizard
        open={showDeployWizard}
        onClose={() => setShowDeployWizard(false)}
        project={project}
        analysis={analysis}
        analysisLoading={analysisLoading}
        analysisError={analysisError}
        providers={allProviders}
        onDeployComplete={() => fetchLastDeploy()}
      />

      <ConfirmModal open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} message={`Are you sure you want to delete "${project.name}"?`} />

      <ConfirmModal
        open={showDestroyConfirm}
        onClose={() => setShowDestroyConfirm(false)}
        title="Destroy Deployment"
        message="This will destroy all cloud infrastructure for this deployment (servers, firewall rules, static IPs, etc). This action cannot be undone."
        confirmLabel="Destroy"
        onConfirm={async () => {
          if (!lastDeploy) return;
          setDestroying(true);
          try {
            const res = await deployApi.destroyDeployment(lastDeploy.id);
            if (res.success) {
              setLastDeploy({ ...lastDeploy, status: "destroyed", appUrl: "" });
              fetchLastDeploy();
            } else {
              setError(res.message);
            }
          } catch (e: any) {
            setError(e.message || "Failed to destroy deployment");
          }
          setDestroying(false);
        }}
      />

      {/* Pull from origin log modal */}
      <Modal open={pullLog !== null} onClose={() => setPullLog(null)} title="Pull from Origin">
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs leading-relaxed text-green-400 max-h-80 overflow-y-auto">
          {pullLog?.map((line, i) => (
            <div key={i} className={line.startsWith("error:") ? "text-red-400" : ""}>{line}</div>
          ))}
          {pullLoading && (
            <div className="flex items-center gap-2 mt-1 text-gray-400">
              <div className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              Fetching…
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={() => setPullLog(null)} className={btnSecondary}>Close</button>
        </div>
      </Modal>

      {/* Switch branch modal */}
      <Modal open={showBranchModal} onClose={() => setShowBranchModal(false)} title="Switch Branch">
        <input
          type="text"
          placeholder="Search branches…"
          value={branchSearch}
          onChange={(e) => setBranchSearch(e.target.value)}
          className="w-full h-9 px-3 rounded-lg border border-border bg-secondary-50 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/30 mb-3"
        />
        {branchLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {branchList
              .filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
              .map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleSwitchBranch(b)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                    b === project.branch
                      ? "bg-primary-50 text-primary-600 font-medium"
                      : "text-text hover:bg-secondary-50"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  {b}
                  {b === project.branch && <span className="ml-auto text-xs text-primary-500">current</span>}
                </button>
              ))}
            {branchList.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 && (
              <p className="text-sm text-text-muted text-center py-4">No branches found</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
