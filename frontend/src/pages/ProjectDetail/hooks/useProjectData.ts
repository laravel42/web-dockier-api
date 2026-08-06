import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { getErrorMessage } from "@/utils/errors";
import type { Project, RepoStats } from "@/types";

/**
 * Core project data: fetch, loading, error, name update, delete, pull, branch switch.
 *
 * This hook owns `project` state and exposes it to sibling hooks via its return value.
 */
export function useProjectData() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Header actions
  const [showDelete, setShowDelete] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // Inline name edit
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Pull from origin
  const [pullLog, setPullLog] = useState<string[] | null>(null);
  const [pullLoading, setPullLoading] = useState(false);

  // Branch selector
  const [branchList, setBranchList] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  // Fetch project
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    projectsApi.get(projectId)
      .then((p) => setProject(p))
      .catch((err: unknown) => setError(getErrorMessage(err, "Failed to load project")))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Auto-open deploy wizard from navigation state (handled in composer)
  const openDeployFromNav = !!(location.state as { openDeploy?: boolean })?.openDeploy;
  useEffect(() => {
    if (openDeployFromNav) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [openDeployFromNav, location.pathname, navigate]);

  // ─── Actions ─────────────────────────────────────────────────────

  const handleUpdateName = async (name: string) => {
    if (!projectId || !project) return;
    setNameSaving(true);
    setNameError("");
    try {
      const updated = await projectsApi.update(projectId, { name });
      setProject(updated);
    } catch (err: unknown) {
      setNameError(getErrorMessage(err, "Failed to update project name"));
      throw err;
    } finally {
      setNameSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId || !project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (parsed) {
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey).catch(() => {});
      gitApi.invalidateStatsCache(repoKey).catch(() => {});
      gitApi.invalidateAnalysisCache(repoKey).catch(() => {});
    }
    await projectsApi.delete(projectId);
    navigate("/projects");
  };

  const handlePullOrigin = async (stats: RepoStats | null) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    setPullLoading(true);
    setPullLog(["$ git pull origin " + (project.branch || "main"), "Connecting to remote…"]);
    try {
      const res = await gitApi.pullOrigin(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", stats?.lastCommitHash);
      setPullLog(res.log);
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey, project.branch || "main")
        .then(() => gitApi.getStackAnalysis(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, project.id))
        .catch(() => {});
      gitApi.invalidateStatsCache(repoKey, project.branch || "main").catch(() => {});
    } catch (err: unknown) {
      setPullLog((prev) => [...(prev || []), `error: ${(err as Error).message || "Pull failed"}`]);
    } finally {
      setPullLoading(false);
    }
  };

  const loadBranches = async () => {
    if (!project) return;
    setBranchSearch("");
    setBranchLoading(true);
    try {
      const parsed = parseOwnerRepo(project.repository);
      if (parsed) {
        const res = await gitApi.listBranches(project.connectionId, parsed.owner, parsed.repo);
        setBranchList(res.branches);
      }
    } catch {
      setBranchList([]);
    } finally {
      setBranchLoading(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    if (!project || !projectId) return;
    const parsed = parseOwnerRepo(project.repository);
    if (parsed) {
      const repoKey = `${parsed.owner}/${parsed.repo}`;
      gitApi.invalidateStackCache(repoKey)
        .then(() => gitApi.getStackAnalysis(project.connectionId, parsed.owner, parsed.repo, branch, project.id))
        .catch(() => {});
      gitApi.invalidateStatsCache(repoKey).catch(() => {});
    }
    await projectsApi.update(projectId, { branch });
    navigate(0);
  };

  return {
    projectId,
    project,
    setProject,
    loading,
    error,
    navigate,
    openDeployFromNav,
    // Header
    showDelete,
    setShowDelete,
    headerMenuOpen,
    setHeaderMenuOpen,
    handleDelete,
    handlePullOrigin,
    handleUpdateName,
    nameSaving,
    nameError,
    // Branch
    loadBranches,
    branchList,
    branchLoading,
    branchSearch,
    setBranchSearch,
    handleSwitchBranch,
    // Pull log
    pullLog,
    setPullLog,
    pullLoading,
  };
}
