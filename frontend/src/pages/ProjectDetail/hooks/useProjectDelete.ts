import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { useConfirmableAction } from "@/hooks/useConfirmableAction";

/**
 * Encapsulates project deletion logic: confirmation modal state,
 * name validation, and the async delete operation.
 *
 * Built on top of `useConfirmableAction` for consistent modal + async patterns.
 */
export function useProjectDelete(projectId: string, projectName: string) {
  const [confirmName, setConfirmName] = useState("");

  const {
    showModal: showDeleteModal,
    running: deleting,
    execute,
    open: openDeleteModal,
    close: closeDeleteModal,
  } = useConfirmableAction(
    async () => {
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
