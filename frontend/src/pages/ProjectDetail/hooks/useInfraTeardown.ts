import { useState } from "react";
import { projectsApi } from "@/services/projects";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";

/**
 * Encapsulates infrastructure teardown logic: modal state,
 * infra status tracking, and the async teardown operation.
 */
export function useInfraTeardown(projectId: string, initialState: string) {
  const [infraState, setInfraState] = useState(initialState);
  const [showTeardownModal, setShowTeardownModal] = useState(false);
  const [tearingDown, setTearingDown] = useState(false);
  const toast = useToast();

  const handleTeardown = async () => {
    setTearingDown(true);
    try {
      const res = await projectsApi.teardownInfrastructure(projectId);
      if (res.status === "torn_down") {
        setInfraState("torn_down");
        toast.success(res.message);
      } else if (res.status === "nothing_to_tear_down") {
        toast.info(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to tear down infrastructure"));
    } finally {
      setTearingDown(false);
    }
  };

  const openTeardownModal = () => setShowTeardownModal(true);
  const closeTeardownModal = () => setShowTeardownModal(false);

  return {
    infraState,
    showTeardownModal,
    tearingDown,
    handleTeardown,
    openTeardownModal,
    closeTeardownModal,
  };
}
