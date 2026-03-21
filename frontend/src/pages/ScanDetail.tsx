import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, integrationsApi, gitApi } from "../services/api";
import { INTEGRATION_CATALOG } from "../data/integrations";
import Modal from "../components/Modal";

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

interface AIIntegration {
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
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();

  const [scan, setScan] = useState<Scan | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("");
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
  const [aiIntegration, setAiIntegration] = useState<AIIntegration | null>(null);
  const [issueModal, setIssueModal] = useState<{ open: boolean; finding: Finding | null }>({ open: false, finding: null });
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueIntegration, setIssueIntegration] = useState("");
  const [issueCreating, setIssueCreating] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState("");
  const [issueError, setIssueError] = useState("");
  const [pmProjects, setPmProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmProjectsLoading, setPmProjectsLoading] = useState(false);
  const [selectedPmProject, setSelectedPmProject] = useState("");
  const [pmTeamLabel, setPmTeamLabel] = useState("Project");
  const [pmProjectLabel, setPmProjectLabel] = useState("");
  const [pmSubProjects, setPmSubProjects] = useState<Array<{ id: string; name: string; key?: string }>>([]);
  const [pmSubProjectsLoading, setPmSubProjectsLoading] = useState(false);
  const [selectedPmSubProject, setSelectedPmSubProject] = useState("");
  const [mrCreating, setMrCreating] = useState<string | null>(null);

  // Load integrations from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("integrations");
      if (stored) {
        const all: PMIntegration[] = JSON.parse(stored);
        const pmTypes = INTEGRATION_CATALOG.filter(c => c.category === "Project Management" || c.category === "DevOps").map(c => c.type);
        setPmIntegrations(all.filter(i => i.enabled && pmTypes.includes(i.type)));
        const aiTypes = INTEGRATION_CATALOG.filter(c => c.category === "AI").map(c => c.type);
        const ai = all.find(i => i.enabled && aiTypes.includes(i.type)) as AIIntegration | undefined;
        setAiIntegration(ai || null);
      }
    } catch {}
  }, []);

  // Load scan + project + findings
  useEffect(() => {
    if (!scanId) return;
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
  }, [scanId]);

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
      await codeAnalysisApi.runScan(newScan.id);

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
              navigate(`/security/${newScan.id}`);
            }
            // Refresh sidebar
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
    try {
      const res = await integrationsApi.listPMTeams(pm.type, pm.config);
      setPmProjects(res.teams); setPmTeamLabel(res.teamLabel); setPmProjectLabel(res.projectLabel);
      if (res.teams.length > 0) {
        setSelectedPmProject(res.teams[0].id);
        if (res.projectLabel) fetchPmSubProjects(pm, res.teams[0].id);
      }
    } catch {}
    finally { setPmProjectsLoading(false); }
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
    const title = `[${f.severity.toUpperCase()}] ${f.message}`;
    const desc = [
      `**Security Finding** from Opengrep scan`,
      ``, `**Severity:** ${f.severity}`,
      `**File:** \`${f.filePath}\` (line ${f.startLine}${f.endLine !== f.startLine ? `-${f.endLine}` : ""})`,
      `**Rule:** \`${f.ruleId}\``,
      f.snippet ? `\n\`\`\`\n${f.snippet}\n\`\`\`` : "",
      ``, `**Project:** ${project?.name || ""}`,
      `**Repository:** ${project?.repository || ""}`,
    ].filter(Boolean).join("\n");
    setIssueTitle(title); setIssueDescription(desc);
    const firstPm = pmIntegrations[0];
    setIssueIntegration(firstPm?.id || "");
    setIssueCreating(false); setIssueSuccess(""); setIssueError("");
    setPmProjects([]); setSelectedPmProject(""); setPmSubProjects([]); setSelectedPmSubProject("");
    setPmTeamLabel("Project"); setPmProjectLabel("");
    setIssueModal({ open: true, finding: f });
    if (firstPm) fetchPmTeams(firstPm);
  };

  const handleIntegrationChange = (integrationId: string) => {
    setIssueIntegration(integrationId);
    const pm = pmIntegrations.find(i => i.id === integrationId);
    if (pm) fetchPmTeams(pm);
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedPmProject(teamId); setPmSubProjects([]); setSelectedPmSubProject("");
    if (pmProjectLabel) {
      const pm = pmIntegrations.find(i => i.id === issueIntegration);
      if (pm) fetchPmSubProjects(pm, teamId);
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    if (!pm) return;
    setIssueCreating(true); setIssueSuccess(""); setIssueError("");
    try {
      const result = await integrationsApi.createPMIssue({
        type: pm.type, config: pm.config, teamId: selectedPmProject,
        projectId: selectedPmSubProject, title: issueTitle, description: issueDescription,
      });
      const label = result.issueKey || result.issueId;
      setIssueSuccess(result.issueUrl ? `Issue ${label} created in ${pm.name}` : `Issue created in ${pm.name}`);
      setTimeout(() => setIssueModal({ open: false, finding: null }), 2000);
    } catch (err: any) {
      setIssueError(err.message || "Failed to create issue");
    } finally { setIssueCreating(false); }
  };

  const handleCreateMR = async (f: Finding) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    if (!aiIntegration) {
      alert("No AI integration configured. Add one in Settings → Integrations.");
      return;
    }
    setMrCreating(f.id);
    try {
      const result = await gitApi.createFixMR(project.connectionId, {
        owner: parsed.owner, repo: parsed.repo, branch: project.branch || "main",
        filePath: f.filePath, startLine: f.startLine, endLine: f.endLine,
        ruleId: f.ruleId, severity: f.severity, message: f.message, snippet: f.snippet || "",
        aiType: aiIntegration.type, aiConfig: aiIntegration.config,
      });
      window.open(result.mrUrl, "_blank");
    } catch (err: any) {
      alert(`Failed to create MR: ${err.message || "Unknown error"}`);
    } finally { setMrCreating(null); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Scan not found"}</p>
        <button onClick={() => navigate("/security")} className={btnSecondary}>Back to Security Scans</button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    completed: "bg-success-500/10 text-success-500",
    failed: "bg-danger-500/10 text-danger-500",
    running: "bg-primary-500/10 text-primary-500",
    pending: "bg-secondary-100 text-text-muted",
  };

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

      {/* Findings list */}
      {findingsLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : findings.length > 0 ? (
        <div className="space-y-2">
          {Object.entries(
            findings.reduce<Record<string, Finding[]>>((acc, f) => {
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
                  <div key={f.id} className="px-3 py-3 pl-9 space-y-1.5">
                    {/* Top row: severity badge + buttons */}
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase shrink-0 ${
                        f.severity === "error" ? "bg-danger-500/10 text-danger-500" :
                        f.severity === "warning" ? "bg-warning-50 text-warning-500" :
                        "bg-primary-50 text-primary-500"
                      }`}>
                        {f.severity}
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">L{f.startLine}</span>
                      <span className="text-[10px] text-text-muted font-mono px-1 py-px bg-secondary-50 rounded">{f.ruleId}</span>
                      {(pmIntegrations.length > 0 || (project?.connectionId && aiIntegration)) && (
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
                          {project?.connectionId && aiIntegration && (
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
                    {/* Snippet */}
                    {f.snippet && (
                      <pre className="p-1.5 rounded bg-gray-900 text-gray-300 text-[11px] font-mono overflow-x-auto leading-tight">
                        <code>{f.snippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
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
      </div>

      {/* Sidebar: scan list */}
      <div className="w-64 shrink-0">
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

          {scanRunning && scanProgress && (
            <div className={`${cardCls} p-3 space-y-2`}>
              <p className="text-xs font-medium text-text">
                {scanProgress.phase === "cloning" && "Cloning…"}
                {scanProgress.phase === "scanning" && "Scanning…"}
                {scanProgress.phase === "persisting" && "Processing…"}
              </p>
              <div className="w-full h-1.5 bg-secondary-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${scanProgress.phase === "cloning" ? 10 : scanProgress.phase === "scanning" ? 40 : 80}%` }}
                />
              </div>
              {scanProgress.filesInRepo > 0 && (
                <p className="text-[10px] text-text-muted">{scanProgress.filesScanned}/{scanProgress.filesInRepo} files</p>
              )}
            </div>
          )}

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
                      className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? "bg-primary-50" : "hover:bg-secondary-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                        <span className={`text-xs font-medium truncate ${isActive ? "text-primary-600" : "text-text"}`}>
                          {new Date(s.createdAt).toLocaleDateString()} {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 ml-4">
                        {s.summary?.totalFindings != null && (
                          <span className="text-[10px] text-text-muted">{s.summary.totalFindings} finding{s.summary.totalFindings !== 1 ? "s" : ""}</span>
                        )}
                        <span className="text-[10px] text-text-muted font-mono">{s.branch}</span>
                      </div>
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
