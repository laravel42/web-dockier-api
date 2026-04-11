import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../services/api";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import SourceControlSelect from "../components/SourceControlSelect";
import RepoSelect from "../components/RepoSelect";
import BranchSelect from "../components/BranchSelect";
import TechBadge from "../components/TechBadge";
import PlatformBadge from "../components/PlatformBadge";
import SourceControlBadge from "../components/SourceControlBadge";

import { btnSecondary } from "../utils/styles";

const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";
const btnPrimary = "h-10 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors shadow-sm";



interface Connection { id: string; provider: string; label: string; repoUrl: string; createdAt: string; }
interface Repo { name: string; fullName: string; url: string; defaultBranch: string; private: boolean; }

function getRepoSlug(repoUrl: string): string {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : path || "—";
  } catch {
    return repoUrl?.split("/").pop()?.replace(/\.git$/, "") || "—";
  }
}

function getRepoKey(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join("/") : null;
  } catch {
    return null;
  }
}

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Array<{ id: string; name: string; repository: string; branch: string; connectionId: string; platform?: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; repository: string; branch: string; connectionId: string } | null>(null);
  const [form, setForm] = useState({ name: "", repository: "", branch: "" });
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => (localStorage.getItem("projects-view") as "cards" | "table") || "cards");

  // Multi-step selection state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [error, setError] = useState("");
  const [deployments, setDeployments] = useState<Array<{ id: string; repo: string; branch: string; status: string; createdAt: string }>>([]);
  const [projectLangs, setProjectLangs] = useState<Record<string, Array<{ name: string; category: string; confidence: number }>>>({});
  const fetchedLangsRef = useRef<Set<string>>(new Set());

  const fetchProjects = async () => {
    setLoading(true);
    try { const res = await projectsApi.list(); setProjects(res.projects); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  // Fetch tech badges from analysis_cache for each project
  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      if (!p.repository || fetchedLangsRef.current.has(p.id)) continue;
      fetchedLangsRef.current.add(p.id);
      const parsed = getRepoKey(p.repository);
      if (!parsed) continue;
      gitApi.getRepoBadges(parsed, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs(prev => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

  useEffect(() => {
    deployApi.listDeployments().then((r) => setDeployments(r.deployments || [])).catch(() => {});
  }, []);

  // Load connections when modal opens
  const fetchConnections = async () => {
    setLoadingConnections(true);
    try {
      const res = await gitApi.listConnections();
      setConnections(res.connections);
    } catch (err) { console.error(err); }
    finally { setLoadingConnections(false); }
  };

  // Load repos when a connection is selected
  useEffect(() => {
    if (!selectedConnectionId) { setRepos([]); setSelectedRepo(""); setBranches([]); setSelectedBranch(""); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingRepos(true);
      setRepos([]); setSelectedRepo(""); setBranches([]); setSelectedBranch(""); setError("");
      try {
        const res = await gitApi.listRepos(selectedConnectionId);
        if (!cancelled) setRepos(res.repos);
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "Failed to load repositories");
      }
      finally { if (!cancelled) setLoadingRepos(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedConnectionId]);

  // Load branches when a repo is selected
  useEffect(() => {
    if (!selectedConnectionId || !selectedRepo) { setBranches([]); setSelectedBranch(""); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingBranches(true);
      setBranches([]); setSelectedBranch("");
      const repo = repos.find(r => r.fullName === selectedRepo);
      if (!repo) return;
      const parts = repo.fullName.split("/");
      const repoName = parts.pop()!;
      const owner = parts.join("/");
      try {
        const res = await gitApi.listBranches(selectedConnectionId, owner, repoName);
        if (!cancelled) {
          setBranches(res.branches);
          // Auto-select default branch if available
          if (res.branches.includes(repo.defaultBranch)) {
            setSelectedBranch(repo.defaultBranch);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "Failed to load branches");
      }
      finally { if (!cancelled) setLoadingBranches(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedConnectionId, selectedRepo, repos]);

  const resetSelections = () => {
    setSelectedConnectionId(""); setRepos([]); setSelectedRepo("");
    setBranches([]); setSelectedBranch(""); setConnections([]); setError("");
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", repository: "", branch: "" });
    resetSelections();
    setShowForm(true);
    fetchConnections();
  };

  // Auto-open create modal when navigated with state
  useEffect(() => {
    if ((location.state as { openCreate?: boolean })?.openCreate) {
      openCreate();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const repo = repos.find(r => r.fullName === selectedRepo);
    const submitData = {
      name: form.name,
      repository: editing ? form.repository : (repo?.url || form.repository),
      branch: editing ? form.branch : (selectedBranch || form.branch),
      connectionId: editing ? editing.connectionId : selectedConnectionId,
    };
    if (editing) {
      await projectsApi.update(editing.id, submitData);
    } else {
      await projectsApi.create(submitData);
      // Pre-warm analysis cache in the background
      try {
        const repoUrl = repo?.url || form.repository;
        const u = new URL(repoUrl);
        const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
        if (parts.length >= 2) {
          const owner = parts[0];
          const repoName = parts[1];
          const br = selectedBranch || form.branch || "main";
          // Fire and forget — don't block the UI
          gitApi.analyzeRepo(selectedConnectionId, owner, repoName, br).catch(() => {});
        }
      } catch { /* pre-warm is fire-and-forget */ }
    }
    setShowForm(false); setEditing(null); resetSelections(); fetchProjects();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Projects</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary-50 border border-border rounded-lg p-0.5 h-10">
            <button
              onClick={() => { setViewMode("cards"); localStorage.setItem("projects-view", "cards"); }}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "cards" ? "bg-card text-primary-500 shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
              title="Card view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            </button>
            <button
              onClick={() => { setViewMode("table"); localStorage.setItem("projects-view", "table"); }}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "table" ? "bg-card text-primary-500 shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
              title="Table view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>
          </div>
          <button onClick={openCreate} className={`${btnPrimary} inline-flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New Project
          </button>
        </div>
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); resetSelections(); }} title={editing ? "Edit Project" : "New Project"} size="xl">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 space-y-4">
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
            <input id="project-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="My App" required />
          </div>

          {/* Step 1: Source Control */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Source Control</label>
            <SourceControlSelect
              value={selectedConnectionId}
              onChange={setSelectedConnectionId}
              connections={connections}
              loading={loadingConnections}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-[var(--radius-input)] bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}

          {!selectedConnectionId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center text-primary-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
              <p className="text-sm font-medium text-text-secondary">Connect your source control</p>
              <p className="text-xs text-text-muted max-w-xs">Select a source control provider above to browse your repositories and pick a branch.</p>
            </div>
          )}

          {/* Step 2: Repository */}
          {selectedConnectionId && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Repository</label>
              <RepoSelect
                value={selectedRepo}
                onChange={(val) => {
                  setSelectedRepo(val);
                  if (!form.name && val) {
                    const repo = repos.find(r => r.fullName === val);
                    if (repo) setForm(f => ({ ...f, name: repo.name }));
                  }
                }}
                repos={repos}
                loading={loadingRepos}
              />
            </div>
          )}

          {/* Step 3: Branch */}
          {selectedRepo && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Branch</label>
              <BranchSelect
                value={selectedBranch}
                onChange={setSelectedBranch}
                branches={branches}
                loading={loadingBranches}
              />
            </div>
          )}

          <div className="absolute bottom-4 right-6 flex items-center gap-3">
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); resetSelections(); }} className={btnSecondary}>Cancel</button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={!editing && (!form.name || !selectedRepo || !selectedBranch)}
            >
              {editing ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : projects.length === 0 ? (
        <p className="text-text-muted text-center py-12 text-sm">No projects yet. Create one to get started.</p>
      ) : viewMode === "table" ? (
        <div className="bg-card border border-border rounded-[var(--radius-card)] overflow-hidden shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Tech</th>
                <th className="px-4 py-3 font-medium">Last Deploy</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const repoKey = p.repository ? getRepoKey(p.repository) : null;
                const lastDeploy = repoKey
                  ? deployments
                      .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
                  : null;
                const statusColors: Record<string, string> = {
                  success: "bg-success-500", failed: "bg-danger-500", building: "bg-warning-500",
                  deploying: "bg-primary-500", pending: "bg-secondary-400",
                };
                const badges = projectLangs[p.id];
                return (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="border-b border-border last:border-0 hover:bg-secondary-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text">{p.name}</td>
                    <td className="px-4 py-3 text-text-secondary lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted">
                        {p.branch || "main"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {badges && badges.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {badges.slice(0, 3).map((b) => (
                            <TechBadge key={b.name} name={b.name} />
                          ))}
                        </div>
                      ) : p.platform ? (
                        <PlatformBadge slug={p.platform} />
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lastDeploy ? (
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
                          <span className="text-xs text-text-muted">
                            {new Date(lastDeploy.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {projects.map((p) => {
            const repoKey = p.repository ? getRepoKey(p.repository) : null;
            const lastDeploy = repoKey
              ? deployments
                  .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
              : null;
            const statusColors: Record<string, string> = {
              success: "bg-success-500",
              failed: "bg-danger-500",
              building: "bg-warning-500",
              deploying: "bg-primary-500",
              pending: "bg-secondary-400",
            };
            const scProvider = p.repository?.includes("gitlab") ? "gitlab" : "github";
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
              >
                {/* Header: icon, slug */}
                <div className="flex items-center gap-3 min-w-0">
                    <SourceControlBadge provider={scProvider} showName={false} iconSize="w-6 h-6" />
                    <span className="text-sm text-text-secondary truncate lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</span>
                </div>

                {/* Title & branch */}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-text truncate">{p.name}</h3>
                  {(() => {
                    const badges = projectLangs[p.id];
                    if (badges && badges.length > 0) {
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {badges.slice(0, 4).map((b) => (
                            <TechBadge key={b.name} name={b.name} />
                          ))}
                        </div>
                      );
                    }
                    if (p.platform) {
                      return (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <PlatformBadge slug={p.platform} />
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Last deploy + branch */}
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <div className="flex items-center gap-2">
                    {lastDeploy ? (
                      <>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
                        <span className="text-xs text-text-muted">
                          Last deploy: {new Date(lastDeploy.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-text-muted">No deployments yet</span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    {p.branch || "main"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) projectsApi.delete(deleteId).then(fetchProjects); }} message="Are you sure you want to delete this project?" />
    </div>
  );
}
