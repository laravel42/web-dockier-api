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

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">Choose your cloud provider. Providers you've configured are highlighted.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {allProviders.map(([slug, meta]) => {
          const configured = configuredSlugs.has(slug);
          const selected = state.selectedProvider === slug;
          const matchingProvider = providers.find(p => p.provider === slug);
          return (
            <button
              key={slug}
              type="button"
              disabled={!configured}
              onClick={() => {
                if (matchingProvider) onChange(slug, matchingProvider.id);
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
              {configured && matchingProvider && (
                <span className="text-[10px] text-primary-500 truncate max-w-full">{matchingProvider.label}</span>
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
    </div>
  );
}
