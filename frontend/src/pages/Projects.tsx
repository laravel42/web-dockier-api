import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, gitApi } from "../services/api";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import SourceControlSelect from "../components/SourceControlSelect";
import RepoSelect from "../components/RepoSelect";
import BranchSelect from "../components/BranchSelect";

const inputCls = "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
const btnPrimary = "h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors";
const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const btnDanger = "text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors";

interface Connection { id: string; provider: string; label: string; repoUrl: string; createdAt: string; }
interface Repo { name: string; fullName: string; url: string; defaultBranch: string; private: boolean; }

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", repository: "", branch: "" });
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const fetchProjects = async () => {
    setLoading(true);
    try { const res = await projectsApi.list(); setProjects(res.projects); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

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
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load repositories");
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
      const [owner, repoName] = repo.fullName.split("/");
      try {
        const res = await gitApi.listBranches(selectedConnectionId, owner, repoName);
        if (!cancelled) {
          setBranches(res.branches);
          // Auto-select default branch if available
          if (res.branches.includes(repo.defaultBranch)) {
            setSelectedBranch(repo.defaultBranch);
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load branches");
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

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({ name: p.name, repository: p.repository, branch: p.branch || "" });
    resetSelections();
    setShowForm(true);
    fetchConnections();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const repo = repos.find(r => r.fullName === selectedRepo);
    const submitData = {
      name: form.name,
      repository: editing ? form.repository : (repo?.url || form.repository),
      branch: editing ? form.branch : (selectedBranch || form.branch),
      connectionId: editing ? (form as any).connectionId : selectedConnectionId,
    };
    if (editing) {
      await projectsApi.update(editing.id, submitData);
    } else {
      await projectsApi.create(submitData);
    }
    setShowForm(false); setEditing(null); resetSelections(); fetchProjects();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text">Projects</h1>
        <button onClick={openCreate} className={btnPrimary}>New Project</button>
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
                onChange={setSelectedRepo}
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

          <div className="flex items-center justify-end gap-3 pt-2 mt-auto">
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-card rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-5 flex flex-col justify-between hover:shadow-[var(--shadow-card-hover)] transition-shadow cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 text-primary-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-text truncate">{p.name}</h3>
                </div>
                {p.repository && (
                  <div className="flex items-center gap-1.5 text-sm text-text-secondary mb-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    <span className="truncate">{p.repository}</span>
                  </div>
                )}
                {p.branch && (
                  <div className="flex items-center gap-1.5 text-sm text-text-secondary mb-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    <span>{p.branch}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <p className="text-xs text-text-muted">{new Date(p.createdAt).toLocaleDateString()}</p>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="text-sm text-primary-500 hover:text-primary-700 font-medium transition-colors">Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }} className={btnDanger}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No projects yet. Create one to get started.</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) projectsApi.delete(deleteId).then(fetchProjects); }} message="Are you sure you want to delete this project?" />
    </div>
  );
}
