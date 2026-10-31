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
import { INITIAL_WIZARD_STATE, STEP, getDefaultProviderSelection } from "./constants";
import { getPlans } from "./plans";
import { detectServiceModes } from "./envDetection";
import { isServerOnly } from "./serverOnly";
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
  /** Compose path already used to pre-select the Docker Compose target. */
  const composeDefaultedForRef = useRef<string | null>(null);
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
      composeDefaultedForRef.current = null;
      cleanupStandardDeployRef.current();
      return;
    }

    if (!justOpened) return;

    setStep(STEP.PROVIDER);
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
      const detection = detectServiceModes(envVars, serviceTypes, analysis.detectedDbEngine);
      const modes: Record<string, "vps" | "external"> = {};
      const hints: Record<string, string> = {};
      for (const svc of analysis.detectedServices) {
        const result = detection[svc.type];
        modes[svc.type] = result?.mode || "vps";
        if (result?.hint) hints[svc.type] = result.hint;
      }

      return { ...prev, servicesModes: modes, envDetectionHints: hints, envVars };
    });
  }, [open, analysis]);

  // ─── Reset stale "static" selection for server-only repos ────────
  //
  // If the user picked Static before analysis resolved and analysis then
  // reports a CONFIDENT server-only verdict, the hidden Static card must not
  // leave deployStrategy stuck on "static". Only `false` resets — `undefined`
  // (undecided) leaves the choice untouched.

  useEffect(() => {
    if (!open || !isServerOnly(analysis)) return;
    setState((prev) => (prev.deployStrategy === "static" ? { ...prev, deployStrategy: "vps" } : prev));
  }, [open, analysis]);

  // ─── Default to Docker Compose when the repo ships one ───────────
  //
  // A repository with a compose file has already stated how it expects to run,
  // and that is a stronger signal than any single-container inference — so it
  // becomes the pre-selected target rather than an option to discover.
  //
  // Applied ONCE per analysed compose file, tracked by path: without the ref
  // this effect would re-assert "compose" on every analysis-identity change
  // and silently undo a user who deliberately switched to Server. The ref is
  // cleared when the wizard closes (see the reset block above), so reopening
  // offers the default again.
  useEffect(() => {
    if (!open || !analysis) return;
    const compose = analysis.compose;
    if (!compose || compose.problems.length > 0) return;
    if (composeDefaultedForRef.current === compose.path) return;
    composeDefaultedForRef.current = compose.path;
    setState((prev) => ({ ...prev, deployStrategy: "compose" }));
  }, [open, analysis]);

  // ─── Reset a stale "compose" selection ───────────────────────────
  //
  // Same class of bug as the static reset above: the Compose card is only
  // rendered when analysis found a deployable compose file, so a selection made
  // before analysis resolved — or kept after a re-analysis found the file gone
  // or broken — would leave deployStrategy on "compose" with no card to
  // un-select it. The pipeline would then refuse the deploy for a reason the
  // user cannot see any control for.
  useEffect(() => {
    if (!open || !analysis) return;
    const deployable = analysis.compose && analysis.compose.problems.length === 0;
    if (deployable) return;
    setState((prev) => (prev.deployStrategy === "compose" ? { ...prev, deployStrategy: "vps" } : prev));
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
      case STEP.PROVIDER: return !!state.selectedProvider && !!state.selectedProviderId;
      case STEP.ANALYSIS: return !analysisLoading;
      // A compose deploy needs a public service and its port before it can
      // attach a domain. Both are optional — a stack can legitimately run with
      // no public address — so this does not block, it is only a reminder that
      // the target is fully configured.
      case STEP.TARGET: return true;
      case STEP.PLAN: return state.selectedPlan >= 0;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === STEP.PLAN) {
      // Plan → Deploy: start deploying immediately
      setStep(STEP.DEPLOY);
      startDeploy();
      return;
    }
    if (step === STEP.PROVIDER) {
      // After provider selection, detect service modes from analysis
      const serviceTypes = analysis?.detectedServices?.map(s => s.type) || [];
      if (serviceTypes.length > 0) {
        const detection = detectServiceModes(state.envVars, serviceTypes, analysis?.detectedDbEngine);
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
      setStep(STEP.ANALYSIS);
      return;
    }
    setStep(prev => Math.min(prev + 1, STEP.DEPLOY));
  };

  const handleBack = () => {
    if (step === STEP.DEPLOY) return; // can't go back from deploy
    setStep(prev => Math.max(prev - 1, STEP.PROVIDER));
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
      // A user cancel is not an error — DeployWizard renders deployError in a
      // danger-toned box. StepDeploy carries the cancelled state instead.
      setDeployError("");
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
