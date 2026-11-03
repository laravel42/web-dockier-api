import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { ApiError } from "@/services/api-error";
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
      let res: Awaited<ReturnType<typeof projectsApi.teardownInfrastructure>>;
      try {
        res = await projectsApi.teardownInfrastructure(projectId);
      } catch (err) {
        // A client-side timeout does NOT cancel the teardown: the request is
        // one HTTP call into a long synchronous backend operation, so the
        // deletes carry on and usually complete. Reporting "failed to tear
        // down" here is wrong and dangerous — it invites the user to retry
        // against resources that are already gone. Re-fetch instead, so the
        // page shows whatever state the backend reached.
        if (err instanceof ApiError && err.isTimeout) {
          toast.info(
            "Teardown is taking longer than expected and is still running in the background. " +
            "Reload in a few minutes to see the result.",
          );
          await onTeardownComplete?.();
          return;
        }
        throw err;
      }

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
