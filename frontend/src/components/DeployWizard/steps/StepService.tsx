import type { WizardState } from "../types";
import { PROVIDER_META } from "../constants";
import CheckCircleIcon from "../../icons/filled/CheckCircleIcon";

/** Templates that cannot use static hosting (they need a server runtime). */
const STATIC_INCOMPATIBLE_TEMPLATES = ["wordpress"];

export default function StepService({ state, templateId, onChange }: {
  state: WizardState;
  templateId?: string;
  onChange: (strategy: "vps" | "managed" | "static") => void;
}) {
  const meta = PROVIDER_META[state.selectedProvider];
  if (!meta) return <p className="text-sm text-text-muted">Select a provider first.</p>;

  const typeIcons: Record<string, string> = {
    vps: "🖥️",
    managed: "☁️",
  };

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Choose how you want to deploy on {meta.name}. Each option has different trade-offs for control, cost, and complexity.
      </p>
      <div className="space-y-2">
        {meta.services.map((svc) => {
          const selected = state.deployStrategy === svc.type;
          const disabled = svc.type === "static" && STATIC_INCOMPATIBLE_TEMPLATES.includes(templateId || "");
          return (
            <button
              key={svc.type}
              type="button"
              onClick={() => { if (!disabled) onChange(svc.type); }}
              disabled={disabled}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                disabled
                  ? "opacity-40 cursor-not-allowed border-border bg-card"
                  : selected
                    ? "border-primary-500 bg-primary-50"
                    : "border-border bg-card hover:border-primary-300"
              }`}
            >
              <span className="text-2xl mt-0.5">{typeIcons[svc.type] || "📦"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">{svc.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    svc.type === "managed" ? "bg-primary-50 text-primary-600" :
                    "bg-warning-50 text-warning-500"
                  }`}>{svc.label}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {svc.description}
                  {disabled && " — not available for this template"}
                </p>
              </div>
              {selected && !disabled && (
                <CheckCircleIcon className="size-5  text-primary-500 shrink-0 mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
