/**
 * CodeBuild Pipeline Hook
 *
 * Manages the CodeBuild → CloudFormation → Post-Deploy polling pipeline.
 * Extracted from useDeployWizard to isolate the AWS-specific deploy logic.
 */

import { useRef, useCallback } from "react";
import { deployApi, imageBuilderApi, projectsApi } from "../../services/api";
import type { WizardState, RepoAnalysis } from "./types";
import { getPlans } from "./plans";
import {
  buildDeployHeader,
  buildAnalysisLogs,
  logSection,
  logInfo,
  logSuccess,
  logError,
  logWarning,
  logEmpty,
} from "./deploy-logger";

interface CodeBuildParams {
  state: WizardState;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  repo: string;
  onStateUpdate: (updater: (prev: WizardState) => WizardState) => void;
  onError: (msg: string) => void;
  onComplete?: () => void;
}

export function useCodeBuildPipeline() {
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
  }: CodeBuildParams) => {
    mountedRef.current = true;

    // Persist post-deploy commands to project config (best-effort)
    if (state.postDeployCommands.length > 0 && project.id) {
      projectsApi.update(project.id, {
        config: { postDeployCommands: state.postDeployCommands },
      }).catch((err) => console.warn("[deploy] Failed to save post-deploy commands:", err));
    }

    const deployTargetMap: Record<string, "ecs" | "ec2" | "s3"> = {
      vps: "ec2",
      managed: "ecs",
      static: "s3",
    };
    const deployTarget = deployTargetMap[state.deployStrategy] || "ec2";

    // Build initial logs
    const formattedLogs: string[] = buildDeployHeader({
      provider: state.selectedProvider,
      region: state.tofuRegion || "us-east-1",
      strategy: state.deployStrategy,
      repo,
      branch: project.branch || "main",
    });

    if (analysis) {
      formattedLogs.push(...buildAnalysisLogs(analysis, deployTarget));
    }

    onStateUpdate(prev => ({ ...prev, deployStatus: "building", deployLogs: formattedLogs }));

    // Start the CodeBuild image build
    const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, state.deployStrategy, project.sourceType === "template" ? project.template : undefined);
    const plan = plans[state.selectedPlan] || plans[1] || plans[0];

    const cpuMatch = plan?.cpu?.match(/[\d.]+/);
    const ramMatch = plan?.ram?.match(/[\d.]+/);

    const build = await imageBuilderApi.startBuild({
      sourceRepo: repo,
      sourceRef: project.branch || "main",
      projectId: project.id,
      gitConnectionId: project.connectionId,
      deployTarget,
      providerId: state.selectedProviderId,
      deployParams: {
        appName: state.tofuAppName || project.name?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || undefined,
        containerPort: analysis?.aiAnalysis?.port || 3000,
        instanceType: plan?.instance || undefined,
        cpu: cpuMatch?.[0] ? String(Math.round(parseFloat(cpuMatch[0]) * 1024)) : undefined,
        memory: ramMatch?.[0] ? String(Math.round(parseFloat(ramMatch[0]) * 1024)) : undefined,
        envVars: state.envVars.length > 0 ? state.envVars : undefined,
        selfHostedServices: Object.entries(state.servicesModes)
          .filter(([, mode]) => mode === "vps")
          .map(([type]) => type),
        techStack: analysis?.techStack?.map(t => t.name) || undefined,
      },
    });

    // Create a deployment record (best-effort — don't block on failure)
    let codebuildDeployId = "";
    try {
      const dep = await deployApi.createDeployment({
        providerId: state.selectedProviderId,
        gitConnectionId: project.connectionId,
        projectId: project.id,
        repo,
        branch: project.branch || "main",
        techStack: analysis?.techStack.map(t => t.name) || [],
        primaryLanguage: analysis?.primaryLanguage || "",
        deployStrategy: state.deployStrategy,
        buildMethod: "codebuild",
        skipPipeline: true,
        templateId: project.sourceType === "template" ? project.template : undefined,
      });
      codebuildDeployId = dep.id;
      onStateUpdate(prev => ({ ...prev, deploymentId: dep.id }));
    } catch (err) {
      console.warn("[deploy] Failed to create deployment record:", err);
    }

    formattedLogs.push(
      logSection("Build Image (CodeBuild)"),
      logInfo(`Build queued: ${build.codebuildId || build.id}`),
    );
    onStateUpdate(prev => ({ ...prev, codebuildBuildId: build.id, codebuildLogsUrl: build.logsUrl, deployLogs: [...formattedLogs] }));

    // Sync deployment record with current status/logs
    const syncDeployRecord = (status: "building" | "deploying" | "success" | "failed", logs: string[], appUrl?: string) => {
      if (!codebuildDeployId) return;
      deployApi.updateDeployment(codebuildDeployId, {
        status,
        logs: logs.join("\n"),
        ...(appUrl ? { appUrl } : {}),
      }).catch((err) => console.warn("[deploy] Failed to sync deploy record:", err));
    };
    syncDeployRecord("building", formattedLogs);

    const seenPhases = new Set<string>();
    const seenLogLines = new Set<string>();

    // ── Poll CodeBuild until image is ready ──
    const pollCodeBuild = async () => {
      if (!mountedRef.current) return;
      try {
        const b = await imageBuilderApi.getBuild(build.id);

        // Ingest build logs (cap at 500 lines to prevent unbounded growth)
        try {
          const logsResp = await imageBuilderApi.getBuildLogs(build.id);
          if (logsResp.logs.length > 0) {
            for (const line of logsResp.logs) {
              if (seenLogLines.has(line)) continue;
              seenLogLines.add(line);
              if (formattedLogs.length >= 500) break;

              const phaseMatch = line.match(/Entering phase (\w+)/);
              if (phaseMatch && !seenPhases.has(phaseMatch[1])) {
                seenPhases.add(phaseMatch[1]);
                formattedLogs.push(logInfo(`CodeBuild: ${phaseMatch[1]}...`));
                continue;
              }

              const msg = line.replace(/^\[[\d\s:-]+\]\s*/, "").trim();
              if (!msg) continue;
              if (msg.startsWith("[Container]")) {
                const inner = msg.replace(/^\[Container\]\s*\d{4}\/\d{2}\/\d{2}\s+[\d:.]+\s*/, "").trim();
                if (!inner || inner.startsWith("Registering with agent") || inner.startsWith("Waiting for")) continue;
                formattedLogs.push(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] ${inner}`);
              }
            }
            onStateUpdate(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
          }
        } catch (err) {
          console.warn("[deploy] Failed to fetch build logs:", err);
        }

        if (b.status === "succeeded") {
          formattedLogs.push(
            logSuccess("CodeBuild succeeded — image pushed to ECR"),
            logEmpty(),
            logSection("CloudFormation Deploy"),
          );
          onStateUpdate(prev => ({
            ...prev,
            codebuildImageUri: b.imageUri,
            deployStatus: "deploying",
            deployAppUrl: "",
            deployLogs: [...formattedLogs],
          }));
          syncDeployRecord("deploying", formattedLogs);

          // Start CloudFormation polling
          startCfnPolling({
            buildId: build.id,
            state,
            project,
            analysis,
            repo,
            formattedLogs,
            syncDeployRecord,
            onStateUpdate,
            onError,
            onComplete,
          });
          return;
        }

        if (b.status === "failed" || b.status === "stopped") {
          await handleBuildFailure(build.id, b.statusReason, formattedLogs, syncDeployRecord, onStateUpdate, onError, onComplete);
          return;
        }

        pollRef.current = setTimeout(pollCodeBuild, 5000);
      } catch (err) {
        console.warn("[deploy] CodeBuild poll error:", err);
        if (mountedRef.current) pollRef.current = setTimeout(pollCodeBuild, 5000);
      }
    };

    pollRef.current = setTimeout(pollCodeBuild, 3000);
  }, []);

  // ── CloudFormation Deploy Polling ──

  const startCfnPolling = useCallback(({
    buildId,
    state,
    project,
    repo,
    formattedLogs,
    syncDeployRecord,
    onStateUpdate,
    onError,
    onComplete,
  }: {
    buildId: string;
    state: WizardState;
    project: CodeBuildParams["project"];
    analysis: RepoAnalysis | null;
    repo: string;
    formattedLogs: string[];
    syncDeployRecord: (status: "building" | "deploying" | "success" | "failed", logs: string[], appUrl?: string) => void;
    onStateUpdate: (updater: (prev: WizardState) => WizardState) => void;
    onError: (msg: string) => void;
    onComplete?: () => void;
  }) => {
    const pollCfnDeploy = async () => {
      if (!mountedRef.current) return;
      try {
        const ds = await imageBuilderApi.getDeployStatus(buildId);

        if (ds.status === "success" && ds.appUrl) {
          const appName = state.tofuAppName || project.name?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || repo.split("/").pop() || "app";
          formattedLogs.push(
            logSuccess("CloudFormation stack: CREATE_COMPLETE"),
            logSuccess(`App URL: ${ds.appUrl}`),
          );
          onStateUpdate(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
          syncDeployRecord("deploying", formattedLogs);

          // Run post-deploy commands
          await runPostDeployCommands(buildId, state.postDeployCommands, formattedLogs, onStateUpdate);

          formattedLogs.push(
            logEmpty(),
            logSection("Complete"),
            logSuccess(`Docker image: ${appName}`),
            logSuccess("Infrastructure deployed via CloudFormation"),
            logSuccess(`Application URL: ${ds.appUrl}`),
          );
          onStateUpdate(prev => ({
            ...prev,
            deployStatus: "success",
            deployAppUrl: ds.appUrl,
            deployLogs: [...formattedLogs],
          }));
          syncDeployRecord("success", formattedLogs, ds.appUrl);
          onComplete?.();
          return;
        }

        if (ds.status === "failed") {
          formattedLogs.push(logError("CloudFormation failed"));
          onStateUpdate(prev => ({ ...prev, deployStatus: "failed", deployLogs: [...formattedLogs] }));
          syncDeployRecord("failed", formattedLogs);
          onError("CloudFormation deployment failed.");
          onComplete?.();
          return;
        }

        if (ds.status === "deploying") {
          const lastCfnLog = formattedLogs.filter(l => l.includes("CloudFormation:")).pop();
          const lastCfnTime = lastCfnLog?.match(/\[([\d\s:-]+)\]/)?.[1] || "";
          const now = new Date().toISOString().replace("T", " ").slice(0, 19);
          if (!lastCfnLog || lastCfnTime !== now) {
            formattedLogs.push(logInfo("CloudFormation: CREATE_IN_PROGRESS..."));
            onStateUpdate(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
            syncDeployRecord("deploying", formattedLogs);
          }
        }

        pollRef.current = setTimeout(pollCfnDeploy, 10000);
      } catch (err) {
        console.warn("[deploy] CFN poll error:", err);
        if (mountedRef.current) pollRef.current = setTimeout(pollCfnDeploy, 10000);
      }
    };

    pollRef.current = setTimeout(pollCfnDeploy, 5000);
  }, []);

  return { start, cleanup, pollRef };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function runPostDeployCommands(
  buildId: string,
  postDeployCommands: WizardState["postDeployCommands"],
  formattedLogs: string[],
  onStateUpdate: (updater: (prev: WizardState) => WizardState) => void,
) {
  const postCommands = postDeployCommands.filter(c => c.enabled);
  if (postCommands.length === 0) return;

  formattedLogs.push(
    logEmpty(),
    logSection("Post-Deploy Commands"),
    logInfo(`Running ${postCommands.length} command(s)...`),
  );
  onStateUpdate(prev => ({ ...prev, deployLogs: [...formattedLogs] }));

  try {
    const pdResult = await imageBuilderApi.runPostDeploy(buildId, postCommands);
    for (const line of pdResult.output.slice(0, 30)) {
      formattedLogs.push(`[${new Date().toISOString().replace("T", " ").slice(0, 19)}] ${line}`);
    }
    if (pdResult.success) {
      formattedLogs.push(logSuccess("Post-deploy commands completed"));
    } else {
      formattedLogs.push(logWarning("Post-deploy commands finished with errors"));
    }
  } catch (e: any) {
    formattedLogs.push(logWarning(`Post-deploy commands failed: ${e.message || "unknown error"}`));
  }
}

async function handleBuildFailure(
  buildId: string,
  statusReason: string | undefined,
  formattedLogs: string[],
  syncDeployRecord: (status: "building" | "deploying" | "success" | "failed", logs: string[], appUrl?: string) => void,
  onStateUpdate: (updater: (prev: WizardState) => WizardState) => void,
  onError: (msg: string) => void,
  onComplete?: () => void,
) {
  try {
    const logsResp = await imageBuilderApi.getBuildLogs(buildId);
    if (logsResp.logs.length > 0) {
      const failLogs = [
        ...logsResp.logs,
        logError(`CodeBuild failed: ${statusReason || "Unknown error"}`),
      ];
      onStateUpdate(prev => ({ ...prev, deployStatus: "failed", deployLogs: failLogs }));
      syncDeployRecord("failed", failLogs);
      onError(`CodeBuild failed: ${statusReason || "Check logs above"}`);
      onComplete?.();
      return;
    }
  } catch (err) {
    console.warn("[deploy] Failed to fetch failure logs:", err);
  }

  // Fallback: no detailed logs available
  const errorLine = logError(`CodeBuild failed: ${statusReason || "Unknown error"}`);
  formattedLogs.push(errorLine);
  onStateUpdate(prev => ({ ...prev, deployStatus: "failed", deployLogs: [...formattedLogs] }));
  syncDeployRecord("failed", formattedLogs);
  onError(`CodeBuild failed: ${statusReason || "Check CloudWatch logs"}`);
  onComplete?.();
}
