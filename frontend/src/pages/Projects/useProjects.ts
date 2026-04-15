import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../../services/api";
import { getRepoKey } from "./utils";
import type { Connection, Repo, Project, TechBadgeInfo, ProjectSourceType } from "./types";
import { PROJECT_TEMPLATES } from "./templates";

export function useProjects() {
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pick<Project, "id" | "name" | "repository" | "branch" | "connectionId"> | null>(null);
  const [form, setForm] = useState({ name: "", repository: "", branch: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    () => (localStorage.getItem("projects-view") as "cards" | "table") || "cards",
  );

  // Source type: "repository" (existing) or "template" (new)
  const [sourceType, setSourceType] = useState<ProjectSourceType>("repository");
  const [selectedTemplate, setSelectedTemplate] = useState("");

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
  const [projectLangs, setProjectLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const fetchedLangsRef = useRef<Set<string>>(new Set());

  // ── Data fetching ──────────────────────────────────────────────

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await projectsApi.list();
      setProjects(res.projects);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  // Fetch tech badges for each project
  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      if (!p.repository || fetchedLangsRef.current.has(p.id)) continue;
      fetchedLangsRef.current.add(p.id);
      const parsed = getRepoKey(p.repository);
      if (!parsed) continue;
      gitApi
        .getRepoBadges(parsed, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs((prev) => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

  useEffect(() => {
    deployApi
      .listDeployments()
      .then((r) => setDeployments(r.deployments || []))
      .catch(() => {});
  }, []);

  // ── Connection / repo / branch cascading fetches ───────────────

  const fetchConnections = async () => {
    setLoadingConnections(true);
    try {
      const res = await gitApi.listConnections();
      setConnections(res.connections);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConnections(false);
    }
  };

  useEffect(() => {
    if (!selectedConnectionId) {
      setRepos([]); setSelectedRepo(""); setBranches([]); setSelectedBranch("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingRepos(true);
      setRepos([]); setSelectedRepo(""); setBranches([]); setSelectedBranch(""); setError("");
      try {
        const res = await gitApi.listRepos(selectedConnectionId);
        if (!cancelled) setRepos(res.repos);
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "Failed to load repositories");
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedConnectionId]);

  useEffect(() => {
    if (!selectedConnectionId || !selectedRepo) {
      setBranches([]); setSelectedBranch("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingBranches(true);
      setBranches([]); setSelectedBranch("");
      const repo = repos.find((r) => r.fullName === selectedRepo);
      if (!repo) return;
      const parts = repo.fullName.split("/");
      const repoName = parts.pop()!;
      const owner = parts.join("/");
      try {
        const res = await gitApi.listBranches(selectedConnectionId, owner, repoName);
        if (!cancelled) {
          setBranches(res.branches);
          if (res.branches.includes(repo.defaultBranch)) {
            setSelectedBranch(repo.defaultBranch);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || "Failed to load branches");
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedConnectionId, selectedRepo, repos]);

  // ── Actions ────────────────────────────────────────────────────

  const resetSelections = () => {
    setSelectedConnectionId(""); setRepos([]); setSelectedRepo("");
    setBranches([]); setSelectedBranch(""); setConnections([]); setError("");
    setSourceType("repository"); setSelectedTemplate("");
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

    if (sourceType === "template") {
      const tpl = PROJECT_TEMPLATES.find((t) => t.id === selectedTemplate);
      if (!tpl) return;
      await projectsApi.create({
        name: form.name,
        repository: tpl.defaultRepo,
        branch: tpl.defaultBranch,
        connectionId: "",
        sourceType: "template",
        template: tpl.id,
      });
    } else {
      const repo = repos.find((r) => r.fullName === selectedRepo);
      const submitData = {
        name: form.name,
        repository: editing ? form.repository : (repo?.url || form.repository),
        branch: editing ? form.branch : (selectedBranch || form.branch),
        connectionId: editing ? editing.connectionId : selectedConnectionId,
        sourceType: "repository" as const,
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
            gitApi.analyzeRepo(selectedConnectionId, owner, repoName, br).catch(() => {});
          }
        } catch { /* pre-warm is fire-and-forget */ }
      }
    }

    setShowForm(false); setEditing(null); resetSelections(); fetchProjects();
  };

  const closeForm = () => {
    setShowForm(false); setEditing(null); resetSelections();
  };

  const changeViewMode = (mode: "cards" | "table") => {
    setViewMode(mode);
    localStorage.setItem("projects-view", mode);
  };

  const confirmDelete = () => {
    if (deleteId) projectsApi.delete(deleteId).then(fetchProjects);
  };

  return {
    navigate,
    projects, loading,
    showForm, editing, form, setForm,
    deleteId, setDeleteId,
    viewMode, changeViewMode,
    // source type
    sourceType, setSourceType,
    selectedTemplate, setSelectedTemplate,
    // form / modal
    connections, selectedConnectionId, setSelectedConnectionId,
    repos, selectedRepo, setSelectedRepo,
    branches, selectedBranch, setSelectedBranch,
    loadingRepos, loadingBranches, loadingConnections,
    error,
    openCreate, closeForm, handleSubmit,
    confirmDelete,
    // derived
    deployments, projectLangs,
  };
}
