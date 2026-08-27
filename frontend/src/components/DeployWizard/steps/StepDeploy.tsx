import { useEffect, useMemo, useRef } from "react";
import type { WizardState } from "../types";
import { CheckIcon, XIcon, ExternalLinkIcon } from "lucide-react";
import Spinner from "@/components/Spinner";

// ─── Stage Parsing ─────────────────────────────────────────────────

type StageStatus = "pending" | "in-progress" | "success" | "failed";

interface PipelineStage {
  id: string;
  label: string;
  status: StageStatus;
  logs: string[];
}

interface AIRetryInfo {
  attempt: number;
  maxAttempts: number;
  fixDescription: string | null;
}

const STAGE_DEFS = [
  { id: "ensure-project", label: "Create Project" },
  { id: "sync-git", label: "Sync Git Credentials" },
  { id: "provision-server", label: "Provision Server" },
  { id: "configure-app", label: "Configure Application" },
  { id: "deploy", label: "Deploy" },
] as const;

/**
 * Parse deploy log lines into structured pipeline stages.
 * Backend logs use markers like `[stage:ensure-project] ...`
 */
function parseStages(logs: string[]): { stages: PipelineStage[]; retries: AIRetryInfo[] } {
  const stages: PipelineStage[] = STAGE_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    status: "pending",
    logs: [],
  }));

  const retries: AIRetryInfo[] = [];
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  for (const line of logs) {
    // Match [stage:xxx] markers
    const stageMatch = line.match(/\[stage:([\w-]+)\]/);
    if (stageMatch) {
      const stageId = stageMatch[1];
      const stage = stageMap.get(stageId);
      if (stage) {
        stage.logs.push(line);

        // Determine status from markers
        if (line.includes("✓")) {
          stage.status = "success";
        } else if (line.includes("✗")) {
          stage.status = "failed";
        } else if (stage.status === "pending") {
          stage.status = "in-progress";
        }
      }

      // Parse AI recovery info
      if (stageId === "ai-recovery" && line.includes("Fix applied:")) {
        const descMatch = line.match(/Fix applied:\s*(.+)/);
        retries.push({
          attempt: retries.length + 1,
          maxAttempts: 3,
          fixDescription: descMatch?.[1] || "Applied automatic fix",
        });
      }
    }

    // Parse deploy attempts
    const attemptMatch = line.match(/Attempt (\d+)\/(\d+)/);
    if (attemptMatch) {
      const [, attempt, max] = attemptMatch;
      // Update retry tracking
      if (parseInt(attempt) > 1) {
        const lastRetry = retries[retries.length - 1];
        if (lastRetry) lastRetry.maxAttempts = parseInt(max);
      }
    }
  }

  return { stages, retries };
}

// ─── Component ─────────────────────────────────────────────────────

export default function StepDeploy({ state }: { state: WizardState }) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [state.deployLogs]);

  const { stages, retries } = useMemo(() => parseStages(state.deployLogs), [state.deployLogs]);

  const isRunning = ["pending", "building", "deploying"].includes(state.deployStatus);
  const isFailed = state.deployStatus === "failed";
  const isSuccess = state.deployStatus === "success";

  return (
    <div className="space-y-5">
      {/* Overall status */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted uppercase tracking-wide">Status:</span>
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
          isSuccess ? "bg-success-50 text-success-500" :
          isFailed ? "bg-danger-50 text-danger-500" :
          isRunning ? "bg-primary-50 text-primary-500" :
          "bg-secondary-100 text-text-muted"
        }`}>
          {state.deployStatus || "waiting"}
        </span>
        {isRunning && <Spinner className="size-3.5" />}
      </div>

      {/* Pipeline stage timeline */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="space-y-0">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-start gap-3">
              {/* Vertical connector + status icon */}
              <div className="flex flex-col items-center">
                <StageIcon status={stage.status} />
                {i < stages.length - 1 && (
                  <div className={`w-px h-6 ${
                    stage.status === "success" ? "bg-success-500/40" :
                    stage.status === "failed" ? "bg-danger-500/40" :
                    "bg-border"
                  }`} />
                )}
              </div>

              {/* Stage info */}
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    stage.status === "success" ? "text-success-500" :
                    stage.status === "failed" ? "text-danger-500" :
                    stage.status === "in-progress" ? "text-text" :
                    "text-text-muted"
                  }`}>
                    {stage.label}
                  </span>
                  {stage.status === "in-progress" && (
                    <Spinner className="size-3" />
                  )}
                </div>
                {/* Show last meaningful log for the stage */}
                {stage.logs.length > 0 && stage.status !== "pending" && (
                  <p className="text-xs text-text-muted mt-0.5 truncate max-w-md">
                    {cleanLogLine(stage.logs[stage.logs.length - 1])}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI retry info */}
      {retries.length > 0 && (
        <div className="rounded-lg bg-warning-surface border border-warning-line p-3 space-y-2">
          <p className="text-xs font-semibold text-warning-ink uppercase tracking-wide">AI Recovery</p>
          {retries.map((retry, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="shrink-0 text-warning-ink font-medium">Attempt {retry.attempt + 1}:</span>
              <span>{retry.fixDescription || "Analyzing deployment failure..."}</span>
            </div>
          ))}
        </div>
      )}

      {/* Detailed logs */}
      {state.deployLogs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-text-muted hover:text-text transition-colors select-none">
            Show raw logs ({state.deployLogs.length} lines)
          </summary>
          <div ref={logsRef} className="mt-2 rounded-lg bg-terminal p-3 max-h-56 overflow-y-auto scrollbar-hide font-mono text-xs/relaxed">
            {state.deployLogs.map((line, i) => (
              <div key={i} className={
                line.includes("✓") ? "text-green-400" :
                line.includes("✗") ? "text-red-400" :
                line.includes("──") ? "text-primary-500" :
                line.includes("ℹ") ? "text-primary-500" :
                line.includes("▶") ? "text-warning-ink" :
                line.includes("⚠") ? "text-warning-ink" :
                "text-text-secondary"
              }>
                {line}
              </div>
            ))}
          </div>
        </details>
      )}

      {state.deployLogs.length === 0 && isRunning && (
        <div className="rounded-lg bg-terminal p-6 flex items-center justify-center gap-2">
          <Spinner className="size-4" />
          <span className="text-sm text-text-muted">Waiting for pipeline to start…</span>
        </div>
      )}

      {/* App URL */}
      {state.deployAppUrl && (
        <div className="rounded-lg bg-success-500/10 border border-success-500/20 p-3">
          <p className="text-xs text-success-500 font-semibold uppercase tracking-wide mb-1">Application URL</p>
          <a href={state.deployAppUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors break-all flex items-center gap-1.5">
            <ExternalLinkIcon className="size-4 shrink-0" />
            {state.deployAppUrl}
          </a>
        </div>
      )}

      {/* VPS warm-up notice */}
      {state.deployAppUrl && isSuccess && state.deployStrategy === "vps" && (
        <div className="rounded-lg bg-warning-surface border border-warning-line p-3">
          <p className="text-sm text-warning-ink font-semibold uppercase tracking-wide mb-1">First-time startup notice</p>
          <p className="text-xs/relaxed text-text-muted">
            If you see an nginx welcome page, don't worry — your application is still booting up. This is normal for VPS deployments and typically resolves within 1–3 minutes as the container starts and configures itself.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "success":
      return (
        <div className="size-5 rounded-full bg-success-500/80 text-white flex items-center justify-center shrink-0">
          <CheckIcon className="size-3" />
        </div>
      );
    case "failed":
      return (
        <div className="size-5 rounded-full bg-danger-500/80 text-white flex items-center justify-center shrink-0">
          <XIcon className="size-3" />
        </div>
      );
    case "in-progress":
      return (
        <div className="size-5 rounded-full bg-primary-500 text-white flex items-center justify-center shrink-0">
          <div className="size-2 border border-white border-t-transparent rounded-full animate-spin" />
        </div>
      );
    default:
      return (
        <div className="size-5 rounded-full bg-secondary-100 flex items-center justify-center shrink-0">
          <div className="size-2 rounded-full bg-text-muted/40" />
        </div>
      );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Strip the timestamp and stage marker prefix from a log line for display.
 * Input:  "[2025-01-15T10:00:00Z] [stage:ensure-project] ✓ Project created: abc123"
 * Output: "Project created: abc123"
 */
function cleanLogLine(line: string): string {
  return line
    .replace(/^\[[\d\-T:.Z]+\]\s*/, "") // remove timestamp
    .replace(/\[stage:[\w-]+\]\s*/, "") // remove stage marker
    .replace(/^[✓✗⚠▶ℹ]\s*/, ""); // remove status icon
}
