import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, integrationsApi, gitApi } from "../services/api";
import { INTEGRATION_CATALOG } from "../data/integrations";
import Modal from "../components/Modal";
import SeverityBadge from "../components/SeverityBadge";

const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

interface ScanSummary {
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  filesScanned: number;
  filesInRepo: number;
}

interface Scan {
  id: string;
  projectId: string;
  repo: string;
  branch: string;
  status: string;
  summary: ScanSummary;
  commitSha: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  createdAt: string;
  updatedAt: string;
}

interface Finding {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  filePath: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
}

interface PMIntegration {
  id: string;
  type: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
}

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length >= 2) {
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, parts.length - 1).join("/");
      return { owner, repo };
    }
  } catch {}
  return null;
}

interface ScanProgress {
  phase: string;
  filesScanned: number;
  filesInRepo: number;
  findingsCount: number;
  currentFile?: string;
}

export default function ScanDetail() {
  const { scanId, projectId: routeProjectId } = useParams<{ scanId?: string; projectId?: string }>();
  const navigate = useNavigate();

  const [scan, setScan] = useState<Scan | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [error, setError] = useState("");

  // Sidebar: all scans for this project
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [allScansLoading, setAllScansLoading] = useState(false);

  // Run new scan state
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState("");

  // PM integration state
  const [pmIntegrations, setPmIntegrations] = useState<PMIntegration[]>([]);
  const [issueModal, setIssueModal] = useState<{ open: boolean; finding: Finding | null }>({ open: false, finding: null });
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueIntegration, setIssueIntegration] = useState("");
  const [issueCreating, setIssueCreating] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState("");
  const [issueSuccessUrl, setIssueSuccessUrl] = useState("");
  const [aiEstimate, setAiEstimate] = useState(0);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [pmProjects, setPmProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmProjectsLoading, setPmProjectsLoading] = useState(false);
  const [selectedPmProject, setSelectedPmProject] = useState("");
  const [pmTeamLabel, setPmTeamLabel] = useState("Project");
  const [pmProjectLabel, setPmProjectLabel] = useState("");
  const [pmSubProjects, setPmSubProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmSubProjectsLoading, setPmSubProjectsLoading] = useState(false);
  const [selectedPmSubProject, setSelectedPmSubProject] = useState("");
  const [pmMembers, setPmMembers] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [selectedPmAssignee, setSelectedPmAssignee] = useState("");
  const [mrCreating, setMrCreating] = useState<string | null>(null);

  // AI Fix modal state
  const [fixModal, setFixModal] = useState<{ open: boolean; finding: Finding | null }>({ open: false, finding: null });
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState<{ mrUrl: string; mrId: string; mrTitle: string } | null>(null);
  const [fixError, setFixError] = useState("");

  // Assignee/reviewer for MR
  const [repoMembers, setRepoMembers] = useState<Array<{ id: string; username: string; name: string; avatarUrl: string }>>([]);
  const [mrAssignee, setMrAssignee] = useState("");
  const [mrReviewer, setMrReviewer] = useState("");
  const [mrTitle, setMrTitle] = useState("");
  const [mrDescription, setMrDescription] = useState("");

  // File contents cache for code preview
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const fetchingFiles = useRef(new Set<string>());

  // Load integrations from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("integrations");
      if (stored) {
        const all: PMIntegration[] = JSON.parse(stored);
        const pmTypes = INTEGRATION_CATALOG.filter(c => c.category === "Project Management" || c.category === "DevOps").map(c => c.type);
        setPmIntegrations(all.filter(i => i.enabled && pmTypes.includes(i.type)));
      }
    } catch {}
  }, []);

  // Load scan + project + findings
  useEffect(() => {
    if (scanId) {
      setLoading(true);
      codeAnalysisApi.getScan(scanId)
        .then(async (s) => {
          setScan(s);
          try {
            const p = await projectsApi.get(s.projectId);
            setProject(p);
            // Fetch all scans for this project (sidebar)
            setAllScansLoading(true);
            codeAnalysisApi.listScans(s.projectId)
              .then((res) => setAllScans(res.scans))
              .catch(() => {})
              .finally(() => setAllScansLoading(false));
          } catch {}
          return s;
        })
        .catch((err: any) => setError(err.message || "Failed to load scan"))
        .finally(() => setLoading(false));
      fetchFindings(scanId);
    } else if (routeProjectId) {
      // No scan yet — load project directly and show empty state with "Run scan" button
      setLoading(true);
      projectsApi.get(routeProjectId)
        .then(async (p) => {
          setProject(p);
          // Check if there are any existing scans for this project
          setAllScansLoading(true);
          codeAnalysisApi.listScans(routeProjectId)
            .then((res) => {
              setAllScans(res.scans);
              // If there are scans, navigate to the latest one
              if (res.scans.length > 0) {
                const latest = res.scans.sort((a: Scan, b: Scan) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                navigate(`/security/${latest.id}`, { replace: true });
              }
            })
            .catch(() => {})
            .finally(() => setAllScansLoading(false));
        })
        .catch((err: any) => setError(err.message || "Failed to load project"))
        .finally(() => setLoading(false));
    }
  }, [scanId, routeProjectId]);

  const fetchFindings = async (id: string, severity?: string) => {
    setFindingsLoading(true);
    try {
      const res = await codeAnalysisApi.listFindings(id, severity || undefined);
      setFindings(res.findings);
    } catch {}
    finally { setFindingsLoading(false); }
  };

  const handleSeverityFilter = (severity: string) => {
    setSeverityFilter(severity);
    if (scanId) fetchFindings(scanId, severity);
  };

  // Fetch file contents for code preview
  useEffect(() => {
    if (!project || findings.length === 0) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const uniqueFiles = [...new Set(findings.map(f => f.filePath))];
    const toFetch = uniqueFiles.filter(fp => !fileContents[fp] && !fetchingFiles.current.has(fp));
    if (toFetch.length === 0) return;
    toFetch.forEach(fp => {
      fetchingFiles.current.add(fp);
      gitApi.getFileContent(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", fp)
        .then(res => setFileContents(prev => ({ ...prev, [fp]: res.content })))
        .catch(() => { fetchingFiles.current.delete(fp); });
    });
  }, [findings, project]);

  const handleRunScan = async () => {
    if (!project) return;
    setScanRunning(true);
    setScanError("");
    setScanProgress({ phase: "cloning", filesScanned: 0, filesInRepo: 0, findingsCount: 0 });
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const newScan = await codeAnalysisApi.createScan({
        projectId: project.id,
        connectionId: project.connectionId,
        repo,
        branch: project.branch || "main",
      });
      await codeAnalysisApi.runScan(newScan.id, (() => {
        try { const t = JSON.parse(localStorage.getItem("scan_tools") || "{}"); return { enableOpengrep: t.opengrep !== false, enableSonarqube: t.sonarqube !== false, enableCustomRules: t.customRules !== false }; }
        catch { return {}; }
      })());

      const poll = async () => {
        try {
          const s = await codeAnalysisApi.getScan(newScan.id);
          const progress = s.summary?.progress as ScanProgress | undefined;
          if (progress) setScanProgress(progress);

          if (s.status === "completed" || s.status === "failed") {
            setScanRunning(false);
            setScanProgress(null);
            if (s.status === "failed") {
              setScanError((s.summary as any)?.error || "Scan failed");
            } else {
              // Refresh current scan data, findings, and sidebar
              setScan(s);
              fetchFindings(newScan.id, severityFilter || undefined);
              if (scanId !== newScan.id) navigate(`/security/${newScan.id}`);
            }
            // Refresh sidebar scan list
            codeAnalysisApi.listScans(project.id).then((res) => setAllScans(res.scans)).catch(() => {});
            return;
          }
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

  // ─── Issue creation helpers ───

  const fetchPmTeams = async (pm: PMIntegration) => {
    setPmProjectsLoading(true);
    setPmProjects([]); setSelectedPmProject(""); setPmSubProjects([]); setSelectedPmSubProject("");
    setPmMembers([]); setSelectedPmAssignee("");
    try {
      const res = await integrationsApi.listPMTeams(pm.type, pm.config);
      setPmProjects(res.teams); setPmTeamLabel(res.teamLabel); setPmProjectLabel(res.projectLabel);
      if (res.teams.length > 0) {
        setSelectedPmProject(res.teams[0].id);
        if (res.projectLabel) fetchPmSubProjects(pm, res.teams[0].id);
        fetchPmMembers(pm, res.teams[0].id);
      }
    } catch { /* ignore */ }
    finally { setPmProjectsLoading(false); }
  };

  const fetchPmMembers = async (pm: PMIntegration, teamId: string) => {
    setPmMembers([]); setSelectedPmAssignee("");
    try {
      const res = await integrationsApi.listPMTeamMembers(pm.type, pm.config, teamId);
      setPmMembers(res.members);
    } catch { /* ignore */ }
  };

  const fetchPmSubProjects = async (pm: PMIntegration, teamId: string) => {
    setPmSubProjectsLoading(true); setPmSubProjects([]); setSelectedPmSubProject("");
    try {
      const res = await integrationsApi.listPMTeamProjects(pm.type, pm.config, teamId);
      setPmSubProjects(res.projects);
      if (res.projects.length > 0) setSelectedPmSubProject(res.projects[0].id);
    } catch {}
    finally { setPmSubProjectsLoading(false); }
  };

  const openIssueModal = (f: Finding) => {
    const repoUrl = project?.repository?.replace(/\.git$/, "") || "";
    const branch = project?.branch || "main";
    const blameUrl = `${repoUrl}/-/blame/${branch}/${f.filePath}#L${f.startLine}`;
    const cleanMsg = f.message.replace(/\s+/g, " ").trim();
    const desc = [
      cleanMsg,
      ``,
      `**Source:** ${blameUrl}`,
    ].filter(Boolean).join("\n");
    setIssueTitle("Generating title…");
    setTitleGenerating(true);
    setIssueDescription(desc);
    const firstPm = pmIntegrations[0];
    setIssueIntegration(firstPm?.id || "");
    setIssueCreating(false); setIssueSuccess(""); setIssueSuccessUrl(""); setIssueError("");
    setPmProjects([]); setSelectedPmProject(""); setPmSubProjects([]); setSelectedPmSubProject("");
    setPmTeamLabel("Project"); setPmProjectLabel("");
    setIssueModal({ open: true, finding: f });
    if (firstPm) fetchPmTeams(firstPm);
    // Generate AI title and estimate
    const model = localStorage.getItem("bedrock_default_model") || undefined;
    setAiEstimate(0);
    gitApi.summarizeFinding(f.severity, f.message, f.filePath, f.snippet || "", model)
      .then(res => { setIssueTitle(res.title); setAiEstimate(res.estimateMinutes); setTitleGenerating(false); })
      .catch(() => { setIssueTitle(f.message.slice(0, 60)); setTitleGenerating(false); });
  };

  const handleIntegrationChange = (integrationId: string) => {
    setIssueIntegration(integrationId);
    const pm = pmIntegrations.find(i => i.id === integrationId);
    if (pm) fetchPmTeams(pm);
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedPmProject(teamId); setPmSubProjects([]); setSelectedPmSubProject("");
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    if (pmProjectLabel && pm) fetchPmSubProjects(pm, teamId);
    if (pm) fetchPmMembers(pm, teamId);
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    if (!pm) return;
    setIssueCreating(true); setIssueSuccess(""); setIssueSuccessUrl(""); setIssueError("");
    try {
      const severityToPriority: Record<string, number> = { error: 2, warning: 3, info: 4 };
      const priority = issueModal.finding ? severityToPriority[issueModal.finding.severity] : undefined;
      const estimateMinutes = aiEstimate || undefined;
      const result = await integrationsApi.createPMIssue({
        type: pm.type, config: pm.config, teamId: selectedPmProject,
        projectId: selectedPmSubProject, title: issueTitle, description: issueDescription,
        priority, estimateMinutes, assigneeId: selectedPmAssignee || undefined,
      });
      const label = result.issueKey || result.issueId;
      setIssueSuccess(result.issueUrl ? `Issue ${label} created` : `Issue created`);
      setIssueSuccessUrl(result.issueUrl || "");
    } catch (err: unknown) {
      const msg = (err as Error).message || "Unknown error";
      let friendly = "Failed to create issue";
      if (msg.includes("Timeout") || msg.includes("timeout")) friendly = "Connection timed out — the server may be unreachable. Check your network and try again.";
      else if (msg.includes("fetch failed")) friendly = "Could not connect to the integration server. Check that the service is running and accessible.";
      else if (msg.includes("401") || msg.includes("Unauthorized")) friendly = "Authentication failed — check your API key or token in the integration settings.";
      else if (msg.includes("403") || msg.includes("Forbidden")) friendly = "Permission denied — your token may not have permission to create issues.";
      else if (msg.includes("404") || msg.includes("Not Found")) friendly = "Project or resource not found — check the selected team/project exists.";
      else if (msg.includes("429")) friendly = "Rate limited — too many requests. Wait a moment and try again.";
      else friendly = msg;
      setIssueError(friendly);
    } finally { setIssueCreating(false); }
  };

  const handleCreateMR = async (f: Finding) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    const bedrockModel = localStorage.getItem("bedrock_default_model");
    if (!bedrockModel) {
      alert("No default LLM configured. Select one in Settings → General.");
      return;
    }

    // Open modal, fetch members
    setFixModal({ open: true, finding: f });
    setFixLoading(false);
    setFixResult(null);
    setFixError("");
    setMrAssignee("");
    setMrReviewer("");
    // Pre-fill title and description
    setMrTitle("Generating title…");
    setTitleGenerating(true);
    const repoUrl = project.repository?.replace(/\.git$/, "") || "";
    const branch = project.branch || "main";
    const blameUrl = `${repoUrl}/-/blame/${branch}/${f.filePath}#L${f.startLine}`;
    const cleanMsg = f.message.replace(/\s+/g, " ").trim();
    setMrDescription([cleanMsg, ``, `**Source:** ${blameUrl}`].join("\n"));
    // Fetch repo members for assignee/reviewer
    gitApi.listRepoMembers(project.connectionId, parsed.owner, parsed.repo)
      .then(res => setRepoMembers(res.members))
      .catch(() => setRepoMembers([]));
    // Generate AI title
    const model = bedrockModel || undefined;
    gitApi.summarizeFinding(f.severity, f.message, f.filePath, f.snippet || "", model)
      .then(res => { setMrTitle(res.title || f.message.slice(0, 60)); setTitleGenerating(false); })
      .catch(() => { setMrTitle(f.message.slice(0, 60)); setTitleGenerating(false); });
  };

  const handleSubmitMR = async () => {
    const f = fixModal.finding;
    if (!f || !project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const bedrockModel = localStorage.getItem("bedrock_default_model");
    if (!bedrockModel) {
      setFixError("No default LLM configured. Select one in Settings → General.");
      return;
    }

    setFixLoading(true);
    setFixError("");
    setMrCreating(f.id);
    try {
      const result = await gitApi.createFixMR(project.connectionId, {
        owner: parsed.owner, repo: parsed.repo, branch: project.branch || "main",
        filePath: f.filePath, startLine: f.startLine, endLine: f.endLine,
        ruleId: f.ruleId, severity: f.severity, message: f.message, snippet: f.snippet || "",
        aiType: "bedrock", aiConfig: { model: bedrockModel },
        assignee: mrAssignee || undefined, reviewer: mrReviewer || undefined,
      });
      setFixResult(result);
    } catch (err: unknown) {
      setFixError((err as Error).message || "Failed to create MR");
    } finally {
      setFixLoading(false);
      setMrCreating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || (!scan && !project)) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Scan not found"}</p>
        <button onClick={() => navigate("/security")} className={btnSecondary}>Back to Security Scans</button>
      </div>
    );
  }

  // Project loaded but no scan selected — show empty state with sidebar
  if (!scan && project) {
    return (
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate("/security")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            All Scans
          </button>
          <h1 className="text-2xl font-display font-semibold text-text tracking-tight mb-2">{project.name}</h1>
          <div className={`${cardCls} p-12 text-center mt-6`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <p className="text-sm text-text-muted mb-1">No security scans yet for this project.</p>
            <p className="text-sm text-text-muted">Click "Run new scan" to get started.</p>
          </div>
        </div>
        {/* Sidebar */}
        <div className="w-80 shrink-0">
          <div className="sticky top-6 space-y-3">
            <button
              type="button"
              onClick={handleRunScan}
              disabled={scanRunning || !project.connectionId}
              className="w-full h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
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
                  Run new scan
                </>
              )}
            </button>
            {scanRunning && scanProgress && (() => {
              const pct = scanProgress.phase === "cloning" ? 5
                : scanProgress.phase === "scanning" ? (scanProgress.filesInRepo > 0 ? 10 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 50) : 30)
                : scanProgress.phase === "persisting" ? (scanProgress.filesInRepo > 0 ? 60 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 35) : 80)
                : 100;
              const label = scanProgress.phase === "cloning" ? "Cloning repository…"
                : scanProgress.phase === "scanning" ? "Running security scanners…"
                : scanProgress.phase === "persisting" ? "Processing findings…"
                : "Finalizing…";
              return (
                <div className={`${cardCls} p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-text">{label}</p>
                    <span className="text-xs font-semibold text-primary-500">{pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>{scanProgress.filesScanned > 0 ? `${scanProgress.filesScanned}/${scanProgress.filesInRepo} files` : ""}</span>
                    <span>{scanProgress.findingsCount > 0 ? `${scanProgress.findingsCount} findings` : ""}</span>
                  </div>
                  {scanProgress.currentFile && (
                    <p className="text-[10px] text-text-muted font-mono truncate">{scanProgress.currentFile}</p>
                  )}
                </div>
              );
            })()}
            {scanError && (
              <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-xs text-danger-500">{scanError}</div>
            )}
            <div className={`${cardCls} overflow-hidden`}>
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Scan History</p>
              </div>
              {allScans.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-4">No scans yet</p>
              ) : (
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border">
                  {allScans.map((s) => {
                    const statusDot = s.status === "completed" ? "bg-success-500" : s.status === "failed" ? "bg-danger-500" : s.status === "running" ? "bg-primary-500" : "bg-secondary-300";
                    return (
                      <button key={s.id} type="button" onClick={() => navigate(`/security/${s.id}`)} className="w-full text-left px-3 py-3 transition-colors hover:bg-secondary-50">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                          <span className="text-sm font-medium truncate text-text">
                            {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 ml-[18px]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                          </svg>
                          <span className="text-xs text-text font-semibold font-mono truncate">{s.branch}</span>
                        </div>
                        {s.commitSha && (
                          <div className="flex items-center gap-2 mt-1 ml-[18px]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                            </svg>
                            <span className="text-xs text-text font-semibold font-mono">{s.commitSha.slice(0, 7)}</span>
                            {s.commitMessage && <span className="text-xs text-text-muted truncate">{s.commitMessage.split("\n")[0]}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    completed: "bg-success-500/10 text-success-500",
    failed: "bg-danger-500/10 text-danger-500",
    running: "bg-primary-500/10 text-primary-500",
    pending: "bg-secondary-100 text-text-muted",
  };

  if (!scan) return (
    <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  );

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
      <button onClick={() => navigate("/security")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Security Scans
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-text">Scan Results</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[scan.status] || "bg-secondary-100 text-text-muted"}`}>
                {scan.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {project && (
                <button onClick={() => navigate(`/projects/${project.id}`)} className="text-sm text-primary-500 hover:text-primary-700 transition-colors">
                  {project.name}
                </button>
              )}
              <span className="text-sm text-text-muted font-mono">{scan.repo}</span>
              <span className="text-xs text-text-muted">{scan.branch}</span>
              <span className="text-xs text-text-muted">{new Date(scan.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {scan.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
          {[
            { label: "Files", value: `${scan.summary.filesScanned ?? 0}/${scan.summary.filesInRepo ?? 0}`, color: "text-text-secondary", filter: null },
            { label: "Total", value: scan.summary.totalFindings, color: "text-text", filter: "" },
            { label: "Errors", value: scan.summary.errors, color: "text-danger-500", filter: "error" },
            { label: "Warnings", value: scan.summary.warnings, color: "text-warning-500", filter: "warning" },
            { label: "Info", value: scan.summary.infos, color: "text-primary-500", filter: "info" },
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
      )}

      {/* Provider filter pills */}
      {scan.summary && findings.length > 0 && (() => {
        const counts = findings.reduce<Record<string, number>>((acc, f) => {
          const p = f.ruleId.startsWith("sonar.") ? "sonar" : f.ruleId.startsWith("custom.") ? "custom" : "opengrep";
          acc[p] = (acc[p] || 0) + 1;
          return acc;
        }, {});
        const providers = [
          { key: "", label: "All Providers", count: findings.length },
          { key: "opengrep", label: "Opengrep", count: counts["opengrep"] || 0 },
          { key: "sonar", label: "SonarQube", count: counts["sonar"] || 0 },
          { key: "custom", label: "Custom Rules", count: counts["custom"] || 0 },
        ].filter(p => p.key === "" || p.count > 0);
        return (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-text-muted mr-1">Source:</span>
            {providers.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setProviderFilter(p.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  providerFilter === p.key
                    ? "bg-primary-500 text-white"
                    : "bg-secondary-50 text-text-muted hover:bg-secondary-100 hover:text-text"
                }`}
              >
                {p.label} ({p.count})
              </button>
            ))}
          </div>
        );
      })()}

      {/* Findings list */}
      {findingsLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : findings.length > 0 ? (
        <div className="space-y-2">
          {(() => {
            const filtered = providerFilter
              ? findings.filter((f) => {
                  if (providerFilter === "sonar") return f.ruleId.startsWith("sonar.");
                  if (providerFilter === "custom") return f.ruleId.startsWith("custom.");
                  return !f.ruleId.startsWith("sonar.") && !f.ruleId.startsWith("custom.");
                })
              : findings;
            if (filtered.length === 0) {
              return (
                <div className={`${cardCls} p-8 text-center`}>
                  <p className="text-sm text-text-muted">No findings from this provider{severityFilter ? ` with severity "${severityFilter}"` : ""}.</p>
                </div>
              );
            }
            return Object.entries(
              filtered.reduce<Record<string, Finding[]>>((acc, f) => {
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
                    <SeverityBadge severity="error" count={fileFindings.filter(f => f.severity === "error").length} />
                  )}
                  {fileFindings.filter(f => f.severity === "warning").length > 0 && (
                    <SeverityBadge severity="warning" count={fileFindings.filter(f => f.severity === "warning").length} />
                  )}
                  {fileFindings.filter(f => f.severity === "info").length > 0 && (
                    <SeverityBadge severity="info" count={fileFindings.filter(f => f.severity === "info").length} />
                  )}
                </div>
              </summary>
              <div className="divide-y divide-border border-t border-border">
                {fileFindings.map((f) => (
                  <div key={f.id} className="px-3 py-3 pl-9 space-y-1.5">
                    {/* Top row: severity badge + buttons */}
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity as "error" | "warning" | "info"} label={f.severity} />
                      <span className="text-[10px] text-text-muted font-mono">L{f.startLine}</span>
                      <span className="text-[10px] text-text-muted font-mono px-1 py-px bg-secondary-50 rounded">{f.ruleId}</span>
                      {(pmIntegrations.length > 0 || project?.connectionId) && (
                        <div className="flex items-center gap-2 ml-auto shrink-0">
                          {pmIntegrations.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openIssueModal(f)}
                              className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                              Create issue
                            </button>
                          )}
                          {project?.connectionId && (
                            <button
                              type="button"
                              onClick={() => handleCreateMR(f)}
                              disabled={mrCreating === f.id}
                              className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 disabled:opacity-50 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                              </svg>
                              {mrCreating === f.id ? "Fixing…" : "Fix with AI"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Message */}
                    <p className="text-xs text-text leading-snug">{f.message}</p>
                    {/* Code preview with context */}
                    {(() => {
                      const content = fileContents[f.filePath];
                      if (!content) {
                        return f.snippet ? (
                          <pre className="p-1.5 rounded bg-gray-900 text-gray-300 text-[11px] font-mono overflow-x-auto leading-tight">
                            <code>{f.snippet}</code>
                          </pre>
                        ) : null;
                      }
                      const allLines = content.split("\n");
                      const ctxBefore = 5;
                      const ctxAfter = 5;
                      const start = Math.max(0, f.startLine - 1 - ctxBefore);
                      const end = Math.min(allLines.length, f.endLine + ctxAfter);
                      const visibleLines = allLines.slice(start, end);
                      const gutterWidth = String(end).length;
                      return (
                        <div className="rounded-lg overflow-hidden border border-gray-700/50 bg-[#1e1e2e]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-gray-700/50">
                            <span className="text-[10px] text-gray-400 font-mono">{f.filePath}</span>
                            <span className="text-[10px] text-gray-500">L{start + 1}–{end}</span>
                          </div>
                          <pre className="p-0 m-0 overflow-x-auto text-[11px] leading-[1.6] font-mono">
                            {visibleLines.map((line, i) => {
                              const lineNum = start + i + 1;
                              const isVulnerable = lineNum >= f.startLine && lineNum <= f.endLine;
                              return (
                                <div
                                  key={lineNum}
                                  className={`flex ${isVulnerable ? "bg-danger-500/15" : "hover:bg-white/[0.03]"}`}
                                >
                                  <span className={`shrink-0 select-none text-right pr-3 pl-3 ${isVulnerable ? "text-danger-400 bg-danger-500/10" : "text-gray-600"}`} style={{ width: `${gutterWidth + 3}ch` }}>
                                    {lineNum}
                                  </span>
                                  <code className={`flex-1 pr-3 ${isVulnerable ? "text-gray-200" : "text-gray-400"}`}>
                                    {line || " "}
                                  </code>
                                </div>
                              );
                            })}
                          </pre>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </details>
          ));
          })()}
        </div>
      ) : scan.status === "completed" ? (
        <div className={`${cardCls} p-8 text-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 mx-auto text-success-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="text-sm text-text-muted">No findings{severityFilter ? ` with severity "${severityFilter}"` : ""} — looking clean.</p>
        </div>
      ) : null}

      {/* Create Issue Modal */}
      <Modal open={issueModal.open} onClose={() => setIssueModal({ open: false, finding: null })} title="Create Issue from Finding">
        {issueSuccess ? (
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="w-12 h-12 rounded-full bg-success-500/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-success-500">{issueSuccess}</p>
            {issueSuccessUrl && (
              <a
                href={issueSuccessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-5 inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open Issue
              </a>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateIssue} className="space-y-4">
            {pmIntegrations.length > 1 && (
              <div>
                <label htmlFor="issue-integration" className="block text-sm font-medium text-text-secondary mb-1.5">Integration</label>
                <select id="issue-integration" value={issueIntegration} onChange={(e) => handleIntegrationChange(e.target.value)} className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors">
                  {pmIntegrations.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                </select>
              </div>
            )}
            {pmIntegrations.length === 1 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 text-sm text-text-secondary">
                Creating in {pmIntegrations[0].name}
              </div>
            )}
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
                  {pmProjects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50 text-sm text-text-muted">
                  No {pmTeamLabel.toLowerCase()}s found
                </div>
              )}
            </div>
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
                    {pmSubProjects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-text-muted py-1">No {pmProjectLabel.toLowerCase()}s in this {pmTeamLabel.toLowerCase()}</p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="issue-title" className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
              <input id="issue-title" type="text" value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} disabled={titleGenerating} className={`w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors ${titleGenerating ? "opacity-50 cursor-wait" : ""}`} required />
            </div>
            <div>
              <label htmlFor="issue-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
              <textarea id="issue-desc" value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} rows={8} className="w-full px-3 py-2 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors font-mono resize-y" />
            </div>
            {pmMembers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
                <select value={selectedPmAssignee} onChange={(e) => setSelectedPmAssignee(e.target.value)}
                  className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 transition-colors">
                  <option value="">Unassigned</option>
                  {pmMembers.map(m => <option key={m.id} value={m.id}>{m.name}{m.email ? ` (${m.email})` : ""}</option>)}
                </select>
              </div>
            )}
            {issueError && (
              <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                <p>{issueError}</p>
                <button type="button" onClick={() => setIssueError("")} className="text-xs text-danger-400 hover:text-danger-600 mt-1 underline">Dismiss</button>
              </div>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={issueCreating || !issueIntegration || (!selectedPmProject && pmProjects.length > 0)} className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 transition-colors">
                {issueCreating ? "Creating..." : "Create Issue"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* AI Fix Modal */}
      <Modal open={fixModal.open} onClose={() => setFixModal({ open: false, finding: null })} title="Fix with AI">
        {fixResult ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-12 h-12 rounded-full bg-success-500/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-success-500">Merge request created</p>
            {fixResult.mrUrl && (
              <a href={fixResult.mrUrl} target="_blank" rel="noopener noreferrer"
                className="h-9 px-5 inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open Merge Request
              </a>
            )}
          </div>
        ) : fixLoading ? (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="relative">
              <div className="w-12 h-12 border-[3px] border-violet-200 rounded-full" />
              <div className="absolute inset-0 w-12 h-12 border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text">AI is analyzing the vulnerability…</p>
              <p className="text-xs text-text-muted mt-1">Generating fix and creating merge request</p>
            </div>
          </div>
        ) : fixModal.finding ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
              <input type="text" value={mrTitle} onChange={(e) => setMrTitle(e.target.value)} disabled={titleGenerating}
                className={`w-full h-11 px-3 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors ${titleGenerating ? "opacity-50 cursor-wait" : ""}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
              <textarea value={mrDescription} onChange={(e) => setMrDescription(e.target.value)} rows={5}
                className="w-full px-3 py-2 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors font-mono resize-y" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
              <select value={mrAssignee} onChange={(e) => setMrAssignee(e.target.value)}
                className="w-full h-11 px-3 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 transition-colors">
                <option value="">None</option>
                {repoMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.username})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Reviewer</label>
              <select value={mrReviewer} onChange={(e) => setMrReviewer(e.target.value)}
                className="w-full h-11 px-3 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 transition-colors">
                <option value="">None</option>
                {repoMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.username})</option>)}
              </select>
            </div>
            {fixError && (
              <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                <p>{fixError}</p>
                <button type="button" onClick={() => setFixError("")} className="text-xs text-danger-400 hover:text-danger-600 mt-1 underline">Dismiss</button>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={handleSubmitMR} disabled={fixLoading || !mrTitle}
                className="h-9 px-4 bg-violet-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-violet-600 disabled:opacity-50 transition-colors">
                Create Merge Request
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
      </div>

      {/* Sidebar: scan list */}
      <div className="w-80 shrink-0">
        <div className="sticky top-6 space-y-3">
          <button
            type="button"
            onClick={handleRunScan}
            disabled={scanRunning || !project?.connectionId}
            className="w-full h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
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
                Run new scan
              </>
            )}
          </button>

          {scanRunning && scanProgress && (() => {
            const pct = scanProgress.phase === "cloning" ? 5
              : scanProgress.phase === "scanning" ? (scanProgress.filesInRepo > 0 ? 10 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 50) : 30)
              : scanProgress.phase === "persisting" ? (scanProgress.filesInRepo > 0 ? 60 + Math.round((scanProgress.filesScanned / scanProgress.filesInRepo) * 35) : 80)
              : 100;
            const label = scanProgress.phase === "cloning" ? "Cloning repository…"
              : scanProgress.phase === "scanning" ? "Running security scanners…"
              : scanProgress.phase === "persisting" ? "Processing findings…"
              : "Finalizing…";
            return (
              <div className={`${cardCls} p-3 space-y-2`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-text">{label}</p>
                  <span className="text-xs font-semibold text-primary-500">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-secondary-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{scanProgress.filesScanned > 0 ? `${scanProgress.filesScanned}/${scanProgress.filesInRepo} files` : ""}</span>
                  <span>{scanProgress.findingsCount > 0 ? `${scanProgress.findingsCount} findings` : ""}</span>
                </div>
                {scanProgress.currentFile && (
                  <p className="text-[10px] text-text-muted font-mono truncate">{scanProgress.currentFile}</p>
                )}
              </div>
            );
          })()}

          {scanError && (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-xs text-danger-500">{scanError}</div>
          )}

          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Scan History</p>
            </div>
            {allScansLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : allScans.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No scans yet</p>
            ) : (
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto divide-y divide-border">
                {allScans.map((s) => {
                  const isActive = s.id === scanId;
                  const statusDot = s.status === "completed" ? "bg-success-500" : s.status === "failed" ? "bg-danger-500" : s.status === "running" ? "bg-primary-500" : "bg-secondary-300";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => navigate(`/security/${s.id}`)}
                      className={`w-full text-left px-3 py-3 transition-colors ${isActive ? "bg-primary-50" : "hover:bg-secondary-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                        <span className={`text-sm font-medium truncate ${isActive ? "text-primary-600" : "text-text"}`}>
                          {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {s.summary?.totalFindings != null && s.summary.totalFindings > 0 && (() => {
                          if (isActive && findings.length > 0) {
                            const hasOg = findings.some(f => !f.ruleId.startsWith("sonar.") && !f.ruleId.startsWith("custom."));
                            const hasSq = findings.some(f => f.ruleId.startsWith("sonar."));
                            const hasCr = findings.some(f => f.ruleId.startsWith("custom."));
                            return (
                              <div className="flex items-center gap-2 ml-auto shrink-0">
                                {hasOg && <img src="/devicons/opengrep.svg" alt="Opengrep" className="w-4 h-4 rounded" />}
                                {hasSq && <img src="/devicons/sonarqube.svg" alt="SonarQube" className="w-4 h-4 rounded" />}
                                {hasCr && <img src="/logo.png" alt="Custom" className="w-4 h-4 rounded" />}
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              <img src="/devicons/opengrep.svg" alt="Opengrep" className="w-4 h-4 rounded" />
                              <img src="/devicons/sonarqube.svg" alt="SonarQube" className="w-4 h-4 rounded" />
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 ml-[18px]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                        </svg>
                        <span className="text-xs text-text font-semibold font-mono truncate">{s.branch}</span>
                      </div>
                      {s.commitSha && (
                        <div className="flex items-center gap-2 mt-1 ml-[18px]">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-text shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                          </svg>
                          <span className="text-xs text-text font-semibold font-mono">{s.commitSha.slice(0, 7)}</span>
                          {s.commitMessage && <span className="text-xs text-text-muted truncate">{s.commitMessage.split("\n")[0]}</span>}
                        </div>
                      )}
                      {isActive && findings.length > 0 && (() => {
                        const errs = findings.filter(f => f.severity === "error").length;
                        const warns = findings.filter(f => f.severity === "warning").length;
                        const infos = findings.filter(f => f.severity === "info").length;
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 ml-[18px]">
                            {errs > 0 && <SeverityBadge severity="error" count={errs} />}
                            {warns > 0 && <SeverityBadge severity="warning" count={warns} />}
                            {infos > 0 && <SeverityBadge severity="info" count={infos} />}
                          </div>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
