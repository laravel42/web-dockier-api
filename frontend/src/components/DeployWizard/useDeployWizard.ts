import { useState, useEffect, useRef, useCallback } from "react";
import { deployApi, imageBuilderApi } from "../../services/api";
import type { WizardState, RepoAnalysis } from "./types";
import { INITIAL_WIZARD_STATE } from "./constants";
import { getPlans } from "./plans";
import { parseOwnerRepo } from "./utils";

interface UseDeployWizardParams {
  open: boolean;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  onDeployComplete?: () => void;
}

export function useDeployWizard({ open, project, analysis, analysisLoading, onDeployComplete }: UseDeployWizardParams) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({ ...INITIAL_WIZARD_STATE });
  const [tofuLoading, setTofuLoading] = useState(false);
  const [tofuError, setTofuError] = useState("");
  const [deployError, setDeployError] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setState({ ...INITIAL_WIZARD_STATE });
      setTofuLoading(false);
      setTofuError("");
      setDeployError("");
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [open]);

  // Sync service modes when analysis arrives (without resetting wizard)
  useEffect(() => {
    if (open && analysis?.detectedServices?.length) {
      setState(prev => {
        if (Object.keys(prev.servicesModes).length > 0) return prev;
        const modes: Record<string, "vps" | "managed"> = {};
        analysis.detectedServices.forEach((s) => { modes[s.type] = "vps"; });
        const envVars = prev.envVars.length > 0 ? prev.envVars
          : (analysis.aiAnalysis?.envVars || []).map(entry => {
              const eqIdx = entry.indexOf("=");
              return eqIdx >= 0
                ? { name: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) }
                : { name: entry, value: "" };
            });
        return { ...prev, servicesModes: modes, envVars };
      });
    }
  }, [open, analysis]);

  // Generate Pulumi program
  const generateScript = useCallback(async (overrideState?: Partial<WizardState>) => {
    const s = { ...state, ...overrideState };
    if (!s.selectedProviderId || !project) return;
    setTofuLoading(true);
    setTofuError("");
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;
      const plans = getPlans(s.selectedProvider, s.environment, s.servicesModes, s.deployStrategy, project.sourceType === "template" ? project.template : undefined);
      const selectedPlan = plans[s.selectedPlan] || plans[1] || plans[0];
      const res = await deployApi.generateTofu({
        providerId: s.selectedProviderId,
        repo,
        branch: project.branch || "main",
        techStack: analysis?.techStack.map(t => t.name) || [],
        primaryLanguage: analysis?.primaryLanguage || "",
        hasDocker: analysis?.hasDocker || false,
        appName: s.tofuAppName || undefined,
        region: s.tofuRegion || undefined,
        deployStrategy: s.deployStrategy || undefined,
        useDocker: s.useDocker || undefined,
        instanceType: selectedPlan?.instance || undefined,
        services: analysis?.detectedServices?.length
          ? analysis.detectedServices.map(svc => ({ type: svc.type, name: svc.name, mode: s.servicesModes[svc.type] || "vps" }))
          : undefined,
        aiAnalysis: analysis?.aiAnalysis || undefined,
        templateId: project.sourceType === "template" ? project.template : undefined,
      });
      setState(prev => ({
        ...prev,
        ...overrideState,
        tofuScript: res.script,
        tofuResources: res.estimatedResources,
        tofuAppName: res.appName,
        tofuRegion: res.region,
      }));
    } catch (err: any) {
      setTofuError(err.message || "Failed to generate Pulumi program");
    } finally {
      setTofuLoading(false);
    }
  }, [state, project, analysis]);

  // Start deployment
  const startDeploy = useCallback(async () => {
    if (!project || !state.selectedProviderId) return;
    setDeployError("");
    setState(prev => ({ ...prev, deployStatus: "pending", deployLogs: [], deployAppUrl: "", codebuildBuildId: "", codebuildImageUri: "", codebuildLogsUrl: "" }));
    try {
      const parsed = parseOwnerRepo(project.repository);
      const repo = parsed ? `${parsed.owner}/${parsed.repo}` : project.repository;

      // ── CodeBuild path: build image first via image-builder, then deploy ──
      // Template projects always use the standard path (pre-built Docker images, no CodeBuild needed)
      if (state.buildMethod === "codebuild" && project.sourceType !== "template") {
        const ts0 = new Date().toISOString().replace("T", " ").slice(0, 19);
        const deployTargetMap: Record<string, "ecs" | "ec2" | "s3"> = {
          vps: "ec2",
          managed: "ecs",
          static: "s3",
        };
        const deployTarget = deployTargetMap[state.deployStrategy] || "ec2";

        const formattedLogs: string[] = [
          `[${ts0}] ▶ Starting deployment pipeline...`,
          `[${ts0}] ℹ Provider: ${state.selectedProvider} | Region: ${state.tofuRegion || "us-east-1"}`,
          `[${ts0}] ℹ Strategy: ${state.deployStrategy}`,
          `[${ts0}] ℹ Repository: ${repo} | Branch: ${project.branch || "main"}`,
          `[${ts0}]`,
        ];

        if (analysis) {
          formattedLogs.push(`[${ts0}] ── Analyze Repository ──────────────`);
          if (analysis.primaryLanguage) formattedLogs.push(`[${ts0}] ℹ Runtime: ${analysis.primaryLanguage}${analysis.aiAnalysis?.runtimeVersion ? " " + analysis.aiAnalysis.runtimeVersion : ""}`);
          if (analysis.aiAnalysis?.framework) formattedLogs.push(`[${ts0}] ℹ Framework: ${analysis.aiAnalysis.framework}${analysis.aiAnalysis.frameworkVersion ? " " + analysis.aiAnalysis.frameworkVersion : ""}`);
          if (analysis.techStack?.length) formattedLogs.push(`[${ts0}] ℹ Tech stack: ${analysis.techStack.map((t: any) => t.name || t).join(", ")}`);
          if (analysis.aiAnalysis?.port) formattedLogs.push(`[${ts0}] ℹ Port: ${analysis.aiAnalysis.port}`);
          formattedLogs.push(`[${ts0}] ℹ Deploy target: ${deployTarget}`);
          formattedLogs.push(`[${ts0}]`);
        }

        setState(prev => ({ ...prev, deployStatus: "building", deployLogs: formattedLogs }));

        const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, state.deployStrategy, project.sourceType === "template" ? project.template : undefined);
        const plan = plans[state.selectedPlan] || plans[1] || plans[0];

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
            cpu: plan?.cpu?.match(/[\d.]+/)?.[0] ? String(Math.round(parseFloat(plan.cpu.match(/[\d.]+/)![0]) * 1024)) : undefined,
            memory: plan?.ram?.match(/[\d.]+/)?.[0] ? String(Math.round(parseFloat(plan.ram.match(/[\d.]+/)![0]) * 1024)) : undefined,
            envVars: state.envVars.length > 0 ? state.envVars : undefined,
            selfHostedServices: Object.entries(state.servicesModes)
              .filter(([, mode]) => mode === "vps")
              .map(([type]) => type),
            techStack: analysis?.techStack?.map(t => t.name) || undefined,
          },
        });

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
          setState(prev => ({ ...prev, deploymentId: dep.id }));
        } catch {}

        const ts1 = new Date().toISOString().replace("T", " ").slice(0, 19);
        formattedLogs.push(
          `[${ts1}] ── Build Image (CodeBuild) ────────`,
          `[${ts1}] ℹ Build queued: ${build.codebuildId || build.id}`,
        );
        setState(prev => ({ ...prev, codebuildBuildId: build.id, codebuildLogsUrl: build.logsUrl, deployLogs: [...formattedLogs] }));

        const syncDeployRecord = (status: "building" | "deploying" | "success" | "failed", logs: string[], appUrl?: string) => {
          if (!codebuildDeployId) return;
          deployApi.updateDeployment(codebuildDeployId, {
            status,
            logs: logs.join("\n"),
            ...(appUrl ? { appUrl } : {}),
          }).catch(() => {});
        };
        syncDeployRecord("building", formattedLogs);

        const seenPhases = new Set<string>();
        const seenLogLines = new Set<string>();

        // Poll CodeBuild until image is ready
        const pollCodeBuild = async () => {
          try {
            const b = await imageBuilderApi.getBuild(build.id);
            const ts = new Date().toISOString().replace("T", " ").slice(0, 19);

            try {
              const logsResp = await imageBuilderApi.getBuildLogs(build.id);
              if (logsResp.logs.length > 0) {
                for (const line of logsResp.logs) {
                  // Deduplicate log lines
                  if (seenLogLines.has(line)) continue;
                  seenLogLines.add(line);

                  // Track phase transitions
                  const phaseMatch = line.match(/Entering phase (\w+)/);
                  if (phaseMatch && !seenPhases.has(phaseMatch[1])) {
                    seenPhases.add(phaseMatch[1]);
                    formattedLogs.push(`[${ts}] ℹ CodeBuild: ${phaseMatch[1]}...`);
                    continue;
                  }

                  // Show Docker build output and errors (skip noisy internal CodeBuild lines)
                  const msg = line.replace(/^\[[\d\s:-]+\]\s*/, "").trim();
                  if (!msg) continue;
                  if (msg.startsWith("[Container]")) {
                    // Extract the actual command/output after the container timestamp
                    const inner = msg.replace(/^\[Container\]\s*\d{4}\/\d{2}\/\d{2}\s+[\d:.]+\s*/, "").trim();
                    if (!inner || inner.startsWith("Registering with agent") || inner.startsWith("Waiting for")) continue;
                    formattedLogs.push(`[${ts}] ${inner}`);
                  }
                }
                setState(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
              }
            } catch {}

            if (b.status === "succeeded") {
              formattedLogs.push(
                `[${ts}] ✓ CodeBuild succeeded — image pushed to ECR`,
                `[${ts}]`,
                `[${ts}] ── CloudFormation Deploy ──────────`,
              );
              setState(prev => ({
                ...prev,
                codebuildImageUri: b.imageUri,
                deployStatus: "deploying",
                deployAppUrl: "",
                deployLogs: [...formattedLogs],
              }));
              syncDeployRecord("deploying", formattedLogs);

              const pollCfnDeploy = async () => {
                try {
                  const ds = await imageBuilderApi.getDeployStatus(build.id);
                  const ts2 = new Date().toISOString().replace("T", " ").slice(0, 19);

                  if (ds.status === "success" && ds.appUrl) {
                    const appName = state.tofuAppName || project.name?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || repo.split("/").pop() || "app";
                    formattedLogs.push(
                      `[${ts2}] ✓ CloudFormation stack: CREATE_COMPLETE`,
                      `[${ts2}] ✓ App URL: ${ds.appUrl}`,
                      `[${ts2}]`,
                      `[${ts2}] ── Complete ───────────────────────`,
                      `[${ts2}] ✓ Docker image: ${appName}`,
                      `[${ts2}] ✓ Infrastructure deployed via CloudFormation`,
                      `[${ts2}] ✓ Application URL: ${ds.appUrl}`,
                    );
                    setState(prev => ({
                      ...prev,
                      deployStatus: "success",
                      deployAppUrl: ds.appUrl,
                      deployLogs: [...formattedLogs],
                    }));
                    syncDeployRecord("success", formattedLogs, ds.appUrl);
                    onDeployComplete?.();
                    return;
                  }
                  if (ds.status === "failed") {
                    formattedLogs.push(`[${ts2}] ✗ CloudFormation failed`);
                    setState(prev => ({ ...prev, deployStatus: "failed", deployLogs: [...formattedLogs] }));
                    syncDeployRecord("failed", formattedLogs);
                    setDeployError("CloudFormation deployment failed.");
                    onDeployComplete?.();
                    return;
                  }
                  if (ds.status === "deploying") {
                    const lastCfnLog = formattedLogs.filter(l => l.includes("CloudFormation:")).pop();
                    const lastCfnTime = lastCfnLog?.match(/\[([\d\s:-]+)\]/)?.[1] || "";
                    if (!lastCfnLog || lastCfnTime !== ts2) {
                      formattedLogs.push(`[${ts2}] ℹ CloudFormation: CREATE_IN_PROGRESS...`);
                      setState(prev => ({ ...prev, deployLogs: [...formattedLogs] }));
                      syncDeployRecord("deploying", formattedLogs);
                    }
                  }
                  pollRef.current = setTimeout(pollCfnDeploy, 10000);
                } catch {
                  pollRef.current = setTimeout(pollCfnDeploy, 10000);
                }
              };
              pollRef.current = setTimeout(pollCfnDeploy, 5000);
              return;
            }

            if (b.status === "failed" || b.status === "stopped") {
              try {
                const logsResp = await imageBuilderApi.getBuildLogs(build.id);
                if (logsResp.logs.length > 0) {
                  const failLogs = [
                    ...logsResp.logs,
                    `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`,
                  ];
                  setState(prev => ({
                    ...prev,
                    deployStatus: "failed",
                    deployLogs: failLogs,
                  }));
                  syncDeployRecord("failed", failLogs);
                  setDeployError(`CodeBuild failed: ${b.statusReason || "Check logs above"}`);
                  return;
                }
              } catch { /* fall through to basic message */ }

              setState(prev => ({
                ...prev,
                deployStatus: "failed",
                deployLogs: [
                  ...prev.deployLogs,
                  `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`,
                ],
              }));
              syncDeployRecord("failed", [...formattedLogs, `[${ts}] ✗ CodeBuild failed: ${b.statusReason || "Unknown error"}`]);
              setDeployError(`CodeBuild failed: ${b.statusReason || "Check CloudWatch logs"}`);
              return;
            }

            pollRef.current = setTimeout(pollCodeBuild, 5000);
          } catch {
            pollRef.current = setTimeout(pollCodeBuild, 5000);
          }
        };
        pollRef.current = setTimeout(pollCodeBuild, 3000);
        return;
      }

      // ── Standard path: local build via deploy service ──
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
        templateId: project.sourceType === "template" ? project.template : undefined,
      });
      setState(prev => ({ ...prev, deploymentId: deployment.id }));

      const poll = async () => {
        try {
          const d = await deployApi.getDeployment(deployment.id);
          setState(prev => ({
            ...prev,
            deployStatus: d.status,
            deployLogs: d.logs ? d.logs.split("\n").filter(Boolean) : prev.deployLogs,
            deployAppUrl: d.appUrl || prev.deployAppUrl,
          }));
          if (d.status === "success" || d.status === "failed") {
            if (d.status === "failed") setDeployError("Deployment failed. Check logs for details.");
            onDeployComplete?.();
            return;
          }
          pollRef.current = setTimeout(poll, 1500);
        } catch {
          pollRef.current = setTimeout(poll, 2000);
        }
      };
      pollRef.current = setTimeout(poll, 1000);
    } catch (err: any) {
      setDeployError(err.message || "Failed to start deployment");
      setState(prev => ({ ...prev, deployStatus: "failed" }));
    }
  }, [state, project, analysis, onDeployComplete]);

  // Step validation
  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!state.selectedProvider && !!state.selectedProviderId;
      case 1: return !!state.deployStrategy;
      case 2: return !analysisLoading;
      case 3: return state.selectedPlan >= 0;
      case 4: return !tofuLoading;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 4) {
      setStep(5);
      startDeploy();
      return;
    }
    if (step === 3) {
      setStep(4);
      generateScript();
      return;
    }
    setStep(prev => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    if (step === 5) return;
    setStep(prev => Math.max(prev - 1, 0));
  };

  const isDeploying = ["pending", "building", "deploying"].includes(state.deployStatus);
  const isFinished = state.deployStatus === "success" || state.deployStatus === "failed";

  return {
    step,
    state,
    setState,
    tofuLoading,
    tofuError,
    deployError,
    canNext,
    handleNext,
    handleBack,
    startDeploy,
    generateScript,
    isDeploying,
    isFinished,
  };
}
