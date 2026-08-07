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
export function useInfraTeardown(projectId: string, initialState: string) {
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
      } else if (res.status === "nothing_to_tear_down") {
        toast.info(res.message);
      } else {
        // "partial" — treat as an error-level message but not an exception
        toast.error(res.message);
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
