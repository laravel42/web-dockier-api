import type { WizardState, RepoAnalysis } from "../types";
import { PROVIDER_META, MANAGED_INFO, FALLBACK_MANAGED } from "../constants";
import WarningIcon from "../../icons/outlined/WarningIcon";
import Spinner from "../../Spinner";

/** Service types that are auto-configured during deployment and should not appear as provisionable infrastructure components. */
const AUTO_CONFIGURED_SERVICES = new Set(["scheduler"]);

export default function StepAnalysis({ state, analysis, analysisLoading, analysisError, onChange }: {
  state: WizardState;
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string;
  onChange: (modes: Record<string, "vps" | "managed">) => void;
}) {
  if (analysisLoading) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <Spinner />
        <p className="text-sm text-text-muted">Analyzing repository…</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center py-8 gap-3 text-center">
        <WarningIcon className="w-10 h-10 text-warning-500" />
        {analysisError ? (
          <p className="text-sm text-danger-500">{analysisError}</p>
        ) : (
          <p className="text-sm text-text-muted">Could not analyze the repository.</p>
        )}
        <p className="text-xs text-text-muted">Click Next to continue — your app will be deployed as a standalone container.</p>
      </div>
    );
  }

  const providerName = PROVIDER_META[state.selectedProvider]?.name || state.selectedProvider;
  const getManagedInfo = (type: string) =>
    MANAGED_INFO[providerName]?.[type] || FALLBACK_MANAGED[type] || { service: "Managed Service", cost: "varies" };

  // Separate provisionable services from auto-configured ones
  const provisionableServices = analysis.detectedServices.filter(
    (svc) => !AUTO_CONFIGURED_SERVICES.has(svc.type)
  );
  const autoConfiguredServices = analysis.detectedServices.filter(
    (svc) => AUTO_CONFIGURED_SERVICES.has(svc.type)
  );

  // Build deployment requirements from aiAnalysis flags + auto-configured services
  const deployRequirements: Array<{ icon: string; label: string }> = [];
  const isLaravel = analysis.techStack.some(t => t.name.toLowerCase() === "laravel");

  if (analysis.aiAnalysis?.needsScheduler || autoConfiguredServices.some(s => s.type === "scheduler")) {
    deployRequirements.push({
      icon: "⏱️",
      label: isLaravel
        ? "Task Scheduler detected — a cron entry will be configured on the instance"
        : "Task Scheduler detected — manual configuration may be required after deployment",
    });
  }
  if (analysis.aiAnalysis?.needsQueueWorker) {
    deployRequirements.push({
      icon: "📨",
      label: isLaravel
        ? "Queue Worker detected — a background worker process will be configured"
        : "Queue Worker detected — manual configuration may be required after deployment",
    });
  }
  if (analysis.aiAnalysis?.needsWebsockets) {
    deployRequirements.push({ icon: "🔌", label: "WebSockets detected — a WebSocket server will be configured" });
  }

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      {analysis.aiAnalysis?.summary && (
        <div className="flex items-start gap-2 p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-base mt-0.5">✨</span>
          <div className="text-xs text-text-secondary">
            <span className="font-semibold">AI Analysis:</span> {analysis.aiAnalysis.summary}
            {analysis.aiAnalysis.runtime && (
              <span className="ml-1 text-text-muted">
                ({analysis.aiAnalysis.runtime} {analysis.aiAnalysis.runtimeVersion}
                {analysis.aiAnalysis.framework ? ` / ${analysis.aiAnalysis.framework} ${analysis.aiAnalysis.frameworkVersion}` : ""})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tech Stack */}
      {analysis.techStack.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Detected Tech Stack</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.techStack.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-secondary-100 text-text-secondary rounded text-xs font-medium">
                {t.name}
                <span className="ml-1 text-text-muted">({t.category})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Detected Services (provisionable only) */}
      {provisionableServices.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Infrastructure Components
          </p>
          <p className="text-xs text-text-muted mb-3">
            Choose between self-hosted (on the same server, no extra cost) or managed services (separate, provider-managed).
          </p>
          <div className="space-y-2">
            {provisionableServices.map((svc) => {
              const managed = getManagedInfo(svc.type);
              const isManaged = state.servicesModes[svc.type] === "managed";
              return (
                <div key={svc.type} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text">{svc.name}</span>
                      <span className="text-xs text-text-muted">({svc.type})</span>
                      {svc.confidence >= 0.8 && (
                        <span className="px-1 py-0.5 bg-success-50 text-success-500 rounded text-[10px] font-medium">high confidence</span>
                      )}
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-border shrink-0 ml-3">
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "vps" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${!isManaged ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        Self-hosted
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "managed" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${isManaged ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        Managed
                      </button>
                    </div>
                  </div>
                  {isManaged && (
                    <div className="mt-2 flex items-center gap-3 pl-0.5">
                      <span className="text-xs text-primary-600 font-medium">{managed.service}</span>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs font-semibold text-warning-500">{managed.cost}</span>
                    </div>
                  )}
                  {!isManaged && (
                    <div className="mt-1.5 pl-0.5">
                      <span className="text-xs text-text-muted">Installed on the same instance — no extra cost</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {provisionableServices.length === 0 && deployRequirements.length === 0 && (
        <div className="rounded-lg bg-secondary-50 p-4 text-center">
          <p className="text-sm text-text-muted">No additional services detected. Your app will be deployed as a standalone container.</p>
        </div>
      )}

      {/* Deployment Requirements — auto-configured items */}
      {deployRequirements.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Deployment Requirements
          </p>
          <p className="text-xs text-text-muted mb-3">
            These will be automatically configured on your instance during deployment.
          </p>
          <div className="space-y-1.5">
            {deployRequirements.map((req, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 border border-border">
                <span className="text-sm">{req.icon}</span>
                <span className="text-xs text-text-secondary">{req.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
