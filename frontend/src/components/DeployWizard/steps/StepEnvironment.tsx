import type { WizardState } from "../types";
import { PROVIDER_REGIONS } from "../constants";
import { getPlans } from "../plans";
import { CircleCheckIcon, FlaskConicalIcon, RocketIcon, ServerIcon, GlobeIcon } from "lucide-react";

/** Per-provider names for the static hosting stack, for accurate labelling. */
const STATIC_STACK: Record<string, string> = {
  aws: "S3 + CloudFront",
  gcp: "Cloud Storage + Cloud CDN",
};

export default function StepEnvironment({ state, templateId, onChange, onRegionChange, onStrategyChange }: {
  state: WizardState;
  templateId?: string;
  onChange: (env: "staging" | "production", plan: number) => void;
  onRegionChange: (region: string) => void;
  onStrategyChange: (strategy: "vps" | "static") => void;
}) {
  const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, templateId);
  const regions = PROVIDER_REGIONS[state.selectedProvider] || [];
  const isStatic = state.deployStrategy === "static";
  const staticStack = STATIC_STACK[state.selectedProvider] || "object storage + CDN";

  return (
    <div className="space-y-4">
      {/* Deploy target */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Deploy target</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onStrategyChange("vps")}
            aria-pressed={!isStatic}
            className={`flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
              !isStatic ? "border-primary-500 bg-primary/10 shadow-(--shadow-xs)" : "border-border bg-card hover:border-primary-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <ServerIcon className="size-4 text-text-secondary shrink-0" />
              <span className="text-sm font-semibold text-text">Server</span>
              {!isStatic && <CircleCheckIcon className="size-4 text-primary-500 ml-auto" />}
            </div>
            <p className="text-xs/relaxed text-text-muted">
              Runs your app on a virtual machine. Needed for a backend, server-side rendering, or a database.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onStrategyChange("static")}
            aria-pressed={isStatic}
            className={`flex flex-col gap-1.5 p-3 rounded-xl border-2 text-left transition-all ${
              isStatic ? "border-primary-500 bg-primary/10 shadow-(--shadow-xs)" : "border-border bg-card hover:border-primary-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <GlobeIcon className="size-4 text-text-secondary shrink-0" />
              <span className="text-sm font-semibold text-text">Static hosting</span>
              {isStatic && <CircleCheckIcon className="size-4 text-primary-500 ml-auto" />}
            </div>
            <p className="text-xs/relaxed text-text-muted">
              Uploads your built site to {staticStack}. No server to pay for, served from the edge. Only for sites
              that build to static files.
            </p>
          </button>
        </div>
        {isStatic && (
          <p className="mt-2 text-xs/relaxed text-text-muted">
            Your site is built from source and the output uploaded, so no instance size applies. Apps that need a
            server process (Laravel, Django, SSR Next/Nuxt/Astro) are rejected before anything is provisioned.
          </p>
        )}
      </div>

      {/* Environment toggle */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment</p>
        <div className="flex rounded-lg overflow-hidden border border-border w-fit">
          {(["staging", "production"] as const).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => {
                const newPlans = getPlans(state.selectedProvider, env, state.servicesModes, templateId);
                // Default to Standard plan (index 0 if Starter is filtered, index 1 otherwise)
                const standardIdx = newPlans.findIndex(p => p.tier === "balanced");
                onChange(env, standardIdx >= 0 ? standardIdx : 0);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                state.environment === env ? "bg-primary/30 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"
              }`}
            >
              {env === "staging"
                ? <span className="inline-flex items-center gap-1.5"><FlaskConicalIcon className="size-3.5" />Staging</span>
                : <span className="inline-flex items-center gap-1.5"><RocketIcon className="size-3.5" />Production</span>
              }
            </button>
          ))}
        </div>
      </div>

      {/* Region selector */}
      {regions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Region</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto scrollbar-hide">
            {regions.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRegionChange(r.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                  state.tofuRegion === r.id
                    ? "border-primary-500 bg-primary/10 text-text"
                    : "border-border bg-card text-text-secondary hover:border-primary-300"
                }`}
              >
                <span>{r.flag}</span>
                <div className="min-w-0">
                  <span className="font-medium block truncate">{r.name}</span>
                  <span className="text-text-muted text-xs">{r.id}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans — instance sizing only applies when a server is provisioned. */}
      {!isStatic && (
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Deployment Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {plans.map((plan, i) => {
            const selected = state.selectedPlan === i;
            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => onChange(state.environment, i)}
                className={`flex flex-col p-4 rounded-xl border-2 text-left transition-all ${
                  selected ? "border-primary-500 bg-primary/10 shadow-(--shadow-xs)" : "border-border bg-card hover:border-primary-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${plan.badgeColor}`}>{plan.badge}</span>
                  {selected && (
                    <CircleCheckIcon className="size-4  text-primary-500" />
                  )}
                </div>
                <p className="text-sm font-semibold text-text mb-2">{plan.label}</p>
                <div className="space-y-1 text-xs text-text-secondary flex-1">
                  <div className="flex justify-between"><span>CPU</span><span className="font-medium text-text">{plan.cpu}</span></div>
                  <div className="flex justify-between"><span>RAM</span><span className="font-medium text-text">{plan.ram}</span></div>
                  <div className="flex justify-between"><span>Storage</span><span className="font-medium text-text">{plan.storage}</span></div>
                  <div className="flex justify-between"><span>Network</span><span className="font-medium text-text">{plan.network}</span></div>
                </div>
                {plan.managedServices.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs text-text-muted uppercase mb-1">Managed Services</p>
                    {plan.managedServices.map((s, j) => (
                      <p key={j} className="text-xs text-primary-600">{s}</p>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-border">
                  <p className="text-lg font-bold text-primary-500">{plan.monthlyPrice}</p>
                  <p className="text-xs text-text-muted">estimated monthly</p>
                </div>
                {/* Breakdown tooltip */}
                <div className="mt-2 space-y-0.5">
                  {plan.breakdown.map((b, j) => (
                    <div key={j} className="flex justify-between text-xs text-text-muted">
                      <span>{b.item}</span><span>{b.cost}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
