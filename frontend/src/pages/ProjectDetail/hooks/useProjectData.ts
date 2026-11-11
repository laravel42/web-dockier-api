import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsApi } from "@/services/api";
import { getErrorMessage } from "@/utils/errors";
import type { Project } from "@/types";

/**
 * Core project data: fetch, loading, error, name update.
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
  const projectRef = useRef(project);
  projectRef.current = project;
  // The project the URL points at now. A response for any other one arrived after a
  // project switch and must not overwrite the page.
  const currentIdRef = useRef(projectId);
  currentIdRef.current = projectId;

  // Inline name edit
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Fetch project (reused for initial load and post-deploy refresh).
  // Resolves with the fetched project so callers (e.g. the post-deploy poll in
  // ProjectDetail) can inspect `infraState` without relying on stale closure
  // state. Resolves `null` on error, and returns `undefined` when there is no
  // projectId to fetch.
  const refetchProject = useCallback((opts?: { showLoading?: boolean }): Promise<Project | null> | undefined => {
    if (!projectId) return;
    if (opts?.showLoading) setLoading(true);
    return projectsApi.get(projectId)
      .then((p) => {
        if (currentIdRef.current !== projectId) return null;
        setProject(p);
        setError("");
        return p;
      })
      .catch((err: unknown) => {
        if (currentIdRef.current !== projectId) return null;
        // Only a load the page is waiting on may raise the page-level error:
        // ProjectDetail renders PageError whenever `error` is set, so letting a
        // background refresh (the post-deploy poll runs five of them) set it
        // replaced a working project page with "Failed to load project".
        if (opts?.showLoading || !projectRef.current) {
          setError(getErrorMessage(err, "Failed to load project"));
        }
        return null;
      })
      .finally(() => { if (currentIdRef.current === projectId) setLoading(false); });
  }, [projectId]);

  useEffect(() => {
    void refetchProject({ showLoading: true });
  }, [refetchProject]);

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

  return {
    projectId,
    project,
    setProject,
    refetchProject,
    loading,
    error,
    navigate,
    openDeployFromNav,
    handleUpdateName,
    nameSaving,
    nameError,
  };
}
