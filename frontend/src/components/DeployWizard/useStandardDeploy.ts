/**
 * Standard Deploy Hook
 *
 * Manages the standard deployment path (create deployment record + poll status).
 * With the Dokploy pipeline, deployment parameters are simplified — the backend
 * handles build type detection and image building internally.
 */

import { useRef, useCallback } from "react";
import { deployApi } from "@/services/api";
import type { WizardState, RepoAnalysis } from "./types";

interface StandardDeployParams {
  state: WizardState;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  repo: string;
  instanceType?: string;
  onStateUpdate: (updater: (prev: WizardState) => WizardState) => void;
  onError: (msg: string) => void;
  onComplete?: () => void;
}

export function useStandardDeploy() {
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    mountedRef.current = false;
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const start = useCallback(async ({
    state,
    project,
    analysis,
    repo,
    instanceType,
    onStateUpdate,
    onError,
    onComplete,
  }: StandardDeployParams) => {
    mountedRef.current = true;

    const deployment = await deployApi.createDeployment({
      providerId: state.selectedProviderId,
      gitConnectionId: project.connectionId,
      projectId: project.id,
      repo,
      branch: project.branch || "main",
      techStack: analysis?.techStack.map(t => t.name) || [],
      primaryLanguage: analysis?.primaryLanguage || "",
      deployStrategy: state.deployStrategy,
      // Only meaningful when the repo actually has a Dockerfile; otherwise leave
      // it unset so the backend keeps choosing the builder on its own. Sent as
      // `buildMethod` because that column is persisted and reused by
      // redeploy/rollback, so the choice survives beyond this wizard run.
      buildMethod: analysis?.hasDocker ? (state.useRepoDockerfile ? "dockerfile" : "railpack") : undefined,
      instanceType,
      region: state.tofuRegion || undefined,
      templateId: project.sourceType === "template" ? project.template : undefined,
      services: analysis?.detectedServices?.length
        ? analysis.detectedServices.map(svc => ({ type: svc.type, name: svc.name, mode: state.servicesModes[svc.type] || "vps" as const }))
        : undefined,
    });

    onStateUpdate(prev => ({ ...prev, deploymentId: deployment.id }));

    // Poll deployment status
    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const d = await deployApi.getDeployment(deployment.id);
        onStateUpdate(prev => ({
          ...prev,
          deployStatus: d.status,
          deployLogs: d.logs ? d.logs.split("\n").filter(Boolean) : prev.deployLogs,
          deployAppUrl: d.appUrl || prev.deployAppUrl,
        }));

        if (d.status === "success" || d.status === "failed" || d.status === "cancelled") {
          // A cancel is the user's own action: terminal, but not an error, so
          // it is not pushed into the danger-toned error banner.
          if (d.status === "failed") onError("Deployment failed. Check logs for details.");
          onComplete?.();
          return;
        }

        pollRef.current = setTimeout(poll, 1500);
      } catch (err) {
        console.warn("[deploy] Status poll error:", err);
        if (mountedRef.current) pollRef.current = setTimeout(poll, 2000);
      }
    };

    pollRef.current = setTimeout(poll, 1000);
  }, []);

  return { start, cleanup, pollRef };
}
