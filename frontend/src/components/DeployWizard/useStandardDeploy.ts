/**
 * Standard Deploy Hook
 *
 * Manages the standard deployment path (create deployment record + poll status).
 * Used for non-CodeBuild deployments (Pulumi/GCP, template deploys, etc.).
 */

import { useRef, useCallback } from "react";
import { deployApi, projectsApi } from "../../services/api";
import type { WizardState, RepoAnalysis } from "./types";

interface StandardDeployParams {
  state: WizardState;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  repo: string;
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
    onStateUpdate,
    onError,
    onComplete,
  }: StandardDeployParams) => {
    mountedRef.current = true;
    // Persist post-deploy commands to project config (best-effort)
    if (state.postDeployCommands.length > 0 && project.id) {
      projectsApi.update(project.id, {
        config: { postDeployCommands: state.postDeployCommands },
      }).catch((err) => console.warn("[deploy] Failed to save post-deploy commands:", err));
    }

    const deployment = await deployApi.createDeployment({
      providerId: state.selectedProviderId,
      gitConnectionId: project.connectionId,
      projectId: project.id,
      repo,
      branch: project.branch || "main",
      tofuScript: state.tofuScript || undefined,
      techStack: analysis?.techStack.map(t => t.name) || [],
      primaryLanguage: analysis?.primaryLanguage || "",
      deployStrategy: state.deployStrategy,
      buildMethod: state.buildMethod,
      useRepoDockerfile: state.useRepoDockerfile || undefined,
      templateId: project.sourceType === "template" ? project.template : undefined,
      envVars: state.envVars.length > 0 ? state.envVars : undefined,
      services: analysis?.detectedServices?.length
        ? analysis.detectedServices.map(svc => ({ type: svc.type, name: svc.name, mode: state.servicesModes[svc.type] || "vps" as const }))
        : undefined,
      postDeployCommands: state.postDeployCommands.length > 0 ? state.postDeployCommands : undefined,
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

        if (d.status === "success" || d.status === "failed") {
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
