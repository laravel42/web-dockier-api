/**
 * Deploy Wizard Orchestrator
 *
 * Slim hook that manages wizard state, step navigation, and script generation.
 * Delegates actual deployment execution to useCodeBuildPipeline or useStandardDeploy.
 */

import { useState, useEffect, useCallback } from "react";
import { deployApi, projectsApi } from "../../services/api";
import type { WizardState, RepoAnalysis, Provider } from "./types";
import { INITIAL_WIZARD_STATE, getDefaultProviderSelection } from "./constants";
import { getPlans } from "./plans";
import { parseOwnerRepo } from "./utils";
import { detectServiceModes } from "./envDetection";
import { useCodeBuildPipeline } from "./useCodeBuildPipeline";
import { useStandardDeploy } from "./useStandardDeploy";

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Normalize envVars from AI response — handles both array ["KEY=value"] and object {KEY: "value"} formats.
 */
function normalizeEnvVars(envVars: unknown): string[] {
  if (Array.isArray(envVars)) return envVars.filter((v): v is string => typeof v === "string");
  if (envVars && typeof envVars === "object" && !Array.isArray(envVars)) {
    return Object.entries(envVars as Record<string, unknown>).map(([k, v]) => `${k}=${v ?? ""}`);
  }
  return [];
}

function getRepoString(repository: string): string {
  const parsed = parseOwnerRepo(repository);
  return parsed ? `${parsed.owner}/${parsed.repo}` : repository;
}

// ─── Hook ──────────────────────────────────────────────────────────

interface UseDeployWizardParams {
  open: boolean;
  project: { id: string; name: string; repository: string; branch: string; connectionId: string; sourceType?: string; template?: string };
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  providers: Provider[];
  onDeployComplete?: () => void;
}

export function useDeployWizard({ open, project, analysis, analysisLoading, providers, onDeployComplete }: UseDeployWizardParams) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({ ...INITIAL_WIZARD_STATE });
  const [tofuLoading, setTofuLoading] = useState(false);
  const [tofuError, setTofuError] = useState("");
  const [deployError, setDeployError] = useState("");

  const codeBuild = useCodeBuildPipeline();
  const standardDeploy = useStandardDeploy();

  // ─── Reset on Open ───────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setStep(0);
      const defaultProvider = getDefaultProviderSelection(providers);
      setState({ ...INITIAL_WIZARD_STATE, ...(defaultProvider ?? {}) });
      setTofuLoading(false);
      setTofuError("");
      setDeployError("");

      // Load saved post-deploy commands from project config
      if (project.id) {
        projectsApi.get(project.id).then(p => {
          const saved = p.config?.postDeployCommands;
          if (saved?.length) {
            setState(prev => ({ ...prev, postDeployCommands: saved }));
          }
        }).catch((err) => console.warn("[deploy] Failed to load project config:", err));
      }
    }
    return () => {
      codeBuild.cleanup();
      standardDeploy.cleanup();
    };
  }, [open, providers, project.id]);

  // ─── Sync Analysis ───────────────────────────────────────────────

  useEffect(() => {
    if (open && analysis?.detectedServices?.length) {
      setState(prev => {
        if (Object.keys(prev.servicesModes).length > 0) return prev;

        const envVars = prev.envVars.length > 0
          ? prev.envVars
          : normalizeEnvVars(analysis.aiAnalysis?.envVars).map(entry => {
              const eqIdx = entry.indexOf("=");
              return eqIdx >= 0
                ? { name: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) }
                : { name: entry, value: "" };
            });

        const serviceTypes = analysis.detectedServices.map(s => s.type);
        const detection = detectServiceModes(envVars, serviceTypes);
        const modes: Record<string, "vps" | "managed"> = {};
        const hints: Record<string, string> = {};
        for (const svc of analysis.detectedServices) {
          const result = detection[svc.type];
          modes[svc.type] = result?.mode || "vps";
          if (result?.hint) hints[svc.type] = result.hint;
        }

        const rawCommands = analysis.aiAnalysis?.postDeployCommands;
        const commandsList = Array.isArray(rawCommands) ? rawCommands.filter((c): c is string => typeof c === "string") : [];
        const postDeployCommands = prev.postDeployCommands.length > 0
          ? prev.postDeployCommands
          : commandsList.map(cmd => ({ command: cmd, enabled: true, continueOnFailure: false }));

        return { ...prev, servicesModes: modes, envDetectionHints: hints, envVars, postDeployCommands };
      });
    }
  }, [open, analysis]);

  // ─── Generate Script ─────────────────────────────────────────────

  const generateScript = useCallback(async (overrideState?: Partial<WizardState>) => {
    const s = { ...state, ...overrideState };
    if (!s.selectedProviderId || !project) return;
    setTofuLoading(true);
    setTofuError("");
    try {
      const repo = getRepoString(project.repository);
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

  // ─── Start Deployment ────────────────────────────────────────────

  const startDeploy = useCallback(async () => {
    if (!project || !state.selectedProviderId) return;
    // Guard against double-click: if already deploying, skip
    if (["pending", "building", "deploying"].includes(state.deployStatus)) return;

    setDeployError("");
    setState(prev => ({
      ...prev,
      deployStatus: "pending",
      deployLogs: [],
      deployAppUrl: "",
      codebuildBuildId: "",
      codebuildImageUri: "",
      codebuildLogsUrl: "",
    }));

    try {
      const repo = getRepoString(project.repository);
      const isCodeBuild = state.buildMethod === "codebuild" && project.sourceType !== "template";

      if (isCodeBuild) {
        await codeBuild.start({
          state,
          project,
          analysis,
          repo,
          onStateUpdate: setState,
          onError: setDeployError,
          onComplete: onDeployComplete,
        });
      } else {
        await standardDeploy.start({
          state,
          project,
          analysis,
          repo,
          onStateUpdate: setState,
          onError: setDeployError,
          onComplete: onDeployComplete,
        });
      }
    } catch (err: any) {
      setDeployError(err.message || "Failed to start deployment");
      setState(prev => ({ ...prev, deployStatus: "failed" }));
    }
  }, [state, project, analysis, onDeployComplete, codeBuild, standardDeploy]);

  // ─── Step Navigation ─────────────────────────────────────────────

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!state.selectedProvider && !!state.selectedProviderId;
      case 1: return !!state.deployStrategy;
      case 2: return true;
      case 3: return !analysisLoading;
      case 4: return state.selectedPlan >= 0;
      case 5: return !tofuLoading;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 5) {
      if (tofuLoading) return;
      if (!state.tofuScript) {
        await generateScript();
        return;
      }
      setStep(6);
      startDeploy();
      return;
    }
    if (step === 4) {
      setStep(5);
      if (!state.tofuScript) void generateScript();
      return;
    }
    if (step === 2) {
      const serviceTypes = analysis?.detectedServices?.map(s => s.type) || [];
      if (serviceTypes.length > 0) {
        const detection = detectServiceModes(state.envVars, serviceTypes);
        setState(prev => {
          const newModes = { ...prev.servicesModes };
          const newHints: Record<string, string> = {};
          for (const [svcType, result] of Object.entries(detection)) {
            newHints[svcType] = result.hint;
            if (!prev.manualServiceOverrides.includes(svcType)) {
              newModes[svcType] = result.mode;
            }
          }
          return { ...prev, servicesModes: newModes, envDetectionHints: newHints };
        });
      }
      setStep(3);
      return;
    }
    setStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    if (step === 6) return;
    setStep(prev => Math.max(prev - 1, 0));
  };

  // ─── Derived State ───────────────────────────────────────────────

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
