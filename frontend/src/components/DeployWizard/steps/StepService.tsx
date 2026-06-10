import { useEffect } from "react";
import type { RepoAnalysis, WizardState } from "../types";
import { PROVIDER_META } from "../constants";
import { choiceCardIdleCls, choiceCardSelectedCls } from "../../../utils/styles";
import CheckCircleIcon from "../../icons/filled/CheckCircleIcon";

/** Templates that cannot use static hosting (they need a server runtime). */
const STATIC_INCOMPATIBLE_TEMPLATES = ["wordpress"];

function isStaticDeployIncompatible(analysis: RepoAnalysis | null | undefined, templateId?: string): boolean {
  if (templateId && STATIC_INCOMPATIBLE_TEMPLATES.includes(templateId)) return true;
  if (!analysis) return false;
  if (analysis.techStack?.some((t) => t.name.toLowerCase() === "laravel")) return true;
  if (analysis.aiAnalysis?.framework?.toLowerCase() === "laravel") return true;
  return false;
}

export default function StepService({ state, templateId, analysis, onChange }: {
  state: WizardState;
  templateId?: string;
  analysis: RepoAnalysis | null;
  onChange: (strategy: "vps" | "managed" | "static") => void;
}) {
  const meta = PROVIDER_META[state.selectedProvider];
  if (!meta) return <p className="text-sm text-text-muted">Select a provider first.</p>;

  const hideStatic = isStaticDeployIncompatible(analysis, templateId);
  const services = hideStatic ? meta.services.filter((svc) => svc.type !== "static") : meta.services;

  useEffect(() => {
    if (hideStatic && state.deployStrategy === "static") {
      onChange("vps");
    }
  }, [hideStatic, state.deployStrategy, onChange]);

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
        {services.map((svc) => {
          const selected = state.deployStrategy === svc.type;
          return (
            <button
              key={svc.type}
              type="button"
              onClick={() => onChange(svc.type)}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                selected ? choiceCardSelectedCls : choiceCardIdleCls
              }`}
            >
              <span className="text-2xl mt-0.5">{typeIcons[svc.type] || "📦"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${selected ? "text-foreground" : "text-text"}`}>{svc.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    svc.type === "managed"
                      ? selected ? "bg-primary/15 text-primary" : "bg-primary-50 text-primary-600"
                      : selected ? "bg-warning-500/15 text-warning-500" : "bg-warning-50 text-warning-500"
                  }`}>{svc.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{svc.description}</p>
              </div>
              {selected && (
                <CheckCircleIcon className="size-5 text-primary shrink-0 mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
