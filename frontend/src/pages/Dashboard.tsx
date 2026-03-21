import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, deployApi, codeAnalysisApi } from "../services/api";

const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

interface Project { id: string; name: string; repository: string; branch: string; createdAt: string; }
interface Deploy { id: string; providerId: string; repo: string; branch: string; status: string; appUrl: string; deployStrategy: string; createdAt: string; }
interface Scan { id: string; projectId: string; repo: string; branch: string; status: string; summary: { totalFindings: number; errors: number; warnings: number; infos: number }; createdAt: string; }
interface Provider { id: string; provider: string; label: string; }

const providerStyles: Record<string, { bg: string; text: string; icon: string }> = {
  aws: { bg: "bg-amber-500/10", text: "text-amber-600", icon: "amazonwebservices" },
  digitalocean: { bg: "bg-blue-500/10", text: "text-blue-600", icon: "digitalocean" },
  hetzner: { bg: "bg-red-500/10", text: "text-red-600", icon: "hetzner" },
  vultr: { bg: "bg-sky-500/10", text: "text-sky-600", icon: "vultr" },
  linode: { bg: "bg-emerald-500/10", text: "text-emerald-600", icon: "linode" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [projRes, depRes, scanRes, provRes] = await Promise.all([
          projectsApi.list(),
          deployApi.listDeployments(),
          codeAnalysisApi.listScans(),
          deployApi.listProviders(),
        ]);
        setProjects(projRes.projects);
        setDeploys(depRes.deployments);
        setScans(scanRes.scans);
        setProviders(provRes.providers);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  const successDeploys = deploys.filter(d => d.status === "success").length;
  const failedDeploys = deploys.filter(d => d.status === "failed").length;
  const totalFindings = scans.reduce((sum, s) => sum + (s.summary?.totalFindings || 0), 0);
  const recentDeploys = deploys.slice(0, 5);
  const recentScans = scans.slice(0, 5);

  // Map projectId → project name for scans
  const projectMap: Record<string, Project> = {};
  for (const p of projects) projectMap[p.id] = p;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const kpis = [
    { label: "Projects", value: projects.length, icon: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z", color: "text-primary-500", onClick: () => navigate("/projects") },
    { label: "Deployments", value: deploys.length, icon: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z", color: "text-primary-500", onClick: () => navigate("/deploy") },
    { label: "Successful", value: successDeploys, icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", color: "text-success-500", onClick: () => navigate("/deploy") },
    { label: "Failed", value: failedDeploys, icon: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z", color: "text-danger-500", onClick: () => navigate("/deploy") },
    { label: "Scans", value: scans.length, icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", color: "text-success-500", onClick: () => navigate("/security") },
    { label: "Findings", value: totalFindings, icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z", color: totalFindings > 0 ? "text-warning-500" : "text-text-muted", onClick: () => navigate("/security") },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Dashboard</h1>
        <button onClick={() => navigate("/projects", { state: { openCreate: true } })} className="h-9 px-4 inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Project
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {kpis.map((kpi) => (
          <button key={kpi.label} type="button" onClick={kpi.onClick} className={`${cardCls} p-4 text-center hover:shadow-md transition-all`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 mx-auto mb-2 ${kpi.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
            </svg>
            <p className="text-xl font-bold text-text">{kpi.value}</p>
            <p className="text-xs text-text-muted mt-1">{kpi.label}</p>
          </button>
        ))}
      </div>

      {/* Two-column: Recent Deploys + Recent Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Deploys */}
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Recent Deployments</h2>
            <button onClick={() => navigate("/deploy")} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">View all</button>
          </div>
          {recentDeploys.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No deployments yet</p>
          ) : (
            <div className="divide-y divide-border">
              {recentDeploys.map((d) => {
                const prov = providers.find(p => p.id === d.providerId);
                const pk = prov?.provider || "";
                const ps = providerStyles[pk] || { bg: "bg-secondary-100", text: "text-text-muted", icon: "" };
                const statusDot = d.status === "success" ? "bg-success-500" : d.status === "failed" ? "bg-danger-500" : d.status === "building" || d.status === "deploying" ? "bg-primary-500" : "bg-secondary-300";
                return (
                  <button key={d.id} type="button" onClick={() => navigate(`/deploy/${d.id}`)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-secondary-50/50 transition-colors text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text truncate">{d.repo}</p>
                      <p className="text-xs text-text-muted">{d.branch} · {new Date(d.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium shrink-0 ${ps.bg} ${ps.text}`}>
                      {ps.icon && <img src={`https://cdn.simpleicons.org/${ps.icon}`} alt="" className="w-2.5 h-2.5" />}
                      {pk.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Scans */}
        <div className={`${cardCls} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Recent Security Scans</h2>
            <button onClick={() => navigate("/security")} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">View all</button>
          </div>
          {recentScans.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">No scans yet</p>
          ) : (
            <div className="divide-y divide-border">
              {recentScans.map((s) => {
                const proj = projectMap[s.projectId];
                const statusDot = s.status === "completed" ? (s.summary?.totalFindings === 0 ? "bg-success-500" : s.summary?.errors > 0 ? "bg-danger-500" : "bg-warning-500") : s.status === "failed" ? "bg-danger-500" : "bg-primary-500";
                return (
                  <button key={s.id} type="button" onClick={() => navigate(`/security/${s.id}`)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-secondary-50/50 transition-colors text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text truncate">{proj?.name || s.repo}</p>
                      <p className="text-xs text-text-muted">{s.branch} · {new Date(s.createdAt).toLocaleDateString()}</p>
                    </div>
                    {s.summary && s.status === "completed" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.summary.errors > 0 && <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-danger-500/10 text-danger-500">{s.summary.errors}</span>}
                        {s.summary.warnings > 0 && <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-warning-50 text-warning-500">{s.summary.warnings}</span>}
                        {s.summary.infos > 0 && <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-primary-50 text-primary-500">{s.summary.infos}</span>}
                        {s.summary.totalFindings === 0 && <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-success-500/10 text-success-500">Clean</span>}
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
  );
}
