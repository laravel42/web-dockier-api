import type { DeployWizardProps } from "./types";
import { STEPS, PROVIDER_REGIONS, btnPrimary, btnSecondary } from "./constants";
import { useDeployWizard } from "./useDeployWizard";
import Modal from "../Modal";
import Stepper from "./steps/Stepper";
import StepProvider from "./steps/StepProvider";
import StepService from "./steps/StepService";
import StepAnalysis from "./steps/StepAnalysis";
import StepEnvironment from "./steps/StepEnvironment";
import StepCompose from "./steps/StepCompose";
import StepDeploy from "./steps/StepDeploy";
import RocketIcon from "../icons/outlined/RocketIcon";

export default function DeployWizard({ open, onClose, project, analysis, analysisLoading, analysisError, providers, onDeployComplete }: DeployWizardProps) {
  const {
    step, state, setState,
    tofuLoading, tofuError, deployError,
    canNext, handleNext, handleBack,
    startDeploy, generateScript,
    isDeploying, isFinished,
  } = useDeployWizard({ open, project, analysis, analysisLoading, onDeployComplete });

  return (
    <Modal
      open={open}
      onClose={() => { if (!isDeploying) onClose(); }}
      title={step === 5 ? "Deploying…" : `Deploy — ${STEPS[step].icon} ${STEPS[step].label}`}
      size="xl"
    >
      <Stepper current={step} steps={STEPS} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 0 && (
          <StepProvider
            state={state}
            providers={providers}
            onChange={(provider, providerId) => setState(prev => ({
              ...prev,
              selectedProvider: provider,
              selectedProviderId: providerId,
              tofuRegion: PROVIDER_REGIONS[provider]?.[0]?.id || "",
            }))}
          />
        )}
        {step === 1 && (
          <StepService
            state={state}
            onChange={(strategy) => setState(prev => ({ ...prev, deployStrategy: strategy }))}
          />
        )}
        {step === 2 && (
          <StepAnalysis
            state={state}
            analysis={analysis}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            onChange={(modes) => setState(prev => ({ ...prev, servicesModes: modes }))}
          />
        )}
        {step === 3 && (
          <StepEnvironment
            state={state}
            onChange={(env, plan) => setState(prev => ({ ...prev, environment: env, selectedPlan: plan }))}
            onRegionChange={(region) => setState(prev => ({ ...prev, tofuRegion: region }))}
          />
        )}
        {step === 4 && (
          <StepCompose
            state={state}
            loading={tofuLoading}
            error={tofuError}
            onToggleDocker={() => {
              const next = !state.useDocker;
              setState(prev => ({ ...prev, useDocker: next, tofuScript: "" }));
              generateScript({ useDocker: next });
            }}
            onBuildMethodChange={(method) => setState(prev => ({ ...prev, buildMethod: method }))}
            onEnvChange={(envVars) => setState(prev => ({ ...prev, envVars }))}
          />
        )}
        {step === 5 && <StepDeploy state={state} />}
      </div>

      {/* Errors */}
      {deployError && step === 5 && (
        <div className="mt-3 rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{deployError}</div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
        <div>
          {step > 0 && step < 5 && (
            <button type="button" onClick={handleBack} className={btnSecondary}>
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step === 5 && isFinished && (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Close
            </button>
          )}
          {step === 5 && state.deployStatus === "failed" && (
            <button type="button" onClick={startDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
              ↻ Retry
            </button>
          )}
          {step < 5 && !isDeploying && (
            <>
              <button type="button" onClick={() => { if (!isDeploying) onClose(); }} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canNext()}
                className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
              >
                {step === 4 ? (
                  <>
                    <RocketIcon />
                    Deploy
                  </>
                ) : (
                  "Next →"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
