import { useEffect } from "react";
import type { RepoAnalysis, WizardState } from "../types";
import { PROVIDER_META } from "../constants";
import { choiceCardIdleCls, choiceCardSelectedCls } from "@/utils/styles";
import { CircleCheckIcon, MonitorIcon, CloudIcon, PackageIcon } from "lucide-react";

/** Templates that cannot use static hosting (they need a server runtime). */
const STATIC_INCOMPATIBLE_TEMPLATES = ["wordpress"];

function isStaticDeployIncompatible(analysis: RepoAnalysis | null | undefined, templateId?: string): boolean {
  if (templateId && STATIC_INCOMPATIBLE_TEMPLATES.includes(templateId)) return true;
  if (!analysis) return false;
  if (analysis.techStack?.some((t) => t.name.toLowerCase() === "laravel")) return true;
  if (analysis.aiAnalysis?.framework?.toLowerCase() === "laravel") return true;
  if (analysis.techStack?.some((t) => t.name.toLowerCase().includes("payload"))) return true;
  if (analysis.dependencies?.some((d) => d.name.toLowerCase().includes("payload"))) return true;
  const framework = analysis.aiAnalysis?.framework?.toLowerCase() ?? "";
  const stackNames = (analysis.techStack ?? []).map((t) => t.name.toLowerCase());
  const isNext = framework.includes("next") || stackNames.some((t) => t.includes("next"));
  const hasPayload =
    stackNames.some((t) => t.includes("payload")) ||
    (analysis.dependencies ?? []).some((d) => d.name.toLowerCase().includes("payload"));
  if (isNext && hasPayload) return true;
  return false;
}

export default function StepService({ state, templateId, analysis, onChange }: {
  state: WizardState;
  templateId?: string;
  analysis: RepoAnalysis | null;
  onChange: (strategy: "vps" | "managed" | "static") => void;
}) {
  const meta = PROVIDER_META[state.selectedProvider];
  const hideStatic = meta ? isStaticDeployIncompatible(analysis, templateId) : false;

  useEffect(() => {
    if (!meta) return;
    if (hideStatic && state.deployStrategy === "static") {
      onChange("vps");
    }
  }, [meta, hideStatic, state.deployStrategy, onChange]);

  if (!meta) return <p className="text-sm text-text-muted">Select a provider first.</p>;

  const services = hideStatic ? meta.services.filter((svc) => svc.type !== "static") : meta.services;

  const typeIcons: Record<string, typeof MonitorIcon> = {
    vps: MonitorIcon,
    managed: CloudIcon,
  };

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Choose how you want to deploy on {meta.name}. Each option has different trade-offs for control, cost, and complexity.
      </p>
      <div className="space-y-2">
        {services.map((svc) => {
          const selected = state.deployStrategy === svc.type;
          const SvcIcon = typeIcons[svc.type] || PackageIcon;
          return (
            <button
              key={svc.type}
              type="button"
              onClick={() => onChange(svc.type)}
              className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                selected ? choiceCardSelectedCls : choiceCardIdleCls
              }`}
            >
              <SvcIcon className="size-6 mt-0.5 shrink-0 text-text-muted" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${selected ? "text-foreground" : "text-text"}`}>{svc.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold uppercase ${
                    svc.type === "managed"
                      ? selected ? "bg-primary/15 text-primary" : "bg-primary-50 text-primary-600"
                      : selected ? "bg-warning-500/15 text-warning-500" : "bg-warning-50 text-warning-500"
                  }`}>{svc.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{svc.description}</p>
              </div>
              {selected && (
                <CircleCheckIcon className="size-5 text-primary shrink-0 mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
