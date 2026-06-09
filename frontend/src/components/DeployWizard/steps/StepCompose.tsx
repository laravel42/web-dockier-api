import type { WizardState } from "../types";
import DockerIcon from "../../icons/filled/DockerIcon";
import Spinner from "../../Spinner";
import DockerfileIcon from "../../icons/filled/DockerfileIcon";
import RailpackIcon from "../../icons/outlined/RailpackIcon";
import NixpacksIcon from "../../icons/outlined/NixpacksIcon";
import CodeBuildIcon from "../../icons/outlined/CodeBuildIcon";
import StepPostDeployCommands from "./StepPostDeployCommands";

export default function StepCompose({ state, loading, error, onToggleDocker, onBuildMethodChange, onPostDeployCommandsChange, onRegenerateScript, isTemplate }: {
  state: WizardState;
  loading: boolean;
  error: string;
  onToggleDocker: () => void;
  onBuildMethodChange: (method: "dockerfile" | "railpack" | "nixpacks" | "codebuild") => void;
  onPostDeployCommandsChange: (commands: Array<{ command: string; enabled: boolean; continueOnFailure: boolean; timeout?: number }>) => void;
  onRegenerateScript?: () => void;
  isTemplate?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Docker toggle — hidden for template projects and static deploys (no container needed) */}
      {!isTemplate && state.deployStrategy !== "static" && (
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2">
          <DockerIcon className="size-5  text-blue-500" />
          <div>
            <span className="text-sm font-medium text-text">Docker Build</span>
            <p className="text-xs text-text-muted">Build and deploy as a container image</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleDocker}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.useDocker ? "bg-primary-500" : "bg-border"}`}
          role="switch"
          aria-checked={state.useDocker}
        >
          <span className={`inline-block size-4  transform rounded-full bg-white transition-transform ${state.useDocker ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      )}

      {/* Build method selector for non-static deploys */}
      {!isTemplate && state.deployStrategy !== "static" && state.useDocker && (() => {
        const isAws = state.selectedProvider === "aws";
        const methods: Array<{ id: "dockerfile" | "railpack" | "nixpacks" | "codebuild"; label: string; desc: string; icon: React.ReactNode; awsOnly?: boolean }> = [
          { id: "dockerfile", label: "Dockerfile", desc: "Auto-generated Dockerfile with auto-fix on failure", icon: <DockerfileIcon className="size-4  text-blue-500" /> },
          { id: "railpack", label: "Railpack", desc: "Zero-config builder by Railway, falls back to Dockerfile", icon: <RailpackIcon className="size-4  text-purple-500" /> },
          { id: "nixpacks", label: "Nixpacks", desc: "Nix-based builder by Railway, falls back to Dockerfile", icon: <NixpacksIcon className="size-4  text-cyan-500" /> },
          { id: "codebuild", label: "CodeBuild", desc: "AWS CodeBuild with BuildKit + ECR cache, no local Docker needed", icon: <CodeBuildIcon className="size-4  text-orange-500" />, awsOnly: true },
        ];
        const filtered = methods.filter(m => !m.awsOnly || isAws);
        return (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Build Method</p>
          <div className={`grid grid-cols-2 ${filtered.length > 3 ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-2`}>
            {filtered.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => onBuildMethodChange(m.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  state.buildMethod === m.id
                    ? "border-primary-500 bg-primary/10 ring-1 ring-primary-500/30"
                    : "border-border bg-surface hover:border-primary-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.icon}
                  <span className="text-sm font-medium text-text">{m.label}</span>
                </div>
                <p className="text-xs text-text-muted">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>
        );
      })()}

      {/* Optional CodeBuild for AWS static deploys — build remotely instead of locally */}
      {!isTemplate && state.deployStrategy === "static" && state.selectedProvider === "aws" && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Build Method <span className="text-text-muted font-normal normal-case">(optional)</span></p>
          <p className="text-xs text-text-secondary mb-2">
            By default the static site is built locally. You can optionally use AWS CodeBuild to build remotely instead.
          </p>
          <button
            type="button"
            onClick={() => onBuildMethodChange(state.buildMethod === "codebuild" ? "dockerfile" : "codebuild")}
            className={`w-full p-3 rounded-lg border text-left transition-all ${
              state.buildMethod === "codebuild"
                ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
                : "border-border bg-surface hover:border-primary-500/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <CodeBuildIcon className="size-4  text-orange-500" />
              <span className="text-sm font-medium text-text">CodeBuild</span>
              {state.buildMethod === "codebuild" && (
                <span className="ml-auto text-xs text-primary-500 font-medium">Active</span>
              )}
            </div>
            <p className="text-xs text-text-muted">AWS CodeBuild builds your site remotely — no local build needed</p>
          </button>
        </div>
      )}

      {/* Resources */}
      {state.tofuResources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">Resources to create</p>
          <div className="flex flex-wrap gap-1.5">
            {state.tofuResources.map((r, i) => (
              <span key={i} className="px-2 py-0.5 bg-primary-50 text-primary-600 rounded text-xs font-medium">{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Post-Deploy Commands — hidden for static deploys */}
      {state.deployStrategy !== "static" && (
        <StepPostDeployCommands
          state={state}
          onChange={onPostDeployCommandsChange}
        />
      )}

      {/* Deploy script preview */}
      {!loading && state.tofuScript && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Deploy script</p>
            {onRegenerateScript && (
              <button type="button" onClick={onRegenerateScript} className="text-xs text-primary-500 hover:underline">
                Regenerate
              </button>
            )}
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-text-secondary">
            {state.tofuScript}
          </pre>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6">
          <Spinner className="size-4 " />
          <span className="text-sm text-text-muted">Preparing deploy script…</span>
        </div>
      )}

      {/* Empty / retry prompt */}
      {!loading && !state.tofuScript && !error && (
        <p className="text-center text-sm text-text-muted py-4">
          Configure build options above, then prepare the deploy script to continue.
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}
    </div>
  );
}
