/**
 * Deploy Wizard Orchestrator
 *
 * Slim hook that manages wizard state, step navigation, and deployment.
 * With the Dokploy pipeline, the Build step is removed — the backend handles
 * build type detection and Dockerfile generation internally.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { deployApi } from "@/services/api";
import type { WizardState, RepoAnalysis, Provider } from "./types";
import { INITIAL_WIZARD_STATE, getDefaultProviderSelection } from "./constants";
import { getPlans } from "./plans";
import { detectServiceModes } from "./envDetection";
import { useStandardDeploy } from "./useStandardDeploy";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { getErrorMessage } from "@/utils/errors";

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
    }));

    try {
      const repo = getRepoString(project.repository);
      const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, project.sourceType === "template" ? project.template : undefined);
      const selectedPlan = plans[state.selectedPlan] || plans[1] || plans[0];

      await startStandardDeploy({
        state,
        project,
        analysis,
        repo,
        instanceType: selectedPlan?.instance,
        onStateUpdate: setState,
        onError: setDeployError,
        onComplete: () => onDeployCompleteRef.current?.(),
      });
    } catch (err: unknown) {
      setDeployError(getErrorMessage(err, "Failed to start deployment"));
      setState(prev => ({ ...prev, deployStatus: "failed" }));
    }
  }, [state, project, analysis, startStandardDeploy]);

  // ─── Step Navigation ─────────────────────────────────────────────

  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!state.selectedProvider && !!state.selectedProviderId;
      case 1: return !analysisLoading;
      case 2: return state.selectedPlan >= 0;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      // Plan → Deploy: start deploying immediately
      setStep(3);
      startDeploy();
      return;
    }
    if (step === 0) {
      // After provider selection, detect service modes from analysis
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
      setStep(1);
      return;
    }
    setStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    if (step === 3) return; // can't go back from deploy
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
      setDeployError(getErrorMessage(err, "Failed to cancel deployment"));
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
    deployError,
    canNext,
    handleNext,
    handleBack,
    startDeploy,
    cancelDeploy,
    cancellingDeploy,
    isDeploying,
    isFinished,
  };
}
