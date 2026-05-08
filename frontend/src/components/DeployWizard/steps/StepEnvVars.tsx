import { useState, useEffect, useRef } from "react";
import type { WizardState, RepoAnalysis } from "../types";
import { parseEnvContent, formatEnvContent } from "../utils";
import EnvEditor from "../../EnvEditor";
import LockIcon from "../../icons/outlined/LockIcon";

/**
 * Build a .env.example string from the AI analysis envVars list.
 * Shows keys with empty/placeholder values so the user knows what's expected.
 */
function buildEnvExample(aiEnvVars: string[]): string {
  return aiEnvVars
    .map((entry) => {
      const eqIdx = entry.indexOf("=");
      if (eqIdx >= 0) {
        const key = entry.slice(0, eqIdx);
        const val = entry.slice(eqIdx + 1);
        // If the AI provided a placeholder value, keep it; otherwise show empty
        return val ? `${key}=${val}` : `${key}=`;
      }
      return `${entry}=`;
    })
    .join("\n");
}

export default function StepEnvVars({
  state,
  analysis,
  onChange,
}: {
  state: WizardState;
  analysis: RepoAnalysis | null;
  onChange: (envVars: Array<{ name: string; value: string }>) => void;
}) {
  const aiEnvVars = analysis?.aiAnalysis?.envVars || [];
  const envExample = buildEnvExample(aiEnvVars);

  const [rawEnv, setRawEnv] = useState(() => formatEnvContent(state.envVars));
  const isInternalEditRef = useRef(false);

  // Sync external state changes (e.g. when analysis loads and populates envVars)
  useEffect(() => {
    if (isInternalEditRef.current) {
      isInternalEditRef.current = false;
      return;
    }
    const formatted = formatEnvContent(state.envVars);
    setRawEnv((prev) => {
      const parsed = parseEnvContent(prev);
      const same =
        state.envVars.length === parsed.length &&
        state.envVars.every(
          (r, i) => r.name === parsed[i]?.name && r.value === parsed[i]?.value
        );
      return same ? prev : formatted;
    });
  }, [state.envVars]);

  const handleEnvEdit = (text: string) => {
    isInternalEditRef.current = true;
    setRawEnv(text);
    onChange(parseEnvContent(text));
  };

  return (
    <div className="space-y-4">
      {/* Privacy disclaimer */}
      <div className="flex items-start gap-2.5 p-3 bg-success-50 border border-success-200 rounded-lg">
        <LockIcon className="w-4 h-4 text-success-600 mt-0.5 shrink-0" />
        <p className="text-xs text-success-700">
          We do not store your environment variables. They are only used during
          the deployment process and are injected directly into your instance.
        </p>
      </div>

      {/* Split pane */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: .env.example (read-only) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              .env.example
            </p>
            <span className="text-[10px] text-text-muted bg-secondary-100 px-1.5 py-0.5 rounded">
              read-only
            </span>
          </div>
          {aiEnvVars.length > 0 ? (
            <EnvEditor
              value={envExample}
              onChange={() => {}}
              height="260px"
              placeholder="No environment variables detected"
            />
          ) : (
            <div className="h-[260px] flex items-center justify-center rounded-lg border border-border bg-surface">
              <p className="text-xs text-text-muted">
                No environment variables detected in this project.
              </p>
            </div>
          )}
          <p className="text-[10px] text-text-muted mt-1.5">
            Expected variables detected from your project's code analysis.
          </p>
        </div>

        {/* Right: .env production (editable) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              .env (production)
            </p>
            <span className="text-[10px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded font-medium">
              editable
            </span>
          </div>
          <EnvEditor
            value={rawEnv}
            onChange={handleEnvEdit}
            height="260px"
            placeholder={"# Paste your production .env here\nDATABASE_URL=\nREDIS_URL="}
          />
          <p className="text-[10px] text-text-muted mt-1.5">
            Paste your production credentials. Each line: KEY=value. Comments (#)
            and empty lines are ignored.
          </p>
        </div>
      </div>
    </div>
  );
}
