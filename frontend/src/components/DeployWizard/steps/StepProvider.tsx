import type { WizardState, Provider } from "../types";
import { PROVIDER_META } from "../constants";
import CheckCircleIcon from "../../icons/filled/CheckCircleIcon";

export default function StepProvider({ state, providers, onChange }: {
  state: WizardState;
  providers: Provider[];
  onChange: (provider: string, providerId: string) => void;
}) {
  const configuredSlugs = new Set(providers.map(p => p.provider));
  const allProviders = Object.entries(PROVIDER_META);

  // Group configured providers by type
  const providersByType = (slug: string) => providers.filter(p => p.provider === slug);

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">Choose your cloud provider. Providers you've configured are highlighted.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {allProviders.map(([slug, meta]) => {
          const configured = configuredSlugs.has(slug);
          const selected = state.selectedProvider === slug;
          const matching = providersByType(slug);
          return (
            <button
              key={slug}
              type="button"
              disabled={!configured}
              onClick={() => {
                if (matching.length === 1) {
                  onChange(slug, matching[0].id);
                } else if (matching.length > 1) {
                  // Select the provider type; if no account is picked yet, default to the first
                  if (state.selectedProvider !== slug) {
                    onChange(slug, matching[0].id);
                  }
                }
              }}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                selected
                  ? "border-primary-500 bg-primary-50 shadow-sm"
                  : configured
                    ? "border-border bg-card hover:border-primary-300 hover:bg-secondary-50 cursor-pointer"
                    : "border-border/50 bg-secondary-50/50 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg ${meta.color} flex items-center justify-center text-white text-xs font-bold`}>
                {meta.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-text">{meta.name}</span>
              {!configured && (
                <span className="text-[10px] text-text-muted">Not configured</span>
              )}
              {configured && matching.length === 1 && (
                <span className="text-[10px] text-primary-500 truncate max-w-full">{matching[0].label}</span>
              )}
              {configured && matching.length > 1 && (
                <span className="text-[10px] text-primary-500">{matching.length} accounts</span>
              )}
              {selected && (
                <div className="absolute top-1.5 right-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-primary-500" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Account selector — shown when the selected provider type has multiple accounts */}
      {state.selectedProvider && providersByType(state.selectedProvider).length > 1 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-text mb-1.5">Select account</label>
          <div className="flex flex-col gap-1.5">
            {providersByType(state.selectedProvider).map(p => {
              const isActive = state.selectedProviderId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(state.selectedProvider, p.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                    isActive
                      ? "border-primary-500 bg-primary-50"
                      : "border-border bg-card hover:border-primary-300 hover:bg-secondary-50"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isActive ? "bg-primary-500" : "bg-border"}`} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-text">{p.label}</span>
                    <span className="text-xs text-text-muted ml-2">({p.id.slice(0, 8)}…)</span>
                  </div>
                  {isActive && <CheckCircleIcon className="w-4 h-4 text-primary-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
