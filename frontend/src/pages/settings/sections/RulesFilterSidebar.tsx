import { useState } from "react";
import TechBadge from "@/components/TechBadge";
import { ChevronDownIcon } from "lucide-react";

export interface SeverityItem {
  key: string;
  label: string;
  count: number;
  color: string;
  icon?: string;
}

export interface LanguageItem {
  key: string;
  icon: string;
  label: string;
  count?: number;
}

interface RulesFilterSidebarProps {
  severities: SeverityItem[];
  activeSeverity: string;
  onSeverityChange: (key: string) => void;
  languages: LanguageItem[];
  activeLangs: Set<string>;
  onLangToggle: (key: string) => void;
  onLangClear: () => void;
}

export default function RulesFilterSidebar({
  severities,
  activeSeverity,
  onSeverityChange,
  languages,
  activeLangs,
  onLangToggle,
  onLangClear,
}: RulesFilterSidebarProps) {
  const [sevOpen, setSevOpen] = useState(true);
  const [techOpen, setTechOpen] = useState(true);

  const chevron = (open: boolean) => (
    <ChevronDownIcon className={`size-3.5 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
  );

  return (
    <div className="w-52 shrink-0 space-y-1.5 self-start sticky top-6">
      {/* Severity */}
      <div className="rounded-lg overflow-hidden border border-border/50 bg-card/40">
        <button onClick={() => setSevOpen(!sevOpen)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-text hover:bg-card/60 transition-colors">
          Severity {chevron(sevOpen)}
        </button>
        {sevOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            {severities.map(s => (
              <button key={s.key} onClick={() => onSeverityChange(activeSeverity === s.key ? "" : s.key)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${activeSeverity === s.key ? "bg-primary-500 text-primary-foreground font-medium" : "text-text-muted hover:bg-card/60"}`}>
                <span className="flex items-center gap-2">{s.icon && <span className="text-[10px]">{s.icon}</span>}{s.label}</span>
                <span className={`text-xs ${activeSeverity === s.key ? "text-white/70" : s.color}`}>{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Technology */}
      <div className="rounded-lg overflow-hidden border border-border/50 bg-card/40">
        <button onClick={() => setTechOpen(!techOpen)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-text hover:bg-card/60 transition-colors">
          Technology {chevron(techOpen)}
        </button>
        {techOpen && (
          <div className="px-2 pb-2 space-y-0.5">
            {languages.map(l => {
              const active = activeLangs.has(l.key);
              return (
                <button key={l.key} type="button" onClick={() => onLangToggle(l.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${active ? "bg-primary-500/15 text-primary-300 font-medium" : "text-text-muted hover:bg-card/60"}`}>
                  <TechBadge name={l.key} icon={l.icon} iconOnly iconSize="w-5 h-5" />
                  <span className="text-sm truncate flex-1 text-left">{l.label}</span>
                  {l.count !== undefined && <span className="text-xs font-semibold">{l.count}</span>}
                </button>
              );
            })}
            {activeLangs.size > 0 && (
              <button type="button" onClick={onLangClear} className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:text-text transition-colors">Clear all</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
