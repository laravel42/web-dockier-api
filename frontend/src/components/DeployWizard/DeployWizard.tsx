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
import Spinner from "../Spinner";

export default function DeployWizard({ open, onClose, project, analysis, analysisLoading, analysisError, providers, onDeployComplete }: DeployWizardProps) {
  const {
    step, state, setState,
    tofuLoading, tofuError, deployError,
    canNext, handleNext, handleBack,
    startDeploy, cancelDeploy, cancellingDeploy,
    generateScript,
    isDeploying, isFinished,
  } = useDeployWizard({ open, project, analysis, analysisLoading, providers, onDeployComplete });

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
            templateId={project.sourceType === "template" ? project.template : undefined}
            analysis={analysis}
            onChange={(strategy) => setState(prev => ({ ...prev, deployStrategy: strategy }))}
          />
        )}
        {step === 2 && (
          <StepAnalysis
            state={state}
            analysis={analysis}
            analysisLoading={analysisLoading}
            analysisError={analysisError}
            detectionHints={state.envDetectionHints || {}}
            onChange={(modes) => {
              const changed = Object.keys(modes).filter(k => modes[k] !== state.servicesModes[k]);
              setState(prev => ({
                ...prev,
                servicesModes: modes,
                manualServiceOverrides: [...new Set([...prev.manualServiceOverrides, ...changed])],
              }));
            }}
          />
        )}
        {step === 3 && (
          <StepEnvironment
            state={state}
            templateId={project.sourceType === "template" ? project.template : undefined}
            onChange={(env, plan) => setState(prev => ({ ...prev, environment: env, selectedPlan: plan }))}
            onRegionChange={(region) => setState(prev => ({ ...prev, tofuRegion: region }))}
          />
        )}
        {step === 4 && (
          <StepCompose
            state={state}
            loading={tofuLoading}
            error={tofuError}
            isTemplate={project.sourceType === "template"}
            hasRepoDockerfile={analysis?.hasDocker ?? false}
            onToggleDocker={() => {
              const next = !state.useDocker;
              setState(prev => ({ ...prev, useDocker: next, tofuScript: "" }));
              generateScript({ useDocker: next });
            }}
            onBuildMethodChange={(method) => setState(prev => ({ ...prev, buildMethod: method }))}
            onDockerfileSourceChange={(useRepoDockerfile) => {
              setState(prev => ({ ...prev, useRepoDockerfile, tofuScript: "" }));
            }}
            onRegenerateScript={() => {
              setState(prev => ({ ...prev, tofuScript: "" }));
              void generateScript();
            }}
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
          {step > 0 && step < 6 && !isDeploying && (
            <button type="button" onClick={handleBack} className={btnSecondary}>
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDeploying && (
            <button
              type="button"
              onClick={cancelDeploy}
              disabled={cancellingDeploy}
              className="h-9 px-4 text-sm font-medium text-amber-500 border border-amber-500/30 rounded-(--radius-btn) hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              {cancellingDeploy ? "Cancelling…" : "Cancel Deploy"}
            </button>
          )}
          {step === 6 && isFinished && (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Close
            </button>
          )}
          {step === 6 && state.deployStatus === "failed" && (
            <button type="button" onClick={startDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
              ↻ Retry
            </button>
          )}
          {step < 6 && !isDeploying && (
            <>
              {step === 0 && (
                <button type="button" onClick={() => { if (!isDeploying) onClose(); }} className={btnSecondary}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canNext()}
                className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5`}
              >
                {step === 5 ? (
                  tofuLoading ? (
                    <>
                      <Spinner className="size-4" />
                      Preparing deploy script…
                    </>
                  ) : !state.tofuScript ? (
                    "Prepare deploy script"
                  ) : (
                    <>
                      <RocketIcon />
                      Deploy
                    </>
                  )
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
