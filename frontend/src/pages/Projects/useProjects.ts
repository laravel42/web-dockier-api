import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { projectsApi } from "@/services/api";
import { useProjectBadges } from "@/hooks/useProjectBadges";
import { useProjectRepoFavicons } from "@/hooks/useProjectRepoFavicon";
import { useViewMode } from "@/hooks/useViewMode";
import { usePaginatedData } from "@/hooks/usePaginatedData";
import { useProjectForm } from "./useProjectForm";

const PAGE_SIZE = 50;

export function useProjects() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── List data ──────────────────────────────────────────────────

  const {
    items: projects,
    loading,
    error: loadError,
    pagination,
    search,
    goToPage,
    handleSearch,
    reload: fetchProjects,
  } = usePaginatedData(
    ({ limit, offset, search }) =>
      projectsApi.list({ limit, offset, search }).then((r) => ({
        items: r.projects,
        pagination: r.pagination,
      })),
    { pageSize: PAGE_SIZE },
  );

  const { viewMode, changeViewMode } = useViewMode("projects-view");
  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(projects);
  const { favicons: projectFavicons } = useProjectRepoFavicons(projects);

  // ── Delete ─────────────────────────────────────────────────────

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const confirmDelete = () => {
    if (deleteId) projectsApi.delete(deleteId).then(fetchProjects);
  };

  // ── Form (create / edit) ───────────────────────────────────────

  const projectForm = useProjectForm({ onSuccess: fetchProjects });

  // Auto-open create modal when navigated with state
  useEffect(() => {
    if ((location.state as { openCreate?: boolean })?.openCreate) {
      projectForm.openCreate();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, projectForm.openCreate]);

  // ── Public API ─────────────────────────────────────────────────

  return {
    navigate,
    // List
    projects, loading, loadError, reload: fetchProjects,
    viewMode, changeViewMode,
    pagination, goToPage, search, handleSearch,
    // Delete
    deleteId, setDeleteId, confirmDelete,
    // Form (spread all form state for backward-compatible access)
    ...projectForm,
    // Derived
    projectLangs, projectBadgeLoading,
    projectFavicons,
  };
}
