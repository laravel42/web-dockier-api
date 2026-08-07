import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

/**
 * Encapsulates project deletion logic: confirmation modal state,
 * name validation, and the async delete operation.
 */
export function useProjectDelete(projectId: string, projectName: string) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const handleDelete = async () => {
    if (confirmName !== projectName) return;
    setDeleting(true);
    try {
      await projectsApi.delete(projectId);
      window.location.href = "/projects";
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete project"));
    } finally { setDeleting(false); }
  };

  const openDeleteModal = () => setShowDeleteModal(true);
  const closeDeleteModal = () => setShowDeleteModal(false);

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
