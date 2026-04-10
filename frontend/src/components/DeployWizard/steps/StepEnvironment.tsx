import type { WizardState } from "../types";
import { PROVIDER_REGIONS } from "../constants";
import { getPlans } from "../plans";
import CheckCircleIcon from "../../icons/filled/CheckCircleIcon";

export default function StepEnvironment({ state, onChange, onRegionChange }: {
  state: WizardState;
  onChange: (env: "staging" | "production", plan: number) => void;
  onRegionChange: (region: string) => void;
}) {
  const plans = getPlans(state.selectedProvider, state.environment, state.servicesModes, state.deployStrategy);
  const regions = PROVIDER_REGIONS[state.selectedProvider] || [];

  return (
    <div className="space-y-4">
      {/* Environment toggle */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Environment</p>
        <div className="flex rounded-lg overflow-hidden border border-border w-fit">
          {(["staging", "production"] as const).map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => onChange(env, state.selectedPlan)}
              className={`px-4 py-2 text-sm font-medium transition-colors capitalize ${
                state.environment === env ? "bg-primary-500 text-white" : "bg-card text-text-secondary hover:bg-secondary-50"
              }`}
            >
              {env === "staging" ? "🧪 Staging" : "🚀 Production"}
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
                    ? "border-primary-500 bg-primary-50 text-text"
                    : "border-border bg-card text-text-secondary hover:border-primary-300"
                }`}
              >
                <span>{r.flag}</span>
                <div className="min-w-0">
                  <span className="font-medium block truncate">{r.name}</span>
                  <span className="text-text-muted text-[10px]">{r.id}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans */}
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
                  selected ? "border-primary-500 bg-primary-50 shadow-sm" : "border-border bg-card hover:border-primary-300"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${plan.badgeColor}`}>{plan.badge}</span>
                  {selected && (
                    <CheckCircleIcon className="w-4 h-4 text-primary-500" />
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
                    <p className="text-[10px] text-text-muted uppercase mb-1">Managed Services</p>
                    {plan.managedServices.map((s, j) => (
                      <p key={j} className="text-xs text-primary-600">{s}</p>
                    ))}
                  </div>
                )}
                <div className="mt-3 pt-2 border-t border-border">
                  <p className="text-lg font-bold text-primary-500">{plan.monthlyPrice}</p>
                  <p className="text-[10px] text-text-muted">estimated monthly</p>
                </div>
                {/* Breakdown tooltip */}
                <div className="mt-2 space-y-0.5">
                  {plan.breakdown.map((b, j) => (
                    <div key={j} className="flex justify-between text-[10px] text-text-muted">
                      <span>{b.item}</span><span>{b.cost}</span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
