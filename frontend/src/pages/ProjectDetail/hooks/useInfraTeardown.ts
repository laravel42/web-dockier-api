import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { useToast } from "@/context/useToast";
import { useConfirmableAction } from "@/hooks/useConfirmableAction";

/**
 * Encapsulates infrastructure teardown logic: modal state,
 * infra status tracking, and the async teardown operation.
 *
 * Built on top of `useConfirmableAction` for consistent modal + async patterns.
 */
export function useInfraTeardown(
  projectId: string,
  initialState: string,
  onTeardownComplete?: () => void | Promise<void>,
) {
  const [infraState, setInfraState] = useState(initialState);
  const toast = useToast();

  const {
    showModal: showTeardownModal,
    running: tearingDown,
    execute: handleTeardown,
    open: openTeardownModal,
    close: closeTeardownModal,
  } = useConfirmableAction(
    async () => {
      const res = await projectsApi.teardownInfrastructure(projectId);
      if (res.status === "torn_down") {
        setInfraState("torn_down");
        toast.success(res.message);
        // Re-fetch the shared project so infraState-derived UI updates in place.
        await onTeardownComplete?.();
      } else if (res.status === "nothing_to_tear_down") {
        toast.info(res.message);
      } else {
        // "partial" — treat as an error-level message but not an exception.
        // Infra state still changed server-side, so re-fetch the shared project.
        toast.error(res.message);
        await onTeardownComplete?.();
      }
    },
    { errorFallback: "Failed to tear down infrastructure" },
  );

  return {
    infraState,
    showTeardownModal,
    tearingDown,
    handleTeardown,
    openTeardownModal,
    closeTeardownModal,
  };
}
