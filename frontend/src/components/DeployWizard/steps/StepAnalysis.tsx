import type { WizardState, RepoAnalysis } from "../types";
import Spinner from "@/components/Spinner";
import Alert from "@/components/ui/Alert";
import DockerfileIcon from "@/components/icons/filled/DockerfileIcon";
import { TriangleAlertIcon, ClockIcon, MailIcon, PlugIcon, SparklesIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { platformLabel } from "@/utils/platformLabel";

/** Service types that are auto-configured during deployment and should not appear as provisionable infrastructure components. */
const AUTO_CONFIGURED_SERVICES = new Set(["scheduler"]);

/** Generic display names for infrastructure service types (provider-agnostic). */
const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  database: "Database",
  cache: "Cache",
  queue: "Message Queue",
  storage: "Object Storage",
  mail: "Mail Service",
  search: "Search Engine",
  broadcasting: "WebSocket / Broadcasting",
};

/**
 * What the compose file means for this deploy, in one sentence.
 *
 * Says what WILL happen rather than inviting the user in unconditionally. A
 * stack whose public service cannot be reached deploys fine but gets no URL,
 * and promising "deploy the whole stack together" to someone who is about to
 * get no domain is the kind of half-truth that costs an afternoon.
 */
function composeSummary(compose: NonNullable<RepoAnalysis["compose"]>): string {
  const count = compose.services.filter((s) => !s.buildOnly).length;
  const services = `${count} ${count === 1 ? "service" : "services"}`;
  const ownDb = compose.declaresDatabase ? ", including its own database" : "";
  const routable = compose.services.some((s) => !s.buildOnly && s.routable);

  if (!routable) {
    return (
      `It declares ${services}${ownDb}. You can deploy it with "Docker Compose" in the next step, ` +
      `but nothing can be routed to it yet, so it will run without a public URL.`
    );
  }

  const entry = compose.entryService
    ? ` The domain would route to "${compose.entryService}"${compose.entryPort ? ` on port ${compose.entryPort}` : ""}.`
    : " You will choose which service gets the domain.";

  return `It declares ${services}${ownDb}. Choose "Docker Compose" in the next step to deploy the whole stack together.${entry}`;
}

export default function StepAnalysis({ state, analysis, analysisLoading, analysisError, detectionHints, onChange, onDockerfileChoice }: {
  state: WizardState;
  analysis: RepoAnalysis | null;
  analysisLoading?: boolean;
  analysisError?: string;
  detectionHints?: Record<string, string>;
  onChange: (modes: Record<string, "vps" | "external">) => void;
  /** Build from the repo's own Dockerfile (true) or let the platform build the image (false). */
  onDockerfileChoice: (useRepoDockerfile: boolean) => void;
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
        <TriangleAlertIcon className="size-10  text-warning-500" />
        {analysisError ? (
          <p className="text-sm text-danger-500">{analysisError}</p>
        ) : (
          <p className="text-sm text-text-muted">Could not analyze the repository.</p>
        )}
        <p className="text-xs text-text-muted">Click Next to continue — your app will be deployed as a standalone container.</p>
      </div>
    );
  }

  // Separate provisionable services from auto-configured ones
  const provisionableServices = analysis.detectedServices.filter(
    (svc) => !AUTO_CONFIGURED_SERVICES.has(svc.type)
  );
  const autoConfiguredServices = analysis.detectedServices.filter(
    (svc) => AUTO_CONFIGURED_SERVICES.has(svc.type)
  );

  // A compose file this repo could actually be deployed from. Several
  // statements on this page are only true of a single-container deploy, so they
  // are qualified when this is set.
  const deployableCompose = analysis.compose && analysis.compose.problems.length === 0
    ? analysis.compose
    : null;

  // Build deployment requirements from aiAnalysis flags + auto-configured services
  const deployRequirements: Array<{ icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }> = [];
  const isLaravel = analysis.techStack.some(t => t.name.toLowerCase() === "laravel");

  if (analysis.aiAnalysis?.needsScheduler || autoConfiguredServices.some(s => s.type === "scheduler")) {
    deployRequirements.push({
      icon: ClockIcon,
      label: isLaravel
        ? "Task Scheduler detected — a cron entry will be configured on the instance"
        : "Task Scheduler detected — manual configuration may be required after deployment",
    });
  }
  if (analysis.aiAnalysis?.needsQueueWorker) {
    deployRequirements.push({
      icon: MailIcon,
      label: isLaravel
        ? "Queue Worker detected — a background worker process will be configured"
        : "Queue Worker detected — manual configuration may be required after deployment",
    });
  }
  if (analysis.aiAnalysis?.needsWebsockets) {
    deployRequirements.push({ icon: PlugIcon, label: "WebSockets detected — a WebSocket server will be configured" });
  }

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      {analysis.aiAnalysis?.summary && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary-200 rounded-lg">
          <SparklesIcon className="size-4 shrink-0 text-primary-500" />
          <div className="text-xs text-text-secondary">
            <span className="font-semibold">AI Analysis:</span> {analysis.aiAnalysis.summary}
            {analysis.aiAnalysis.runtime && (
              <span className="ml-1 text-text-muted">
                ({platformLabel(analysis.aiAnalysis.runtime)} {analysis.aiAnalysis.runtimeVersion}
                {analysis.aiAnalysis.framework ? ` / ${platformLabel(analysis.aiAnalysis.framework)} ${analysis.aiAnalysis.frameworkVersion}` : ""})
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

      {/* A compose file is actionable, so it replaces the multi-service warning
          below rather than appearing beside it: telling the user their services
          "won't be deployed" is simply wrong once Docker Compose is on offer. */}
      {analysis.compose && (
        analysis.compose.problems.length > 0 ? (
          <Alert variant="warning">
            <span className="font-semibold">
              The Docker Compose file in this repository cannot be deployed as-is.
            </span>{" "}
            {analysis.compose.problems.join(" ")}{" "}
            Fix the compose file and re-run the analysis, or deploy a single service instead.
          </Alert>
        ) : (
          <Alert variant={analysis.compose.warnings.length > 0 ? "warning" : "info"}>
            <span className="font-semibold">
              Docker Compose file found ({analysis.compose.path}).
            </span>{" "}
            {composeSummary(analysis.compose)}
            {analysis.compose.warnings.length > 0 && ` ${analysis.compose.warnings.join(" ")}`}
          </Alert>
        )
      )}
      {analysis.multiService && !analysis.compose && (
        <Alert variant="warning">
          {`App manifests were found in ${analysis.multiService.serviceDirs.length} directories.`}{" "}
          Dockier builds and deploys a single service from the repository root, so the other
          services here won&apos;t be deployed. Create one Dockier project per service.
        </Alert>
      )}

      {analysis.hasDocker && (
        <div className="rounded-lg border border-border bg-secondary-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <DockerfileIcon className="size-4 text-primary-500 mt-0.5 shrink-0" />
              <div className="text-xs text-text-secondary">
                <span className="font-semibold text-text">
                  {deployableCompose ? "Dockerfile detected (single-service deploys only)." : "Dockerfile detected."}
                </span>{" "}
                {deployableCompose
                  ? "Choose how your image is built. A Docker Compose deploy ignores this — each service builds from its own build entry."
                  : "Choose how your image is built."}
              </div>
            </div>
            <div className="flex rounded-md overflow-hidden border border-border shrink-0">
              <button
                type="button"
                onClick={() => onDockerfileChoice(true)}
                aria-pressed={state.useRepoDockerfile}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${state.useRepoDockerfile ? "bg-primary-500 text-primary-foreground" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
              >
                Use my Dockerfile
              </button>
              <button
                type="button"
                onClick={() => onDockerfileChoice(false)}
                aria-pressed={!state.useRepoDockerfile}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${!state.useRepoDockerfile ? "bg-primary-500 text-primary-foreground" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
              >
                Build it for me
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {state.useRepoDockerfile
              ? "Your repository Dockerfile is built as-is. It must EXPOSE the port your app listens on."
              : "Your Dockerfile is ignored. The platform detects the stack and builds the image itself."}
          </p>
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
              const isExternal = state.servicesModes[svc.type] === "external";
              return (
                <div key={svc.type} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-text">{SERVICE_DISPLAY_NAMES[svc.type] || svc.name}</span>
                      <span className="text-xs text-text-muted">({svc.type})</span>
                      {svc.confidence >= 0.8 && (
                        <span className="px-1 py-0.5 bg-success-50 text-success-500 rounded text-xs font-medium">high confidence</span>
                      )}
                    </div>
                    <div className="flex rounded-md overflow-hidden border border-border shrink-0 ml-3">
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "vps" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${!isExternal ? "bg-primary-500 text-primary-foreground" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        Self-hosted
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange({ ...state.servicesModes, [svc.type]: "external" })}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${isExternal ? "bg-primary-500 text-primary-foreground" : "bg-card text-text-secondary hover:bg-secondary-50"}`}
                      >
                        External
                      </button>
                    </div>
                  </div>
                  {isExternal && (
                    <div className="mt-2 pl-0.5">
                      <span className="text-xs text-text-muted">External service — bring your own credentials via env vars, billed by your provider</span>
                    </div>
                  )}
                  {!isExternal && (
                    <div className="mt-1.5 pl-0.5">
                      <span className="text-xs text-text-muted">Installed on the same instance — no extra cost</span>
                    </div>
                  )}
                  {detectionHints?.[svc.type] && (
                    <div className="mt-1.5 pl-0.5">
                      <span className="text-xs text-text-secondary">{detectionHints[svc.type]}</span>
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
          <p className="text-sm text-text-muted">
            {/* "standalone container" is flatly untrue when the repo ships a
                compose file: that stack runs several containers and brings its
                own backing services, which is why nothing was detected to
                provision. Stating it unconditionally contradicted the compose
                message directly above it. */}
            {deployableCompose
              ? "No services need provisioning — the compose file above declares everything this stack runs."
              : "No additional services detected. Your app will be deployed as a standalone container."}
          </p>
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
            {deployRequirements.map((req, i) => {
              const ReqIcon = req.icon;
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 border border-border">
                  <ReqIcon className="size-4 shrink-0 text-text-muted" />
                  <span className="text-xs text-text-secondary">{req.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
