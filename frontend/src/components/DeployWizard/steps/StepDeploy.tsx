import { useEffect, useRef } from "react";
import type { WizardState } from "../types";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import Spinner from "@/components/Spinner";

export default function StepDeploy({ state }: { state: WizardState }) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [state.deployLogs]);

  const statusColors: Record<string, string> = {
    pending: "bg-warning-50 text-warning-500",
    building: "bg-primary-50 text-primary-500",
    deploying: "bg-primary-100 text-primary-700",
    success: "bg-success-50 text-success-500",
    failed: "bg-danger-50 text-danger-500",
    cancelled: "bg-amber-50 text-amber-600",
  };

  const isRunning = ["pending", "building", "deploying"].includes(state.deployStatus);

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted uppercase tracking-wide">Status:</span>
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${statusColors[state.deployStatus] || "bg-secondary-100 text-text-muted"}`}>
          {state.deployStatus || "waiting"}
        </span>
        {isRunning && <Spinner className="size-3.5 " />}
      </div>

      {/* Timeline steps */}
      <div className="flex items-center gap-2 text-xs">
        {["Provisioning", "Building Image", "Pushing", "Starting"].map((step, i) => {
          const phases = ["pending", "building", "deploying", "success"];
          const currentIdx = phases.indexOf(state.deployStatus);
          const isSuccess = state.deployStatus === "success";
          const done = currentIdx > i || (isSuccess && currentIdx === i);
          const active = currentIdx === i && !isSuccess;
          return (
            <div key={step} className="flex items-center gap-1.5 flex-1">
              <div className={`size-5  rounded-full flex items-center justify-center shrink-0 ${
                done ? "bg-primary-500/80 text-primary-foreground" : active ? "bg-primary-500 text-primary-foreground" : "bg-secondary-100 text-text-muted"
              }`}>
                {done ? (
                  <CheckIcon className="size-3" />
                ) : active ? (
                  <div className="size-2  border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-[9px]">{i + 1}</span>
                )}
              </div>
              <span className={`hidden sm:block ${active ? "text-text font-medium" : "text-text-muted"}`}>{step}</span>
              {i < 3 && <div className={`flex-1 h-px ${done ? "bg-primary-500/80" : "bg-border"}`} />}
            </div>
          );
        })}
      </div>

      {/* Logs */}
      {state.deployLogs.length > 0 && (
        <div ref={logsRef} className="rounded-lg bg-terminal p-3 max-h-72 overflow-y-auto scrollbar-hide font-mono text-xs/relaxed ">
          {state.deployLogs.map((line, i) => (
            <div key={i} className={
              line.includes("✓") ? "text-green-400" :
              line.includes("✗") ? "text-red-400" :
              line.includes("──") ? "text-cyan-400" :
              line.includes("ℹ") ? "text-blue-300" :
              line.includes("▶") ? "text-yellow-300" :
              line.includes("⚠") ? "text-amber-400" :
              "text-gray-300"
            }>
              {line}
            </div>
          ))}
        </div>
      )}

      {state.deployLogs.length === 0 && isRunning && (
        <div className="rounded-lg bg-terminal p-6 flex items-center justify-center gap-2">
          <div className="size-4  border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Waiting for logs…</span>
        </div>
      )}

      {/* CodeBuild logs link */}
      {state.codebuildLogsUrl && (
        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
          <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide mb-1">CodeBuild Logs</p>
          <a href={state.codebuildLogsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors break-all flex items-center gap-1.5">
            <ExternalLinkIcon className="size-4 shrink-0" />
            View in CloudWatch
          </a>
        </div>
      )}

      {/* CodeBuild image URI */}
      {state.codebuildImageUri && (
        <div className="rounded-lg bg-primary-500/10 border border-primary-500/20 p-3">
          <p className="text-xs text-primary-600 font-semibold uppercase tracking-wide mb-1">Built Image</p>
          <p className="text-sm text-text font-mono break-all">{state.codebuildImageUri}</p>
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

      {/* VPS warm-up notice — shown when deploy succeeds on a VPS strategy */}
      {state.deployAppUrl && state.deployStatus === "success" && state.deployStrategy === "vps" && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <p className="text-sm text-amber-500 font-semibold uppercase tracking-wide mb-1">First-time startup notice</p>
          <p className="text-xs/relaxed text-text-muted ">
            If you see an nginx welcome page, don't worry — your application is still booting up. This is normal for VPS deployments and typically resolves within 1–3 minutes as the container starts and configures itself.
          </p>
        </div>
      )}
    </div>
  );
}
