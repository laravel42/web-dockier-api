import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi } from "../../services/api";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import { getErrorMessage } from "../../utils/errors";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import { useToast } from "../../context/useToast";
import type { Connection, Repo, Project } from "../../types";
import { compareByTime } from "../../utils/sortByTime";

export function useProjects() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pick<Project, "id" | "name" | "repository" | "branch" | "connectionId"> | null>(null);
  const [form, setForm] = useState({ name: "", repository: "", branch: "" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    () => (localStorage.getItem("projects-view") as "cards" | "table") || "cards",
  );

  // Source type: "repository" (existing) or "template" (new)
  const [platform, setPlatform] = useState("");

  // Multi-step selection state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshingRepos, setRefreshingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await projectsApi.list();
      setProjects([...res.projects].sort((a, b) => compareByTime(a, b, "created")));
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to load projects"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  // ── Connection / repo / branch cascading fetches ───────────────

  const fetchConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const res = await gitApi.listConnections();
      setConnections(res.connections);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load source control connections"));
    } finally {
      setLoadingConnections(false);
    }
  }, [toast]);

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
        const res = await gitApi.listRepos(selectedConnectionId, true);
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

  const refreshRepos = async () => {
    if (!selectedConnectionId) return;
    setRefreshingRepos(true);
    try {
      const res = await gitApi.listRepos(selectedConnectionId, true);
      setRepos(res.repos);
    } catch { /* ignore */ } finally {
      setRefreshingRepos(false);
    }
  };

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
    setPlatform("");
  };

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ name: "", repository: "", branch: "" });
    resetSelections();
    setShowForm(true);
    fetchConnections();
  }, [fetchConnections]);

  // Auto-open create modal when navigated with state
  useEffect(() => {
    if ((location.state as { openCreate?: boolean })?.openCreate) {
      openCreate();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, openCreate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const repo = repos.find((r) => r.fullName === selectedRepo);
      const submitData = {
        name: form.name,
        repository: editing ? form.repository : (repo?.url || form.repository || ""),
        branch: editing ? form.branch : (selectedBranch || form.branch || ""),
        connectionId: editing ? editing.connectionId : selectedConnectionId,
        sourceType: "repository" as const,
        platform,
      };
      if (editing) {
        await projectsApi.update(editing.id, submitData);
      } else {
        await projectsApi.create(submitData);
        // Run stack analysis before returning to index (so badges show immediately)
        try {
          const repoUrl = repo?.url || form.repository;
          const parsed = parseOwnerRepo(repoUrl);
          if (parsed) {
            const br = selectedBranch || form.branch || "main";
            await gitApi.getStackAnalysis(selectedConnectionId, parsed.owner, parsed.repo, br);
            gitApi.analyzeRepo(selectedConnectionId, parsed.owner, parsed.repo, br, "openai").catch(() => {});
          }
        } catch { /* don't block on failure */ }
      }

      setShowForm(false); setEditing(null); resetSelections(); fetchProjects();
    } finally {
      setSubmitting(false);
    }
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

  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(projects);

  return {
    navigate,
    projects, loading, loadError, reload: fetchProjects,
    showForm, editing, form, setForm,
    deleteId, setDeleteId,
    viewMode, changeViewMode,
    // platform
    platform, setPlatform,
    // form / modal
    connections, selectedConnectionId, setSelectedConnectionId,
    repos, selectedRepo, setSelectedRepo,
    branches, selectedBranch, setSelectedBranch,
    loadingRepos, loadingBranches, loadingConnections,
    refreshRepos, refreshingRepos,
    error, submitting,
    openCreate, closeForm, handleSubmit,
    confirmDelete,
    // derived
    projectLangs, projectBadgeLoading,
  };
}
