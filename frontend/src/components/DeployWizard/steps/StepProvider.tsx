import { Link } from "react-router-dom";
import type { WizardState, Provider } from "../types";
import { PROVIDER_META } from "../constants";
import { choiceCardIdleCls, choiceCardSelectedCls } from "@/utils/styles";
import { CircleCheckIcon } from "lucide-react";

export default function StepProvider({ state, providers, onChange }: {
  state: WizardState;
  providers: Provider[];
  onChange: (provider: string, providerId: string) => void;
}) {
  const configuredSlugs = [...new Set(providers.map((p) => p.provider))];
  const configuredProviders = configuredSlugs
    .map((slug) => [slug, PROVIDER_META[slug]] as const)
    .filter((entry): entry is [string, (typeof PROVIDER_META)[string]] => !!entry[1]);

  const providersByType = (slug: string) => providers.filter((p) => p.provider === slug);

  if (configuredProviders.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center">
        <p className="text-sm text-text-secondary mb-2">No cloud providers are configured yet.</p>
        <p className="text-xs text-muted-foreground mb-4">
          Add an AWS or GCP provider in Settings before deploying.
        </p>
        <Link
          to="/settings"
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Open Settings →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Choose your cloud provider
        {configuredProviders.length === 1 ? " (pre-selected)" : ""}.
      </p>
      <div className={`grid gap-2 ${configuredProviders.length === 1 ? "grid-cols-1 max-w-xs" : "grid-cols-2 sm:grid-cols-4"}`}>
        {configuredProviders.map(([slug, meta]) => {
          const selected = state.selectedProvider === slug;
          const matching = providersByType(slug);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => {
                if (matching.length === 1) {
                  onChange(slug, matching[0].id);
                } else if (matching.length > 1 && state.selectedProvider !== slug) {
                  onChange(slug, matching[0].id);
                }
              }}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                selected ? `${choiceCardSelectedCls} shadow-sm` : `${choiceCardIdleCls} cursor-pointer`
              }`}
            >
              <div className={`size-10 rounded-lg ${meta.color} flex items-center justify-center text-white text-xs font-bold`}>
                {meta.name.slice(0, 2).toUpperCase()}
              </div>
              <span className={`text-xs font-medium ${selected ? "text-foreground" : "text-text"}`}>{meta.name}</span>
              {matching.length === 1 && (
                <span className={`text-[10px] truncate max-w-full ${selected ? "text-primary" : "text-primary-500"}`}>
                  {matching[0].label}
                </span>
              )}
              {matching.length > 1 && (
                <span className={`text-[10px] ${selected ? "text-primary" : "text-primary-500"}`}>
                  {matching.length} accounts
                </span>
              )}
              {selected && (
                <div className="absolute top-1.5 right-1.5">
                  <CircleCheckIcon className="size-4 text-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {state.selectedProvider && providersByType(state.selectedProvider).length > 1 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-text mb-1.5">Select account</label>
          <div className="flex flex-col gap-1.5">
            {providersByType(state.selectedProvider).map((p) => {
              const isActive = state.selectedProviderId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange(state.selectedProvider, p.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                    isActive ? choiceCardSelectedCls : choiceCardIdleCls
                  }`}
                >
                  <div className={`size-2 rounded-full ${isActive ? "bg-primary-500" : "bg-border"}`} />
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-text"}`}>{p.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">({p.id.slice(0, 8)}…)</span>
                  </div>
                  {isActive && <CircleCheckIcon className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
