import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi } from "../services/api";

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

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
}

export default function SecurityScans() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [scanRes, projRes] = await Promise.all([
          codeAnalysisApi.listScans(),
          projectsApi.list(),
        ]);
        setScans(scanRes.scans);
        const map: Record<string, Project> = {};
        for (const p of projRes.projects) map[p.id] = p;
        setProjects(map);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Group scans by project
  const grouped = scans.reduce<Record<string, Scan[]>>((acc, s) => {
    (acc[s.projectId] ||= []).push(s);
    return acc;
  }, {});

  // All projects — those with scans + those without
  const allProjectIds = Object.keys(projects);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Security Scans</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : allProjectIds.length === 0 ? (
        <div className={`${cardCls} p-12 text-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto text-text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="text-sm text-text-muted mb-4">No projects yet. Create a project first to run security scans.</p>
          <button onClick={() => navigate("/projects")} className={btnSecondary}>Go to Projects</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {allProjectIds
            .sort((a, b) => {
              const aScans = grouped[a];
              const bScans = grouped[b];
              // Projects with scans first, sorted by latest scan date; then projects without scans sorted by name
              if (aScans && bScans) return new Date(bScans[0].createdAt).getTime() - new Date(aScans[0].createdAt).getTime();
              if (aScans) return -1;
              if (bScans) return 1;
              return (projects[a]?.name || "").localeCompare(projects[b]?.name || "");
            })
            .map((projectId) => {
              const proj = projects[projectId];
              const projectScans = grouped[projectId];
              const hasScans = projectScans && projectScans.length > 0;

              if (!hasScans) {
                // Project card with no scans
                return (
                  <div
                    key={projectId}
                    onClick={() => navigate(`/security/project/${projectId}`)}
                    className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 shrink-0 text-secondary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                      <span className="text-base text-text-secondary truncate">No scans</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-text truncate">{proj?.name || projectId.slice(0, 8)}</h3>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-secondary-300" />
                        <span className="text-xs text-text-muted">Not scanned yet</span>
                      </div>
                      {proj?.branch && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                          </svg>
                          {proj.branch}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              const sorted = projectScans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const latest = sorted[0];
              const latestCompleted = sorted.find(s => s.status === "completed");
              const summary = latestCompleted?.summary;
              const isClean = summary && summary.totalFindings === 0;
              const statusDot = latest.status === "completed"
                ? (isClean ? "bg-success-500" : summary && summary.errors > 0 ? "bg-danger-500" : "bg-warning-500")
                : latest.status === "failed" ? "bg-danger-500"
                : latest.status === "running" ? "bg-primary-500"
                : "bg-secondary-400";

              return (
                <div
                  key={projectId}
                  onClick={() => navigate(`/security/${latest.id}`)}
                  className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
                >
                  {/* Header: shield icon + scan count */}
                  <div className="flex items-center gap-3 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 shrink-0 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <span className="text-base text-text-secondary truncate">{sorted.length} scan{sorted.length !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Project name + findings */}
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-text truncate">{proj?.name || projectId.slice(0, 8)}</h3>
                    {summary && (
                      <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
                        {summary.errors > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-danger-500/20 bg-danger-500/10 text-danger-500 text-[11px] font-medium whitespace-nowrap">
                            {summary.errors} error{summary.errors !== 1 ? "s" : ""}
                          </span>
                        )}
                        {summary.warnings > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-warning-500/20 bg-warning-50 text-warning-500 text-[11px] font-medium whitespace-nowrap">
                            {summary.warnings} warn
                          </span>
                        )}
                        {summary.infos > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary-500/20 bg-primary-50 text-primary-500 text-[11px] font-medium whitespace-nowrap">
                            {summary.infos} info
                          </span>
                        )}
                        {isClean && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-success-500/20 bg-success-500/10 text-success-500 text-[11px] font-medium whitespace-nowrap">
                            Clean
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Last scan status + branch */}
                  <div className="flex items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                      <span className="text-xs text-text-muted">
                        Last scan: {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    {proj?.branch && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                        {proj.branch}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
