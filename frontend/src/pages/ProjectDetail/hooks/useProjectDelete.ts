import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { gitApi } from "@/services/api";
import { getRepoKey } from "@/utils/parseOwnerRepo";
import { useConfirmableAction } from "@/hooks/useConfirmableAction";

/**
 * Encapsulates project deletion logic: confirmation modal state,
 * name validation, and the async delete operation.
 *
 * Built on top of `useConfirmableAction` for consistent modal + async patterns.
 */
export function useProjectDelete(projectId: string, projectName: string, repository?: string) {
  const [confirmName, setConfirmName] = useState("");

  const {
    showModal: showDeleteModal,
    running: deleting,
    execute,
    open: openDeleteModal,
    close: closeDeleteModal,
  } = useConfirmableAction(
    async () => {
      // The repo-level caches are keyed by `owner/repo`, not by project, so they
      // outlive the project and a re-created project on the same repository
      // would be handed the deleted one's stack, stats and AI analysis.
      // Best-effort and deliberately not awaited: a failed invalidation must not
      // block the delete the user just confirmed.
      const repoKey = repository ? getRepoKey(repository) : null;
      if (repoKey) {
        // try/catch as well as .catch: a synchronous throw here would abort the
        // delete the user already confirmed, and these three are housekeeping.
        try {
          void gitApi.invalidateStackCache(repoKey).catch(() => {});
          void gitApi.invalidateStatsCache(repoKey).catch(() => {});
          void gitApi.invalidateAnalysisCache(repoKey).catch(() => {});
        } catch { /* best effort */ }
      }
      await projectsApi.delete(projectId);
      window.location.href = "/projects";
    },
    { errorFallback: "Failed to delete project" },
  );

  const handleDelete = async () => {
    if (confirmName !== projectName) return;
    await execute();
  };

  return {
    showDeleteModal,
    confirmName,
    setConfirmName,
    deleting,
    handleDelete,
    openDeleteModal,
    closeDeleteModal,
  };
}
