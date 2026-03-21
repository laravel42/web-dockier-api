import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../services/api";
import Modal from "../components/Modal";
import ConfirmModal from "../components/ConfirmModal";
import SourceControlSelect from "../components/SourceControlSelect";
import RepoSelect from "../components/RepoSelect";
import BranchSelect from "../components/BranchSelect";

const inputCls = "w-full h-11 px-4 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10 transition-all";
const btnPrimary = "h-10 px-5 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 transition-colors shadow-sm";
const btnSecondary = "h-9 px-4 bg-secondary-50 text-text text-sm font-medium rounded-[var(--radius-btn)] hover:bg-secondary-100 transition-colors";
const btnDanger = "text-sm text-danger-500 hover:text-danger-700 font-medium transition-colors";

const PLATFORM_NAMES: Record<string, string> = {
  react: "React", nextjs: "Next.js", vue: "Vue", nuxt: "Nuxt", angular: "Angular", svelte: "Svelte",
  sveltekit: "SvelteKit", laravel: "Laravel", django: "Django", flask: "Flask", fastapi: "FastAPI",
  express: "Express", nestjs: "Nest.js", rails: "Rails", spring: "Spring", "spring-boot": "Spring Boot",
  go: "Go", rust: "Rust", python: "Python", php: "PHP", ruby: "Ruby", java: "Java", kotlin: "Kotlin",
  nodejs: "Node.js", astro: "Astro", remix: "Remix", gatsby: "Gatsby", solid: "Solid",
  "react-native": "React Native", flutter: "Flutter", dotnet: ".NET", symfony: "Symfony",
  hono: "Hono", fastify: "Fastify", bun: "Bun", deno: "Deno", elixir: "Elixir",
};

const PLATFORM_ICONS: Record<string, string> = {
  react: "react", nextjs: "nextdotjs", vue: "vuedotjs", nuxt: "nuxtdotjs", angular: "angular",
  svelte: "svelte", sveltekit: "svelte", laravel: "laravel", django: "django", flask: "flask",
  fastapi: "fastapi", express: "express", nestjs: "nestjs", rails: "rubyonrails", spring: "spring",
  "spring-boot": "springboot", go: "go", rust: "rust", python: "python", php: "php", ruby: "ruby",
  java: "openjdk", kotlin: "kotlin", nodejs: "nodedotjs", astro: "astro", remix: "remix",
  gatsby: "gatsby", solid: "solid", "react-native": "react", flutter: "flutter", dotnet: "dotnet",
  symfony: "symfony", hono: "hono", fastify: "fastify", bun: "bun", deno: "deno", elixir: "elixir",
};

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
  const [deployments, setDeployments] = useState<Array<{ id: string; repo: string; branch: string; status: string; createdAt: string }>>([]);

  const fetchProjects = async () => {
    setLoading(true);
    try { const res = await projectsApi.list(); setProjects(res.projects); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

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
        <h1 className="text-2xl font-display font-semibold text-text tracking-tight">Projects</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
            const platformLabel = p.platform ? (PLATFORM_NAMES[p.platform] || p.platform) : null;
            const isGitHub = p.repository?.includes("github");
            const isGitLab = p.repository?.includes("gitlab");
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="bg-card border border-border rounded-[var(--radius-card)] p-5 flex flex-col gap-4 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
              >
                {/* Header: icon, slug */}
                <div className="flex items-center gap-3 min-w-0">
                    {isGitLab ? (
                      <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0 text-text-secondary" fill="currentColor">
                        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-7 h-7 shrink-0 text-text-secondary" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                    )}
                    <span className="text-base text-text-secondary truncate lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</span>
                </div>

                {/* Title & branch */}
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-text truncate">{p.name}</h3>
                  <p className="flex items-center gap-1.5 text-sm text-text-muted mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    {p.branch || "main"}
                  </p>
                </div>

                {/* Tech badge */}
                {platformLabel && (
                  <div>
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-50 text-text-secondary text-sm font-medium">
                      <img src={`https://cdn.simpleicons.org/${PLATFORM_ICONS[p.platform] || p.platform}`} alt="" className="w-4 h-4" />
                      {platformLabel}
                    </span>
                  </div>
                )}

                {/* Last deploy */}
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
              </div>
            );
          })}
          {projects.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-full">No projects yet. Create one to get started.</p>}
        </div>
      )}
      <ConfirmModal open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={() => { if (deleteId) projectsApi.delete(deleteId).then(fetchProjects); }} message="Are you sure you want to delete this project?" />
    </div>
  );
}
