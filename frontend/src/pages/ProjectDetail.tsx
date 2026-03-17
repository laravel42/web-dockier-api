import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../services/api";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";

const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const btnDanger = "h-9 px-4 bg-danger-500/10 text-danger-500 text-sm font-medium rounded-[var(--radius-btn)] hover:bg-danger-500/20 transition-colors";
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
  totalCommits: number;
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
  repoSize: number;
  primaryLanguage: string;
  hasDocker: boolean;
  hasCi: boolean;
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

const categoryColors: Record<string, string> = {
  language: "bg-blue-50 text-blue-600",
  framework: "bg-purple-50 text-purple-600",
  runtime: "bg-green-50 text-green-600",
  database: "bg-amber-50 text-amber-600",
  tool: "bg-slate-100 text-slate-600",
  infra: "bg-cyan-50 text-cyan-600",
};

const langColors = [
  "bg-blue-500", "bg-amber-500", "bg-emerald-500", "bg-purple-500",
  "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-teal-500", "bg-pink-500", "bg-lime-500", "bg-sky-500",
];

// Map deploy option display names to server_providers slugs
const providerSlugMap: Record<string, string[]> = {
  "DigitalOcean": ["digitalocean"],
  "Hetzner": ["hetzner"],
  "Vultr": ["vultr"],
  "Linode": ["linode"],
  "AWS": ["aws"],
  "UpCloud": ["upcloud"],
  "Katapult": ["katapult"],
  "Hostinger": ["hostinger"],
  "Vercel": ["vercel"],
  "Netlify": ["netlify"],
  "Cloudflare Pages": ["cloudflare"],
  "Railway": ["railway"],
  "Render": ["render"],
  "Fly.io": ["flyio"],
  "Encore Cloud": ["encore"],
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [expandedOption, setExpandedOption] = useState<number | null>(null);
  const [userProviders, setUserProviders] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState<Array<{ id: string; provider: string; label: string }>>([]);
  const [deployModal, setDeployModal] = useState<{ open: boolean; option: RepoAnalysis["deployOptions"][0] | null }>({ open: false, option: null });
  const [deployProviderId, setDeployProviderId] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [deploySuccess, setDeploySuccess] = useState("");
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const [deployStatus, setDeployStatus] = useState<string>("");
  const [deployAppUrl, setDeployAppUrl] = useState("");

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
            // Fetch analysis
            setAnalysisLoading(true);
            setAnalysisError("");
            gitApi.analyzeRepo(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined)
              .then(setAnalysis)
              .catch((err: any) => setAnalysisError(err.message || "Failed to analyze repo"))
              .finally(() => setAnalysisLoading(false));
          }
        }
      })
      .catch((err: any) => setError(err.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleDelete = async () => {
    if (!projectId) return;
    await projectsApi.delete(projectId);
    navigate("/projects");
  };

  const getMatchingProviders = (opt: RepoAnalysis["deployOptions"][0]) => {
    const slugs = providerSlugMap[opt.provider];
    if (!slugs) return [];
    return allProviders.filter((p) => slugs.includes(p.provider));
  };

  const openDeployModal = (opt: RepoAnalysis["deployOptions"][0]) => {
    const matching = getMatchingProviders(opt);
    setDeployModal({ open: true, option: opt });
    setDeployProviderId(matching.length === 1 ? matching[0].id : "");
    setDeployError("");
    setDeploySuccess("");
    setDeployLogs([]);
    setDeployStatus("");
    setDeployAppUrl("");
  };

  const handleDeploy = async () => {
    if (!project || !deployModal.option || !deployProviderId) return;
    setDeploying(true);
    setDeployError("");
    setDeploySuccess("");
    setDeployLogs([]);
    setDeployStatus("pending");
    setDeployAppUrl("");
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const deployment = await deployApi.createDeployment({
        providerId: deployProviderId,
        gitConnectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
      });
      // Poll for status & logs
      const pollId = deployment.id;
      const poll = async () => {
        try {
          const d = await deployApi.getDeployment(pollId);
          setDeployStatus(d.status);
          if (d.logs) setDeployLogs(d.logs.split("\n").filter(Boolean));
          if (d.appUrl) setDeployAppUrl(d.appUrl);
          if (d.status === "success") {
            setDeploySuccess("Deployment completed successfully!");
            setDeploying(false);
            return;
          }
          if (d.status === "failed") {
            setDeployError("Deployment failed. Check logs for details.");
            setDeploying(false);
            return;
          }
          // Keep polling
          setTimeout(poll, 1500);
        } catch {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 1000);
    } catch (err: any) {
      setDeployError(err.message || "Failed to start deployment");
      setDeploying(false);
    }
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
    { label: "Language", value: stats?.language || "-", icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
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
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/projects`)} className={btnPrimary}>Edit</button>
          <button onClick={() => setShowDelete(true)} className={btnDanger}>Delete</button>
        </div>
      </div>

      {/* Repository & Details */}
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
              {project.branch ? (
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
                <span className="text-xs text-text-muted">last commit</span>
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
              {stats.lastCommitMessage && (
                <div className={`${cardCls} p-4`}>
                  <p className="text-xs text-text-muted mb-1">Latest Commit</p>
                  <p className="text-sm text-text truncate">{stats.lastCommitMessage}</p>
                  {stats.lastCommitDate && <p className="text-xs text-text-muted mt-1">{new Date(stats.lastCommitDate).toLocaleString()}</p>}
                </div>
              )}
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

      {/* Code Analysis & Deployment Suggestions */}
      {project.connectionId && project.repository && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Code Analysis & Deployment Options</h2>
          {analysisLoading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-muted">Analyzing repository code…</p>
            </div>
          ) : analysisError ? (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-500">{analysisError}</div>
          ) : analysis ? (
            <div className="space-y-6">
              {/* Tech Stack */}
              <div className={`${cardCls} p-5`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-text">Detected Tech Stack</h3>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {analysis.hasDocker && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-cyan-50 text-cyan-600 rounded">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" /></svg>
                        Docker
                      </span>
                    )}
                    {analysis.hasCi && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        CI/CD
                      </span>
                    )}
                    {analysis.repoSize > 0 && (
                      <span>{analysis.repoSize > 1024 ? `${(analysis.repoSize / 1024).toFixed(1)} MB` : `${analysis.repoSize} KB`}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.techStack.map((t) => (
                    <span key={t.name} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${categoryColors[t.category] || "bg-secondary-100 text-text-secondary"}`}>
                      {t.name}
                      <span className="opacity-50">{t.confidence}%</span>
                    </span>
                  ))}
                  {analysis.techStack.length === 0 && <p className="text-sm text-text-muted">No technologies detected</p>}
                </div>
              </div>

              {/* Deployment Options */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text">Recommended Deployment Options</h3>
                {(() => {
                  const filtered = userProviders.length > 0
                    ? analysis.deployOptions.filter((opt) => {
                        const slugs = providerSlugMap[opt.provider];
                        return slugs ? slugs.some((s) => userProviders.includes(s)) : false;
                      })
                    : analysis.deployOptions;
                  if (filtered.length === 0) {
                    return (
                      <div className={`${cardCls} p-5 text-center`}>
                        <p className="text-sm text-text-muted">
                          {userProviders.length > 0
                            ? "None of your configured providers match the recommendations for this tech stack. Add more providers in Settings → Providers."
                            : "No providers configured. Add providers in Settings → Providers to see deployment recommendations."}
                        </p>
                      </div>
                    );
                  }
                  return filtered.map((opt, i) => (
                  <div key={`${opt.provider}-${opt.type}`} className={`${cardCls} overflow-hidden`}>
                    <button
                      type="button"
                      onClick={() => setExpandedOption(expandedOption === i ? null : i)}
                      className="w-full p-5 flex items-center justify-between text-left hover:bg-secondary-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500 font-bold text-sm">
                          {opt.provider.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-text">{opt.provider}</p>
                            <span className="px-2 py-0.5 bg-secondary-100 text-text-muted rounded text-xs">{opt.type}</span>
                          </div>
                          <p className="text-sm text-text-secondary mt-0.5 truncate">{opt.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-sm font-semibold text-primary-500 whitespace-nowrap">{opt.estimatedMonthlyCost}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-text-muted transition-transform ${expandedOption === i ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>
                    {expandedOption === i && (
                      <div className="px-5 pb-5 border-t border-border">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                          <div>
                            <p className="text-xs font-semibold text-success-500 uppercase tracking-wide mb-2">Pros</p>
                            <ul className="space-y-1.5">
                              {opt.pros.map((pro, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-text-secondary">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-success-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                  {pro}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-danger-500 uppercase tracking-wide mb-2">Cons</p>
                            <ul className="space-y-1.5">
                              {opt.cons.map((con, j) => (
                                <li key={j} className="flex items-start gap-2 text-sm text-text-secondary">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  {con}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                          <div>
                            <p className="text-xs text-text-muted">Best for</p>
                            <p className="text-sm text-text-secondary">{opt.bestFor}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDeployModal(opt); }}
                            className={btnPrimary + " flex items-center gap-1.5"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                            </svg>
                            Deploy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ));
                })()}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Deploy Modal */}
      <Modal open={deployModal.open} onClose={() => { if (!deploying) setDeployModal({ open: false, option: null }); }} title={deployModal.option ? `Deploy with ${deployModal.option.provider} — ${deployModal.option.type}` : "Deploy"}>
        {deployModal.option && (() => {
          const matching = getMatchingProviders(deployModal.option);
          const inputCls = "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
          const statusColors: Record<string, string> = {
            pending: "bg-warning-50 text-warning-500",
            building: "bg-primary-50 text-primary-500",
            deploying: "bg-primary-100 text-primary-700",
            success: "bg-success-50 text-success-500",
            failed: "bg-danger-50 text-danger-500",
          };
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-secondary-50 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Repository:</span>
                  <span className="text-text font-medium truncate">{project?.repository}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Branch:</span>
                  <span className="text-text font-medium">{project?.branch || "main"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Type:</span>
                  <span className="text-text font-medium">{deployModal.option.type}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Est. cost:</span>
                  <span className="text-primary-500 font-medium">{deployModal.option.estimatedMonthlyCost}</span>
                </div>
              </div>

              {/* Provider select (only before deploy starts) */}
              {!deployStatus && (
                <div>
                  <label htmlFor="deploy-provider-select" className="block text-sm font-medium text-text-secondary mb-1.5">Select Provider Account</label>
                  {matching.length === 0 ? (
                    <p className="text-sm text-danger-500">No matching provider configured. Add a {deployModal.option.provider} provider in Settings → Providers first.</p>
                  ) : (
                    <select
                      id="deploy-provider-select"
                      value={deployProviderId}
                      onChange={(e) => setDeployProviderId(e.target.value)}
                      className={inputCls}
                      required
                    >
                      {matching.length > 1 && <option value="">Select account...</option>}
                      {matching.map((p) => (
                        <option key={p.id} value={p.id}>{p.label} ({p.provider})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Status badge */}
              {deployStatus && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted uppercase tracking-wide">Status:</span>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${statusColors[deployStatus] || "bg-secondary-100 text-text-muted"}`}>
                    {deployStatus}
                  </span>
                  {deploying && <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
                </div>
              )}

              {/* Live logs */}
              {deployLogs.length > 0 && (
                <div className="rounded-lg bg-gray-900 p-3 max-h-64 overflow-y-auto font-mono text-xs leading-relaxed">
                  {deployLogs.map((line, i) => (
                    <div key={i} className={
                      line.includes("✓") ? "text-green-400" :
                      line.includes("✗") ? "text-red-400" :
                      line.includes("──") ? "text-cyan-400" :
                      line.includes("ℹ") ? "text-blue-300" :
                      line.includes("▶") ? "text-yellow-300" :
                      "text-gray-300"
                    }>
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {/* App URL */}
              {deployAppUrl && (
                <div className="rounded-lg bg-success-500/10 border border-success-500/20 p-3">
                  <p className="text-xs text-success-500 font-semibold uppercase tracking-wide mb-1">Application URL</p>
                  <a href={deployAppUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors break-all flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    {deployAppUrl}
                  </a>
                </div>
              )}

              {deployError && (
                <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{deployError}</div>
              )}
              {deploySuccess && !deployAppUrl && (
                <div className="rounded-lg bg-success-500/10 border border-success-500/20 px-3 py-2 text-sm text-success-500">{deploySuccess}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                {!deploying && (
                  <button type="button" onClick={() => setDeployModal({ open: false, option: null })} className={btnSecondary}>
                    {deployStatus === "success" || deployStatus === "failed" ? "Close" : "Cancel"}
                  </button>
                )}
                {!deployStatus && (
                  <button
                    type="button"
                    onClick={handleDeploy}
                    disabled={!deployProviderId || deploying || matching.length === 0}
                    className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
                  >
                    Start Deployment
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} message={`Are you sure you want to delete "${project.name}"?`} />
    </div>
  );
}
