import { useEffect, useState } from "react";
import { codeAnalysisApi } from "@/services/api";
import TechBadge from "@/components/TechBadge";
import PageLoading from "@/components/ui/PageLoading";
import Button from "@/components/ui/Button";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import RulesFilterSidebar from "./RulesFilterSidebar";
import { severityDotCls } from "./shared";
import { useRuleOverrides } from "./useRuleOverrides";

type SonarRule = Awaited<ReturnType<typeof codeAnalysisApi.listSonarRules>>["rules"][number];

const PAGE = 30;
const SEVERITIES = [
  { key: "BLOCKER", label: "Blocker", color: "text-danger-ink" },
  { key: "CRITICAL", label: "High", color: "text-caution-ink" },
  { key: "MAJOR", label: "Medium", color: "text-warning-ink" },
  { key: "MINOR", label: "Low", color: "text-info-ink" },
  { key: "INFO", label: "Info", color: "text-text-muted" },
];

/**
 * Turns SonarQube rules off for this organization only (rule overrides). Lists
 * the rules active in each language's default profile — the ones a scan runs.
 */
export default function SonarQubeRulesPanel({ filter, onChanged }: { filter: string; onChanged: () => void }) {
  const [rules, setRules] = useState<SonarRule[]>([]);
  const [languages, setLanguages] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [sevFilter, setSevFilter] = useState("");
  const [langs, setLangs] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE);
  const { disabled, toggle } = useRuleOverrides("sonarqube", onChanged);

  useEffect(() => {
    const load = async () => {
      try {
        const { profiles } = await codeAnalysisApi.listSonarProfiles();
        const defaults = profiles.filter((p) => p.isDefault);
        // shortcut: first page (500 rules) per profile; search reaches the rest only if a default profile grows past 500.
        const pages = await Promise.all(defaults.map((p) => codeAnalysisApi.listSonarRules(p.key, 1)));
        const seen = new Set<string>();
        setRules(pages.flatMap((p) => p.rules).filter((r) => !seen.has(r.key) && seen.add(r.key)));
        setLanguages(defaults.map((p) => ({ key: p.language, label: p.languageName })));
      } catch {
        setUnreachable(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <PageLoading />;
  if (unreachable) {
    return (
      <p className="text-sm text-text-muted text-center py-12">
        SonarQube could not be reached, so its rules cannot be listed right now. Try again later.
      </p>
    );
  }

  const q = filter.toLowerCase();
  const matches = rules
    .filter((r) => !q || r.key.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
    .filter((r) => langs.size === 0 || langs.has(r.lang))
    .filter((r) => !sevFilter || r.severity === sevFilter);
  const resetPage = () => setVisible(PAGE);

  return (
    <div className="flex gap-4">
      <RulesFilterSidebar
        severities={SEVERITIES.map((s) => ({ ...s, count: rules.filter((r) => r.severity === s.key).length }))}
        activeSeverity={sevFilter}
        onSeverityChange={(k) => { setSevFilter(k); resetPage(); }}
        languages={languages.map((l) => ({ ...l, icon: l.key, count: rules.filter((r) => r.lang === l.key).length }))}
        activeLangs={langs}
        onLangToggle={(k) => {
          setLangs((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
          resetPage();
        }}
        onLangClear={() => { setLangs(new Set()); resetPage(); }}
      />
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-2 gap-2">
          {matches.slice(0, visible).map((r) => {
            const enabled = !disabled.has(r.key);
            return (
              <div key={r.key} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${enabled ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full shrink-0 ${severityDotCls(r.severity)}`} />
                  <span className="text-xs font-mono text-text-muted truncate flex-1">{r.key}</span>
                  <ToggleSwitch checked={enabled} onChange={() => toggle(r.key)} ariaLabel={r.key} />
                </div>
                <p className="text-sm/relaxed text-text">{r.name}</p>
                <div><TechBadge name={r.lang} icon={r.lang} label={r.langName || r.lang} /></div>
              </div>
            );
          })}
          {matches.length === 0 && (
            <p className="text-text-muted text-center py-12 text-sm col-span-2">
              {filter || langs.size || sevFilter ? "No rules match your filters" : "No rules found"}
            </p>
          )}
        </div>
        {visible < matches.length && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
              Load more ({matches.length - visible} remaining)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
