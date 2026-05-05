import { useState, useEffect, useRef } from "react";
import type { WizardState } from "../types";
import { parseEnvContent, formatEnvContent } from "../utils";
import EnvEditor from "../../EnvEditor";
import DockerIcon from "../../icons/filled/DockerIcon";
import Spinner from "../../Spinner";
import DockerfileIcon from "../../icons/filled/DockerfileIcon";
import RailpackIcon from "../../icons/outlined/RailpackIcon";
import NixpacksIcon from "../../icons/outlined/NixpacksIcon";
import CodeBuildIcon from "../../icons/outlined/CodeBuildIcon";

export default function StepCompose({ state, loading, error, onToggleDocker, onBuildMethodChange, onEnvChange, isTemplate }: {
  state: WizardState;
  loading: boolean;
  error: string;
  onToggleDocker: () => void;
  onBuildMethodChange: (method: "dockerfile" | "railpack" | "nixpacks" | "codebuild") => void;
  onEnvChange: (envVars: Array<{ name: string; value: string }>) => void;
  isTemplate?: boolean;
}) {
  const [rawEnv, setRawEnv] = useState(() => formatEnvContent(state.envVars));
  const isInternalEditRef = useRef(false);

  useEffect(() => {
    if (isInternalEditRef.current) {
      isInternalEditRef.current = false;
      return;
    }
    const formatted = formatEnvContent(state.envVars);
    setRawEnv((prev) => {
      const parsed = parseEnvContent(prev);
      const same = state.envVars.length === parsed.length &&
        state.envVars.every((r, i) => r.name === parsed[i]?.name && r.value === parsed[i]?.value);
      return same ? prev : formatted;
    });
  }, [state.envVars]);

  const handleEnvEdit = (text: string) => {
    isInternalEditRef.current = true;
    setRawEnv(text);
    onEnvChange(parseEnvContent(text));
  };

  return (
    <div className="space-y-4">
      {/* Docker toggle — hidden for template projects and static deploys (no container needed) */}
      {!isTemplate && state.deployStrategy !== "static" && (
      <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2">
          <DockerIcon className="w-5 h-5 text-blue-500" />
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
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.useDocker ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>
      )}

      {/* Build method selector for non-static deploys */}
      {!isTemplate && state.deployStrategy !== "static" && state.useDocker && (() => {
        const isAws = state.selectedProvider === "aws";
        const methods: Array<{ id: "dockerfile" | "railpack" | "nixpacks" | "codebuild"; label: string; desc: string; icon: React.ReactNode; awsOnly?: boolean }> = [
          { id: "dockerfile", label: "Dockerfile", desc: "Auto-generated Dockerfile with auto-fix on failure", icon: <DockerfileIcon className="w-4 h-4 text-blue-500" /> },
          { id: "railpack", label: "Railpack", desc: "Zero-config builder by Railway, falls back to Dockerfile", icon: <RailpackIcon className="w-4 h-4 text-purple-500" /> },
          { id: "nixpacks", label: "Nixpacks", desc: "Nix-based builder by Railway, falls back to Dockerfile", icon: <NixpacksIcon className="w-4 h-4 text-cyan-500" /> },
          { id: "codebuild", label: "CodeBuild", desc: "AWS CodeBuild with BuildKit + ECR cache, no local Docker needed", icon: <CodeBuildIcon className="w-4 h-4 text-orange-500" />, awsOnly: true },
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
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500/30"
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
              <CodeBuildIcon className="w-4 h-4 text-orange-500" />
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Spinner className="w-4 h-4" />
          <span className="text-sm text-text-muted">Preparing deployment…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">{error}</div>
      )}

      {/* Environment Variables */}
      {!loading && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment Variables</p>
          <EnvEditor
            value={rawEnv}
            onChange={handleEnvEdit}
            height="140px"
            placeholder="# Paste your .env file content&#10;KEY=value&#10;ANOTHER=value"
          />
          <p className="text-[10px] text-text-muted mt-2">Paste your .env file content. Each line should be KEY=value. Comments (#) and empty lines are ignored.</p>
        </div>
      )}
    </div>
  );
}
