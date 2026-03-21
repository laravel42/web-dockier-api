import { useState, useEffect } from "react";
import { deployApi, gitApi } from "../services/api";

export default function Deploy() {
  const [providers, setProviders] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [showDeployForm, setShowDeployForm] = useState(false);
  const [deployForm, setDeployForm] = useState({ providerId: "", gitConnectionId: "", repo: "", branch: "main" });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, d, c] = await Promise.all([deployApi.listProviders(), deployApi.listDeployments(), gitApi.listConnections()]);
      setProviders(p.providers); setDeployments(d.deployments); setConnections(c.connections);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    await deployApi.createDeployment(deployForm);
    setShowDeployForm(false); setDeployForm({ providerId: "", gitConnectionId: "", repo: "", branch: "main" }); fetchData();
  };

  const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";

  const statusStyle: Record<string, string> = {
    pending: "bg-warning-50 text-warning-500",
    building: "bg-primary-50 text-primary-500",
    deploying: "bg-primary-100 text-primary-700",
    success: "bg-success-50 text-success-500",
    failed: "bg-danger-50 text-danger-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Deployments</h1>
        <button onClick={() => setShowDeployForm(!showDeployForm)}
          className="h-10 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors shadow-sm">
          {showDeployForm ? "Cancel" : "New Deployment"}
        </button>
      </div>

      {showDeployForm && (
        <div className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6 mb-8 border border-border/50">
          <form onSubmit={handleDeploy} className="space-y-4">
            <div>
              <label htmlFor="deploy-provider" className="block text-sm font-medium text-text-secondary mb-1.5">Server Provider</label>
              <select id="deploy-provider" value={deployForm.providerId} onChange={(e) => setDeployForm({ ...deployForm, providerId: e.target.value })} className={inputCls} required>
                <option value="">Select provider...</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.provider})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="deploy-git" className="block text-sm font-medium text-text-secondary mb-1.5">Source Control Connection</label>
              <select id="deploy-git" value={deployForm.gitConnectionId} onChange={(e) => setDeployForm({ ...deployForm, gitConnectionId: e.target.value })} className={inputCls} required>
                <option value="">Select connection...</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.provider})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="deploy-repo" className="block text-sm font-medium text-text-secondary mb-1.5">Repository (owner/repo)</label>
              <input id="deploy-repo" type="text" value={deployForm.repo} onChange={(e) => setDeployForm({ ...deployForm, repo: e.target.value })} className={inputCls} placeholder="owner/repo" required />
            </div>
            <div>
              <label htmlFor="deploy-branch" className="block text-sm font-medium text-text-secondary mb-1.5">Branch</label>
              <input id="deploy-branch" type="text" value={deployForm.branch} onChange={(e) => setDeployForm({ ...deployForm, branch: e.target.value })} className={inputCls} />
            </div>
            <button type="submit" className="h-10 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors shadow-sm">Deploy</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {deployments.map((d) => (
            <div key={d.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex items-center justify-between hover:shadow-[var(--shadow-card-hover)] transition-all border border-transparent hover:border-border/50">
              <div>
                <h3 className="text-sm font-semibold text-text">{d.repo}</h3>
                <p className="text-sm text-text-secondary mt-0.5">Branch: {d.branch} · {new Date(d.createdAt).toLocaleString()}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${statusStyle[d.status] || "bg-secondary-100 text-text-muted"}`}>
                {d.status}
              </span>
            </div>
          ))}
          {deployments.length === 0 && <p className="text-text-muted text-center py-12 text-sm">No deployments yet. Configure providers and source control in Settings first.</p>}
        </div>
      )}
    </div>
  );
}
