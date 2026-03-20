import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsApi, gitApi, deployApi, codeAnalysisApi, integrationsApi } from "../services/api";
import { INTEGRATION_CATALOG } from "../data/integrations";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import DeployWizard from "../components/DeployWizard";

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

  // Deployment history
  interface DeployHistoryItem { id: string; providerId: string; repo: string; branch: string; status: string; logs: string; appUrl: string; commitHash: string; dockerImage: string; createdAt: string; }
  const [deployHistory, setDeployHistory] = useState<DeployHistoryItem[]>([]);
  const [expandedDeployLog, setExpandedDeployLog] = useState<string | null>(null);

  // Code Analysis (Opengrep)
  interface ScanProgress { phase: "cloning" | "scanning" | "persisting" | "done"; currentFile?: string; filesScanned: number; filesInRepo: number; findingsCount: number; }
  interface ScanSummary { totalFindings: number; errors: number; warnings: number; infos: number; filesScanned: number; filesInRepo: number; progress?: ScanProgress; }
  interface ScanItem { id: string; status: string; summary: ScanSummary; createdAt: string; updatedAt: string; }
  interface FindingItem { id: string; ruleId: string; severity: string; message: string; filePath: string; startLine: number; endLine: number; snippet: string; }
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingItem[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [scanError, setScanError] = useState("");
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  // PM integration for creating issues from findings
  interface PMIntegration { id: string; type: string; name: string; config: Record<string, string>; enabled: boolean; }
  const [pmIntegrations, setPmIntegrations] = useState<PMIntegration[]>([]);
  const [issueModal, setIssueModal] = useState<{ open: boolean; finding: FindingItem | null }>({ open: false, finding: null });
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueIntegration, setIssueIntegration] = useState("");
  const [issueCreating, setIssueCreating] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState("");
  const [pmProjects, setPmProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmProjectsLoading, setPmProjectsLoading] = useState(false);
  const [selectedPmProject, setSelectedPmProject] = useState("");
  const [pmTeamLabel, setPmTeamLabel] = useState("Project");
  const [pmProjectLabel, setPmProjectLabel] = useState("");
  const [pmSubProjects, setPmSubProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmSubProjectsLoading, setPmSubProjectsLoading] = useState(false);
  const [selectedPmSubProject, setSelectedPmSubProject] = useState("");
  const [issueError, setIssueError] = useState("");
  const [mrCreating, setMrCreating] = useState<string | null>(null); // finding id being processed

  // Load PM integrations and AI integrations from localStorage
  interface AIIntegration { id: string; type: string; name: string; config: Record<string, string>; enabled: boolean; }
  const [aiIntegration, setAiIntegration] = useState<AIIntegration | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("integrations");
      if (stored) {
        const all: PMIntegration[] = JSON.parse(stored);
        const pmTypes = INTEGRATION_CATALOG.filter(c => c.category === "Project Management" || c.category === "DevOps").map(c => c.type);
        const pm = all.filter(i => i.enabled && pmTypes.includes(i.type));
        setPmIntegrations(pm);
        // Find first enabled AI integration
        const aiTypes = INTEGRATION_CATALOG.filter(c => c.category === "AI").map(c => c.type);
        const ai = all.find(i => i.enabled && aiTypes.includes(i.type)) as AIIntegration | undefined;
        setAiIntegration(ai || null);
      }
    } catch {}
  }, []);

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
    deployApi.listDeployments()
      .then((res) => setDeployHistory(res.deployments))
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
            try {
              const stored = JSON.parse(localStorage.getItem("integrations") || "[]");
              const aiInteg = stored.find((i: any) => ["openai", "anthropic", "google-gemini"].includes(i.type) && i.config?.apiKey);
              if (aiInteg) { aiType = aiInteg.type; aiApiKey = aiInteg.config.apiKey; }
            } catch { /* ignore */ }
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
      const res = await gitApi.pullOrigin(project.connectionId, parsed.owner, parsed.repo, project.branch || "main");
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

  // ─── Code Analysis helpers ───

  const fetchScans = async () => {
    if (!projectId || !project) return;
    setScansLoading(true);
    try {
      const res = await codeAnalysisApi.listScans(projectId, project.branch || undefined);
      setScans(res.scans);
    } catch {}
    finally { setScansLoading(false); }
  };

  const fetchFindings = async (scanId: string, severity?: string) => {
    setFindingsLoading(true);
    try {
      const res = await codeAnalysisApi.listFindings(scanId, severity || undefined);
      setFindings(res.findings);
    } catch {}
    finally { setFindingsLoading(false); }
  };

  const handleRunScan = async () => {
    if (!project) return;
    setScanRunning(true);
    setScanError("");
    setScanProgress({ phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 });
    setFindings([]);
    setSeverityFilter("");
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const scan = await codeAnalysisApi.createScan({
        projectId: project.id,
        connectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
      });
      // Fire off the scan (returns immediately now)
      await codeAnalysisApi.runScan(scan.id);
      setActiveScanId(scan.id);

      // Poll for progress
      const poll = async () => {
        try {
          const s = await codeAnalysisApi.getScan(scan.id);
          const progress = s.summary?.progress as ScanProgress | undefined;
          if (progress) setScanProgress(progress);

          // Update the scan in the list
          setScans((prev) => {
            const exists = prev.find((p) => p.id === s.id);
            if (exists) return prev.map((p) => p.id === s.id ? { ...p, status: s.status, summary: s.summary } : p);
            return [{ id: s.id, status: s.status, summary: s.summary, createdAt: s.createdAt, updatedAt: s.updatedAt }, ...prev];
          });

          // Fetch findings incrementally during persisting phase
          if (progress?.phase === "persisting" && progress.findingsCount > 0) {
            const res = await codeAnalysisApi.listFindings(scan.id, severityFilter || undefined);
            setFindings(res.findings);
          }

          if (s.status === "completed") {
            setScanRunning(false);
            setScanProgress(null);
            await fetchScans();
            await fetchFindings(scan.id);
            return;
          }
          if (s.status === "failed") {
            setScanRunning(false);
            setScanProgress(null);
            const errMsg = (s.summary as any)?.error;
            setScanError(errMsg || "Scan failed");
            await fetchScans();
            return;
          }
          // Keep polling
          setTimeout(poll, 1000);
        } catch {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 500);
    } catch (err: any) {
      setScanError(err.message || "Scan failed");
      setScanRunning(false);
    }
  };

  const handleSelectScan = (scanId: string) => {
    setActiveScanId(scanId);
    setSeverityFilter("");
    fetchFindings(scanId);
  };

  const handleSeverityFilter = (severity: string) => {
    setSeverityFilter(severity);
    if (activeScanId) fetchFindings(activeScanId, severity);
  };

  const openIssueModal = (f: FindingItem) => {
    const title = `[${f.severity.toUpperCase()}] ${f.message}`;
    const desc = [
      `**Security Finding** from Opengrep scan`,
      ``,
      `**Severity:** ${f.severity}`,
      `**File:** \`${f.filePath}\` (line ${f.startLine}${f.endLine !== f.startLine ? `-${f.endLine}` : ""})`,
      `**Rule:** \`${f.ruleId}\``,
      f.snippet ? `\n\`\`\`\n${f.snippet}\n\`\`\`` : "",
      ``,
      `**Project:** ${project?.name || ""}`,
      `**Repository:** ${project?.repository || ""}`,
    ].filter(Boolean).join("\n");
    setIssueTitle(title);
    setIssueDescription(desc);
    const firstPm = pmIntegrations[0];
    setIssueIntegration(firstPm?.id || "");
    setIssueCreating(false);
    setIssueSuccess("");
    setIssueError("");
    setPmProjects([]);
    setSelectedPmProject("");
    setPmSubProjects([]);
    setSelectedPmSubProject("");
    setPmTeamLabel("Project");
    setPmProjectLabel("");
    setIssueModal({ open: true, finding: f });
    if (firstPm) fetchPmTeams(firstPm);
  };

  const handleCreateMR = async (f: FindingItem) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    if (!aiIntegration) {
      alert("No AI integration configured. Add one in Settings → Integrations (OpenAI, Anthropic, or Gemini).");
      return;
    }
    setMrCreating(f.id);
    try {
      const result = await gitApi.createFixMR(project.connectionId, {
        owner: parsed.owner,
        repo: parsed.repo,
        branch: project.branch || "main",
        filePath: f.filePath,
        startLine: f.startLine,
        endLine: f.endLine,
        ruleId: f.ruleId,
        severity: f.severity,
        message: f.message,
        snippet: f.snippet || "",
        aiType: aiIntegration.type,
        aiConfig: aiIntegration.config,
      });
      window.open(result.mrUrl, "_blank");
    } catch (err: any) {
      alert(`Failed to create MR: ${err.message || "Unknown error"}`);
    } finally {
      setMrCreating(null);
    }
  };

  const fetchPmTeams = async (pm: PMIntegration) => {
    setPmProjectsLoading(true);
    setPmProjects([]);
    setSelectedPmProject("");
    setPmSubProjects([]);
    setSelectedPmSubProject("");
    try {
      const res = await integrationsApi.listPMTeams(pm.type, pm.config);
      setPmProjects(res.teams);
      setPmTeamLabel(res.teamLabel);
      setPmProjectLabel(res.projectLabel);
      if (res.teams.length > 0) {
        setSelectedPmProject(res.teams[0].id);
        if (res.projectLabel) fetchPmSubProjects(pm, res.teams[0].id);
      }
    } catch {}
    finally { setPmProjectsLoading(false); }
  };

  const fetchPmSubProjects = async (pm: PMIntegration, teamId: string) => {
    setPmSubProjectsLoading(true);
    setPmSubProjects([]);
    setSelectedPmSubProject("");
    try {
      const res = await integrationsApi.listPMTeamProjects(pm.type, pm.config, teamId);
      setPmSubProjects(res.projects);
      if (res.projects.length > 0) setSelectedPmSubProject(res.projects[0].id);
    } catch {}
    finally { setPmSubProjectsLoading(false); }
  };

  const handleIntegrationChange = (integrationId: string) => {
    setIssueIntegration(integrationId);
    const pm = pmIntegrations.find(i => i.id === integrationId);
    if (pm) fetchPmTeams(pm);
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedPmProject(teamId);
    setPmSubProjects([]);
    setSelectedPmSubProject("");
    if (pmProjectLabel) {
      const pm = pmIntegrations.find(i => i.id === issueIntegration);
      if (pm) fetchPmSubProjects(pm, teamId);
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    if (!pm) return;
    setIssueCreating(true);
    setIssueSuccess("");
    setIssueError("");
    try {
      const result = await integrationsApi.createPMIssue({
        type: pm.type,
        config: pm.config,
        teamId: selectedPmProject,
        projectId: selectedPmSubProject,
        title: issueTitle,
        description: issueDescription,
      });
      // Also store locally for tracking
      const issueRecord = {
        id: result.issueId,
        issueKey: result.issueKey,
        issueUrl: result.issueUrl,
        integrationId: pm.id,
        integrationName: pm.name,
        integrationType: pm.type,
        pmProjectId: selectedPmProject,
        pmProjectName: pmProjects.find(p => p.id === selectedPmProject)?.name || "",
        pmSubProjectId: selectedPmSubProject,
        pmSubProjectName: pmSubProjects.find(p => p.id === selectedPmSubProject)?.name || "",
        title: issueTitle,
        findingId: issueModal.finding?.id,
        ruleId: issueModal.finding?.ruleId,
        severity: issueModal.finding?.severity,
        filePath: issueModal.finding?.filePath,
        createdAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem("created_issues") || "[]");
      existing.push(issueRecord);
      localStorage.setItem("created_issues", JSON.stringify(existing));
      const label = result.issueKey || result.issueId;
      setIssueSuccess(result.issueUrl
        ? `Issue ${label} created in ${pm.name}`
        : `Issue created in ${pm.name}`);
      setTimeout(() => setIssueModal({ open: false, finding: null }), 2000);
    } catch (err: any) {
      setIssueError(err.message || "Failed to create issue");
    } finally {
      setIssueCreating(false);
    }
  };

  // Load scans when project loads or branch changes
  useEffect(() => {
    if (project?.id) fetchScans();
  }, [project?.id, project?.branch]);

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
        <div className="relative flex items-center gap-2">
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

      {/* Deployment History */}
      {project.connectionId && project.repository && (() => {
        const parsed = parseOwnerRepo(project.repository);
        const repoKey = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
        const projectDeploys = deployHistory.filter(d => d.repo === repoKey);
        if (projectDeploys.length === 0) return null;
        const statusColors: Record<string, string> = { success: "bg-success-500/10 text-success-500", failed: "bg-danger-500/10 text-danger-500", building: "bg-warning-500/10 text-warning-500", deploying: "bg-primary-500/10 text-primary-500", pending: "bg-secondary-100 text-text-muted" };
        return (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Deployment History</h2>
            <div className="space-y-2">
              {projectDeploys.slice(0, 10).map((d) => (
                <div key={d.id} className={`${cardCls} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => setExpandedDeployLog(expandedDeployLog === d.id ? null : d.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-secondary-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[d.status] || "bg-secondary-100 text-text-muted"}`}>{d.status}</span>
                      <span className="text-sm text-text truncate">{d.branch}</span>
                      {d.commitHash && <span className="text-xs text-text-muted font-mono">{d.commitHash.slice(0, 8)}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {d.appUrl && (
                        <a href={d.appUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-primary-500 hover:text-primary-700 transition-colors">
                          {d.appUrl.replace(/^https?:\/\//, "").slice(0, 30)}
                        </a>
                      )}
                      <span className="text-xs text-text-muted">{new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-text-muted transition-transform ${expandedDeployLog === d.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>
                  {expandedDeployLog === d.id && d.logs && (
                    <div className="border-t border-border bg-gray-950 px-4 py-3 max-h-72 overflow-y-auto">
                      <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{d.logs}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Opengrep Code Analysis */}
      {project.connectionId && project.repository && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">Security Scan</h2>
            <button
              type="button"
              onClick={handleRunScan}
              disabled={scanRunning}
              className={`${btnPrimary} flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {scanRunning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Run Scan
                </>
              )}
            </button>
          </div>

          {scanError && (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-4 py-3 text-sm text-danger-500 mb-4">{scanError}</div>
          )}

          {/* Progress bar during scan */}
          {scanRunning && scanProgress && (
            <div className={`${cardCls} p-4 mb-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-text">
                    {scanProgress.phase === "cloning" && "Cloning repository…"}
                    {scanProgress.phase === "scanning" && "Running Opengrep analysis…"}
                    {scanProgress.phase === "persisting" && "Processing findings…"}
                  </span>
                </div>
                <span className="text-xs text-text-muted">
                  {scanProgress.filesInRepo > 0 ? `${scanProgress.filesScanned} / ${scanProgress.filesInRepo} files` : ""}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-secondary-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${
                    scanProgress.phase === "cloning" ? 10 :
                    scanProgress.phase === "scanning" ? 40 :
                    scanProgress.phase === "persisting" ? Math.min(95, 40 + 55 * (scanProgress.filesScanned > 0 ? 1 : 0)) :
                    100
                  }%` }}
                />
              </div>
              {/* Current file being processed */}
              {scanProgress.currentFile && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="font-mono truncate">{scanProgress.currentFile}</span>
                </div>
              )}
              {scanProgress.findingsCount > 0 && (
                <p className="text-xs text-text-muted">{scanProgress.findingsCount} finding{scanProgress.findingsCount !== 1 ? "s" : ""} so far</p>
              )}
            </div>
          )}

          {/* Scan history */}
          {scansLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scans.length > 0 ? (
            <div className="space-y-4">
              {/* Scan selector */}
              <div className={`${cardCls} p-4`}>
                <p className="text-xs text-text-muted mb-2">Scan History</p>
                <div className="flex flex-wrap gap-2">
                  {scans.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectScan(s.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        activeScanId === s.id
                          ? "bg-primary-500 text-white"
                          : "bg-secondary-50 text-text-secondary hover:bg-secondary-100"
                      }`}
                    >
                      {new Date(s.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <span className={`ml-1.5 ${
                        s.status === "completed" ? "text-green-300" : s.status === "failed" ? "text-red-300" : "text-yellow-300"
                      } ${activeScanId === s.id ? "" : s.status === "completed" ? "text-success-500" : s.status === "failed" ? "text-danger-500" : "text-warning-500"}`}>
                        ●
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active scan results */}
              {activeScanId && (() => {
                const scan = scans.find(s => s.id === activeScanId);
                if (!scan) return null;
                return (
                  <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { label: "Files", value: `${scan.summary.filesScanned ?? 0}/${scan.summary.filesInRepo ?? 0}`, color: "text-text-secondary", bg: "bg-secondary-50", filter: null },
                        { label: "Total", value: scan.summary.totalFindings, color: "text-text", bg: "bg-secondary-50", filter: "" },
                        { label: "Errors", value: scan.summary.errors, color: "text-danger-500", bg: "bg-danger-500/10", filter: "error" },
                        { label: "Warnings", value: scan.summary.warnings, color: "text-warning-500", bg: "bg-warning-50", filter: "warning" },
                        { label: "Info", value: scan.summary.infos, color: "text-primary-500", bg: "bg-primary-50", filter: "info" },
                      ].map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => c.filter !== null && handleSeverityFilter(c.filter)}
                          className={`${cardCls} px-3 py-2 text-center transition-all ${c.filter !== null && severityFilter === c.filter ? "ring-2 ring-primary-500" : "hover:shadow-md"} ${c.filter === null ? "cursor-default" : ""}`}
                        >
                          <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                          <p className="text-[10px] text-text-muted">{c.label}</p>
                        </button>
                      ))}
                    </div>

                    {/* Findings list */}
                    {findingsLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : findings.length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(
                          findings.reduce<Record<string, FindingItem[]>>((acc, f) => {
                            (acc[f.filePath] ||= []).push(f);
                            return acc;
                          }, {})
                        )
                          .sort(([, a], [, b]) => b.length - a.length)
                          .map(([filePath, fileFindings]) => (
                          <details key={filePath} className={`${cardCls} group`}>
                            <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-secondary-50/50 transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text-muted shrink-0 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                              </svg>
                              <span className="text-xs font-mono text-text truncate">{filePath}</span>
                              <div className="flex items-center gap-1 ml-auto shrink-0">
                                {fileFindings.filter(f => f.severity === "error").length > 0 && (
                                  <span className="px-1 py-px rounded text-[10px] font-semibold bg-danger-500/10 text-danger-500">
                                    {fileFindings.filter(f => f.severity === "error").length}
                                  </span>
                                )}
                                {fileFindings.filter(f => f.severity === "warning").length > 0 && (
                                  <span className="px-1 py-px rounded text-[10px] font-semibold bg-warning-50 text-warning-500">
                                    {fileFindings.filter(f => f.severity === "warning").length}
                                  </span>
                                )}
                                {fileFindings.filter(f => f.severity === "info").length > 0 && (
                                  <span className="px-1 py-px rounded text-[10px] font-semibold bg-primary-50 text-primary-500">
                                    {fileFindings.filter(f => f.severity === "info").length}
                                  </span>
                                )}
                              </div>
                            </summary>
                            <div className="divide-y divide-border border-t border-border">
                              {fileFindings.map((f) => (
                                <div key={f.id} className="px-3 py-2 pl-9">
                                  <div className="flex items-start gap-2">
                                    <span className={`mt-px px-1.5 py-px rounded text-[10px] font-semibold uppercase shrink-0 ${
                                      f.severity === "error" ? "bg-danger-500/10 text-danger-500" :
                                      f.severity === "warning" ? "bg-warning-50 text-warning-500" :
                                      "bg-primary-50 text-primary-500"
                                    }`}>
                                      {f.severity}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs text-text leading-snug">{f.message}</p>
                                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                                        <span className="font-mono">L{f.startLine}</span>
                                        <span className="px-1 py-px bg-secondary-50 rounded font-mono">{f.ruleId}</span>
                                        {pmIntegrations.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => openIssueModal(f)}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors"
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                            </svg>
                                            Create issue
                                          </button>
                                        )}
                                        {project.connectionId && aiIntegration && (
                                          <button
                                            type="button"
                                            onClick={() => handleCreateMR(f)}
                                            disabled={mrCreating === f.id}
                                            className={`${pmIntegrations.length === 0 ? "ml-auto" : ""} flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors`}
                                          >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                                            </svg>
                                            {mrCreating === f.id ? "Fixing…" : "Fix with AI"}
                                          </button>
                                        )}
                                      </div>
                                      {f.snippet && (
                                        <pre className="mt-1 p-1.5 rounded bg-gray-900 text-gray-300 text-[11px] font-mono overflow-x-auto leading-tight">
                                          <code>{f.snippet}</code>
                                        </pre>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <div className={`${cardCls} p-8 text-center`}>
                        <p className="text-sm text-text-muted">No findings{severityFilter ? ` with severity "${severityFilter}"` : ""}.</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className={`${cardCls} p-8 text-center`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto text-text-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <p className="text-sm text-text-muted">No scans yet. Run your first Opengrep scan to detect security issues, code smells, and best practice violations.</p>
            </div>
          )}
        </div>
      )}

      {/* Deploy Wizard */}
      <DeployWizard
        open={showDeployWizard}
        onClose={() => setShowDeployWizard(false)}
        project={project}
        analysis={analysis}
        analysisLoading={analysisLoading}
        analysisError={analysisError}
        providers={allProviders}
        onDeployComplete={() => {
          deployApi.listDeployments().then((res) => setDeployHistory(res.deployments)).catch(() => {});
        }}
      />

      {/* Create Issue from Finding Modal */}
      <Modal open={issueModal.open} onClose={() => setIssueModal({ open: false, finding: null })} title="Create Issue from Finding">
        {issueSuccess ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm font-medium text-success-500">{issueSuccess}</p>
          </div>
        ) : (
          <form onSubmit={handleCreateIssue} className="space-y-4">
            {pmIntegrations.length > 1 && (
              <div>
                <label htmlFor="issue-integration" className="block text-sm font-medium text-text-secondary mb-1.5">Integration</label>
                <select id="issue-integration" value={issueIntegration} onChange={(e) => handleIntegrationChange(e.target.value)} className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors">
                  {pmIntegrations.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </div>
            )}
            {pmIntegrations.length === 1 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 text-sm text-text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Z" />
                </svg>
                Creating in {pmIntegrations[0].name}
              </div>
            )}
            {/* Team / top-level select */}
            <div>
              <label htmlFor="issue-pm-team" className="block text-sm font-medium text-text-secondary mb-1.5">
                {pmTeamLabel}
                {pmProjectsLoading && <span className="ml-2 text-xs text-text-muted font-normal">Loading…</span>}
              </label>
              {pmProjectsLoading ? (
                <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-text-muted">Fetching {pmTeamLabel.toLowerCase()}s…</span>
                </div>
              ) : pmProjects.length > 0 ? (
                <select id="issue-pm-team" value={selectedPmProject} onChange={(e) => handleTeamChange(e.target.value)} className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors">
                  {pmProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50 text-sm text-text-muted">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  No {pmTeamLabel.toLowerCase()}s found — check your integration credentials
                </div>
              )}
            </div>
            {/* Sub-project select (only for two-level tools) */}
            {pmProjectLabel && (
              <div>
                <label htmlFor="issue-pm-project" className="block text-sm font-medium text-text-secondary mb-1.5">
                  {pmProjectLabel}
                  {pmSubProjectsLoading && <span className="ml-2 text-xs text-text-muted font-normal">Loading…</span>}
                </label>
                {pmSubProjectsLoading ? (
                  <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-text-muted">Fetching {pmProjectLabel.toLowerCase()}s…</span>
                  </div>
                ) : pmSubProjects.length > 0 ? (
                  <select id="issue-pm-project" value={selectedPmSubProject} onChange={(e) => setSelectedPmSubProject(e.target.value)} className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors">
                    <option value="">None (create at {pmTeamLabel.toLowerCase()} level)</option>
                    {pmSubProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-text-muted py-1">No {pmProjectLabel.toLowerCase()}s in this {pmTeamLabel.toLowerCase()}</p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="issue-title" className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
              <input id="issue-title" type="text" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors" required />
            </div>
            <div>
              <label htmlFor="issue-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
              <textarea id="issue-desc" value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} rows={8} className="w-full px-3 py-2 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors font-mono resize-y" />
            </div>
            {issueError && (
              <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{issueError}</div>
            )}
            <button type="submit" disabled={issueCreating || !issueIntegration || (!selectedPmProject && pmProjects.length > 0)} className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 transition-colors">
              {issueCreating ? "Creating..." : "Create Issue"}
            </button>
          </form>
        )}
      </Modal>

      <ConfirmModal open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} message={`Are you sure you want to delete "${project.name}"?`} />

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
