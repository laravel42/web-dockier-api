import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deployApi, projectsApi } from "../services/api";
import ProviderBadge from "../components/ProviderBadge";
import { getProviderStyle } from "../data/providers";

const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const cardCls = "bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)]";

interface Deployment {
  id: string;
  providerId: string;
  repo: string;
  branch: string;
  status: string;
  logs: string;
  appUrl: string;
  commitHash: string;
  dockerImage: string;
  deployStrategy: string;
  createdAt: string;
  updatedAt: string;
}

interface Provider {
  id: string;
  provider: string;
  label: string;
}

interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
}

const strategyLabels: Record<string, string> = { vps: "VPS", managed: "ECS Fargate", serverless: "App Runner" };

export default function DeployDetail() {
  const { deployId } = useParams<{ deployId: string }>();
  const navigate = useNavigate();

  const [deploy, setDeploy] = useState<Deployment | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sidebar: all deploys for same repo
  const [allDeploys, setAllDeploys] = useState<Deployment[]>([]);
  const [allDeploysLoading, setAllDeploysLoading] = useState(false);

  useEffect(() => {
    if (!deployId) return;
    let cancelled = false;

    Promise.all([
      deployApi.getDeployment(deployId),
      deployApi.listProviders(),
    ])
      .then(async ([d, pRes]) => {
        if (cancelled) return;
        setDeploy(d);
        setProviders(pRes.providers);
        // Find matching project
        try {
          const projRes = await projectsApi.list();
          if (cancelled) return;
          const match = projRes.projects.find((p: Project) => {
            try {
              const u = new URL(p.repository);
              const key = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean).join("/");
              return key === d.repo;
            } catch { return false; }
          });
          if (match) setProject(match);
        } catch {}
        // Fetch all deploys for sidebar
        if (cancelled) return;
        setAllDeploysLoading(true);
        deployApi.listDeployments()
          .then((res) => {
            if (cancelled) return;
            const repoDeploys = res.deployments.filter((dep) => dep.repo === d.repo);
            setAllDeploys(repoDeploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Deployment[]);
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setAllDeploysLoading(false); });
      })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Failed to load deployment"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [deployId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !deploy) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Deployment not found"}</p>
        <button onClick={() => navigate("/deploy")} className={btnSecondary}>Back to Deployments</button>
      </div>
    );
  }

  const prov = providers.find(p => p.id === deploy.providerId);
  const provKey = prov?.provider || "";
  const ps = getProviderStyle(provKey);

  const statusColors: Record<string, string> = {
    success: "bg-success-500/10 text-success-500",
    failed: "bg-danger-500/10 text-danger-500",
    building: "bg-warning-500/10 text-warning-500",
    deploying: "bg-primary-500/10 text-primary-500",
    pending: "bg-secondary-100 text-text-muted",
    destroyed: "bg-secondary-100 text-text-muted",
  };

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        <button onClick={() => navigate("/deploy")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Deployments
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-text">Deployment</h1>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[deploy.status] || "bg-secondary-100 text-text-muted"}`}>
                  {deploy.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {project && (
                  <button onClick={() => navigate(`/projects/${project.id}`)} className="text-sm text-primary-500 hover:text-primary-700 transition-colors">
                    {project.name}
                  </button>
                )}
                <span className="text-sm text-text-muted font-mono">{deploy.repo}</span>
                <span className="text-xs text-text-muted">{deploy.branch}</span>
                <span className="text-xs text-text-muted">{new Date(deploy.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <div className={`${cardCls} px-3 py-2 text-center`}>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <ProviderBadge provider={provKey} showName={false} iconSize="w-3.5 h-3.5" />
              <p className={`text-sm font-bold ${ps.text}`}>{provKey.toUpperCase()}</p>
            </div>
            <p className="text-[10px] text-text-muted">Provider</p>
          </div>
          <div className={`${cardCls} px-3 py-2 text-center`}>
            <p className="text-sm font-bold text-text">{strategyLabels[deploy.deployStrategy] || deploy.deployStrategy}</p>
            <p className="text-[10px] text-text-muted">Strategy</p>
          </div>
          {deploy.appUrl && (
            <div className={`${cardCls} px-3 py-2 text-center`}>
              <a href={deploy.appUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary-500 hover:text-primary-700 transition-colors truncate block">
                {deploy.appUrl.replace(/^https?:\/\//, "").slice(0, 25)}
              </a>
              <p className="text-[10px] text-text-muted">App URL</p>
            </div>
          )}
          {deploy.dockerImage && (
            <div className={`${cardCls} px-3 py-2 text-center`}>
              <p className="text-sm font-bold text-text truncate" title={deploy.dockerImage}>{deploy.dockerImage.split("/").pop()?.split(":")[0] || deploy.dockerImage}</p>
              <p className="text-[10px] text-text-muted">Docker Image</p>
            </div>
          )}
        </div>

        {/* Logs */}
        {deploy.logs && (
          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Deploy Logs</span>
            </div>
            <div className="bg-gray-950 px-4 py-3 max-h-[calc(100vh-380px)] overflow-y-auto">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{deploy.logs}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar: deploy history */}
      <div className="w-80 shrink-0">
        <div className="sticky top-6 space-y-3">
          <div className={`${cardCls} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Deploy History</p>
            </div>
            {allDeploysLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : allDeploys.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No deploys yet</p>
            ) : (
              <div className="max-h-[calc(100vh-180px)] overflow-y-auto divide-y divide-border">
                {allDeploys.map((d) => {
                  const isActive = d.id === deployId;
                  const dp = providers.find(p => p.id === d.providerId);
                  const dk = dp?.provider || "";
                  const statusDot = d.status === "success" ? "bg-success-500" : d.status === "failed" ? "bg-danger-500" : d.status === "building" || d.status === "deploying" ? "bg-primary-500" : "bg-secondary-300";
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => navigate(`/deploy/${d.id}`)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${isActive ? "bg-primary-50" : "hover:bg-secondary-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                        <span className={`text-xs font-medium truncate ${isActive ? "text-primary-600" : "text-text"}`}>
                          {new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 ml-4">
                        <ProviderBadge provider={dk} />
                        <span className="text-[10px] text-text-muted">{d.branch}</span>
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
