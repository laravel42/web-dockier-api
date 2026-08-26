import { useState, useEffect, useCallback } from "react";
import { projectsApi, gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { getErrorMessage } from "@/utils/errors";
import { useToast } from "@/context/useToast";
import { getDefaultDeployScript, FRAMEWORKS } from "@/config/frameworks";
import { PROJECT_TEMPLATES } from "./templates";
import type { Connection, Repo, Project } from "@/types";

export interface ProjectFormState {
  name: string;
  repository: string;
  branch: string;
}

interface UseProjectFormOptions {
  onSuccess: () => void;
}

/**
 * Manages project create/edit form state including:
 * - Form fields (name, repository, branch)
 * - Platform/template selection
 * - Cascading connection → repo → branch selects
 * - Submit (create/update) logic
 */
export function useProjectForm({ onSuccess }: UseProjectFormOptions) {
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pick<Project, "id" | "name" | "repository" | "branch" | "connectionId"> | null>(null);
  const [form, setForm] = useState<ProjectFormState>({ name: "", repository: "", branch: "" });
  const [platform, setPlatform] = useState("");

  // Connection / repo / branch cascading state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [refreshingRepos, setRefreshingRepos] = useState(false);
  const [searchingRepos, setSearchingRepos] = useState(false);
  const [hasMoreRepos, setHasMoreRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        // Use the cache when it's warm — only the first page is fetched.
        const res = await gitApi.listRepos(selectedConnectionId);
        if (!cancelled) { setRepos(res.repos); setHasMoreRepos(res.hasMore); }
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
      const res = await gitApi.listRepos(selectedConnectionId, { refresh: true });
      setRepos(res.repos);
      setHasMoreRepos(res.hasMore);
    } catch { /* ignore */ } finally {
      setRefreshingRepos(false);
    }
  };

  /** Server-side repo search (debounced by RepoSelect). Empty term restores the default page. */
  const searchRepos = async (term: string) => {
    if (!selectedConnectionId) return;
    setSearchingRepos(true);
    try {
      const res = await gitApi.listRepos(selectedConnectionId, { search: term || undefined });
      setRepos(res.repos);
      setHasMoreRepos(res.hasMore);
    } catch { /* non-fatal: keep the current list */ } finally {
      setSearchingRepos(false);
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

  // ── Auto-detect framework from repo badges ─────────────────────

  const [detectingPlatform, setDetectingPlatform] = useState(false);

  useEffect(() => {
    if (!selectedRepo || !selectedBranch || !selectedConnectionId) return;
    let cancelled = false;

    const detect = async () => {
      setDetectingPlatform(true);
      try {
        const res = await gitApi.getRepoBadges(selectedRepo, selectedBranch, selectedConnectionId);
        if (cancelled) return;
        // Match the highest-confidence badge against known frameworks
        const badgeNames = res.badges
          .sort((a, b) => b.confidence - a.confidence)
          .map((b) => b.name.toLowerCase());

        const match = FRAMEWORKS.find((fw) =>
          badgeNames.some((badge) =>
            badge === fw.id ||
            badge === fw.name.toLowerCase() ||
            badge.replace(/[.\s]/g, "") === fw.id.replace(/[.\s]/g, ""),
          ),
        );
        if (match && !cancelled) {
          setPlatform(match.id);
        }
      } catch {
        // Silently degrade — user can still pick manually
      } finally {
        if (!cancelled) setDetectingPlatform(false);
      }
    };

    detect();
    return () => { cancelled = true; };
  }, [selectedRepo, selectedBranch, selectedConnectionId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const repo = repos.find((r) => r.fullName === selectedRepo);
      const templateDef = PROJECT_TEMPLATES.find((t) => t.id === platform);
      const isTemplate = !!templateDef;

      const submitData = {
        name: form.name,
        repository: editing
          ? form.repository
          : isTemplate
            ? templateDef.defaultRepo
            : (repo?.url || form.repository || ""),
        branch: editing
          ? form.branch
          : isTemplate
            ? templateDef.defaultBranch
            : (selectedBranch || form.branch || ""),
        connectionId: editing ? editing.connectionId : selectedConnectionId,
        sourceType: isTemplate ? "template" as const : "repository" as const,
        template: isTemplate ? templateDef.id : undefined,
        platform,
        settings: { deployScript: getDefaultDeployScript(platform) },
      };
      if (editing) {
        await projectsApi.update(editing.id, submitData);
      } else {
        await projectsApi.create(submitData);
        // Run stack analysis before returning to index (so badges show immediately)
        if (!isTemplate) {
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
      }

      setShowForm(false); setEditing(null); resetSelections();
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false); setEditing(null); resetSelections();
  };

  return {
    // Form state
    showForm, editing, form, setForm,
    platform, setPlatform, detectingPlatform,
    // Connection / repo / branch
    connections, selectedConnectionId, setSelectedConnectionId,
    repos, selectedRepo, setSelectedRepo,
    branches, selectedBranch, setSelectedBranch,
    loadingRepos, loadingBranches, loadingConnections,
    refreshRepos, refreshingRepos,
    searchRepos, searchingRepos, hasMoreRepos,
    error, submitting,
    // Actions
    openCreate, closeForm, handleSubmit,
  };
}
