/**
 * Deploy Wizard Orchestrator
 *
 * Slim hook that manages wizard state, step navigation, and script generation.
 * Delegates actual deployment execution to useStandardDeploy (backend pipeline).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { deployApi } from "../../services/api";
import type { WizardState, RepoAnalysis, Provider } from "./types";
import { INITIAL_WIZARD_STATE, getDefaultProviderSelection } from "./constants";
import { getPlans } from "./plans";
import { parseOwnerRepo } from "./utils";
import { detectServiceModes } from "./envDetection";
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

function analysisSyncKey(analysis: RepoAnalysis | null): string | null {
  if (!analysis?.detectedServices?.length) return null;
  return analysis.detectedServices.map((s) => s.type).join(",");
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

  const { start: startStandardDeploy, cleanup: cleanupStandardDeploy } = useStandardDeploy();

  const prevOpenRef = useRef(false);
  const configLoadedRef = useRef(false);
  const analysisSyncedKeyRef = useRef<string | null>(null);
  const cleanupStandardDeployRef = useRef(cleanupStandardDeploy);
  cleanupStandardDeployRef.current = cleanupStandardDeploy;

  // ─── Reset on open (rising edge only) ────────────────────────────

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    const justClosed = !open && prevOpenRef.current;
    prevOpenRef.current = open;

    if (justClosed) {
      configLoadedRef.current = false;
      analysisSyncedKeyRef.current = null;
      cleanupStandardDeployRef.current();
      return;
    }

    if (!justOpened) return;

    setStep(0);
    setTofuLoading(false);
    setTofuError("");
    setDeployError("");
    configLoadedRef.current = false;
    analysisSyncedKeyRef.current = null;

    const defaultProvider = getDefaultProviderSelection(providers);
    setState({ ...INITIAL_WIZARD_STATE, ...(defaultProvider ?? {}) });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open; providers load in separate effect
  }, [open]);

  // ─── Default provider when providers load after open ─────────────

  useEffect(() => {
    if (!open) return;
    const defaultProvider = getDefaultProviderSelection(providers);
    if (!defaultProvider) return;
    setState((prev) => {
      if (prev.selectedProviderId) return prev;
      return { ...prev, ...defaultProvider };
    });
  }, [open, providers]);

  // ─── Load saved post-deploy commands (once per open) ─────────────

  useEffect(() => {
    if (!open || !project.id || configLoadedRef.current) return;
    configLoadedRef.current = true;
  }, [open, project.id]);

  // ─── Sync Analysis ───────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    const syncKey = analysisSyncKey(analysis);
    if (!syncKey || syncKey === analysisSyncedKeyRef.current) return;
    analysisSyncedKeyRef.current = syncKey;

    setState((prev) => {
      if (Object.keys(prev.servicesModes).length > 0) return prev;
      if (!analysis?.detectedServices?.length) return prev;

      const envVars = prev.envVars.length > 0
        ? prev.envVars
        : normalizeEnvVars(analysis.aiAnalysis?.envVars).map((entry) => {
            const eqIdx = entry.indexOf("=");
            return eqIdx >= 0
              ? { name: entry.slice(0, eqIdx), value: entry.slice(eqIdx + 1) }
              : { name: entry, value: "" };
          });

      const serviceTypes = analysis.detectedServices.map((s) => s.type);
      const detection = detectServiceModes(envVars, serviceTypes);
      const modes: Record<string, "vps" | "managed"> = {};
      const hints: Record<string, string> = {};
      for (const svc of analysis.detectedServices) {
        const result = detection[svc.type];
        modes[svc.type] = result?.mode || "vps";
        if (result?.hint) hints[svc.type] = result.hint;
      }


      return { ...prev, servicesModes: modes, envDetectionHints: hints, envVars };
    });
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
        aiAnalysis: (analysis?.aiAnalysis as Record<string, unknown> | undefined) || undefined,
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
    } catch (err: unknown) {
      setTofuError(err instanceof Error ? err.message : "Failed to generate Pulumi program");
    } finally {
      setTofuLoading(false);
    }
  }, [state, project, analysis]);

  // ─── Start Deployment ────────────────────────────────────────────

  const onDeployCompleteRef = useRef(onDeployComplete);
  onDeployCompleteRef.current = onDeployComplete;

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

      // All deploy paths go through the backend pipeline
      await startStandardDeploy({
        state,
        project,
        analysis,
        repo,
        onStateUpdate: setState,
        onError: setDeployError,
        onComplete: () => onDeployCompleteRef.current?.(),
      });
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : "Failed to start deployment");
      setState(prev => ({ ...prev, deployStatus: "failed" }));
    }
  }, [state, project, analysis, startStandardDeploy]);

  // ─── Step Navigation ─────────────────────────────────────────────

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
      if (tofuLoading) return;
      if (!state.tofuScript) {
        await generateScript();
        return;
      }
      setStep(5);
      startDeploy();
      return;
    }
    if (step === 3) {
      setStep(4);
      if (!state.tofuScript) void generateScript();
      return;
    }
    if (step === 1) {
      // After service selection, detect service modes from analysis
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
      setStep(2);
      return;
    }
    setStep(prev => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    if (step === 5) return;
    setStep(prev => Math.max(prev - 1, 0));
  };

  // ─── Cancel Deployment ─────────────────────────────────────────────

  const [cancellingDeploy, setCancellingDeploy] = useState(false);

  const cancelDeploy = useCallback(async () => {
    if (!state.deploymentId) return;
    setCancellingDeploy(true);
    try {
      await deployApi.cancelDeployment(state.deploymentId);
      cleanupStandardDeployRef.current();
      setState(prev => ({ ...prev, deployStatus: "cancelled" }));
      setDeployError("Deployment cancelled.");
    } catch (err: unknown) {
      setDeployError(err instanceof Error ? err.message : "Failed to cancel deployment");
    } finally {
      setCancellingDeploy(false);
    }
  }, [state.deploymentId]);

  // ─── Derived State ───────────────────────────────────────────────

  const isDeploying = ["pending", "building", "deploying"].includes(state.deployStatus);
  const isFinished = state.deployStatus === "success" || state.deployStatus === "failed" || state.deployStatus === "cancelled";

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
    cancelDeploy,
    cancellingDeploy,
    generateScript,
    isDeploying,
    isFinished,
  };
}
