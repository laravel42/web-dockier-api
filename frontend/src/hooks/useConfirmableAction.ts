import { useState } from "react";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

interface UseConfirmableActionOptions {
  /** Called when the action completes successfully. */
  onSuccess?: () => void;
  /** Fallback error message when no useful message can be extracted. */
  errorFallback?: string;
}

/**
 * Generic hook for "open confirmation modal → execute async action → handle result" flows.
 *
 * Encapsulates:
 * - Modal open/close state
 * - Loading (running) state
 * - Toast-based error reporting on failure
 * - Optional success callback
 *
 * Use this to replace repeated patterns like useProjectDelete and useInfraTeardown.
 */
export function useConfirmableAction(
  action: () => Promise<void>,
  options: UseConfirmableActionOptions = {},
) {
  const { onSuccess, errorFallback = "Action failed" } = options;
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const execute = async () => {
    setRunning(true);
    try {
      await action();
      setShowModal(false);
      onSuccess?.();
    } catch (err) {
      toast.error(getErrorMessage(err, errorFallback));
    } finally {
      setRunning(false);
    }
  };

  return {
    showModal,
    running,
    execute,
    open: () => setShowModal(true),
    close: () => setShowModal(false),
  };
}
