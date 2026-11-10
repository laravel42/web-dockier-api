import { useEffect, useState } from "react";
import { codeAnalysisApi } from "@/services/api";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import TechBadge from "@/components/TechBadge";
import PageLoading from "@/components/ui/PageLoading";
import Button from "@/components/ui/Button";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import RulesFilterSidebar from "./RulesFilterSidebar";
import { severityDotCls } from "./shared";
import { useRuleOverrides } from "./useRuleOverrides";

type OpengrepRule = Awaited<ReturnType<typeof codeAnalysisApi.listOpengrepRules>>["rules"][number];

const PAGE = 30;

/** Turns built-in Semgrep rules off for this organization only (rule overrides). */
export default function SemgrepRulesPanel({ filter, onChanged }: { filter: string; onChanged: () => void }) {
  const [rules, setRules] = useState<OpengrepRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState("");
  const [langs, setLangs] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE);
  const toast = useToast();
  const { disabled, toggle } = useRuleOverrides("semgrep", onChanged);

  useEffect(() => {
    codeAnalysisApi
      .listOpengrepRules()
      .then((res) => setRules(res.rules))
      .catch((err: unknown) => toast.error(getErrorMessage(err, "Failed to load Semgrep rules")))
      .finally(() => setLoading(false));
    // Mount-only: toast is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = filter.toLowerCase();
  const matches = rules
    .filter((r) => !q || r.id.toLowerCase().includes(q) || r.message.toLowerCase().includes(q))
    .filter((r) => langs.size === 0 || langs.has(r.lang))
    .filter((r) => !sevFilter || r.severity === sevFilter);
  const count = (pred: (r: OpengrepRule) => boolean) => rules.filter(pred).length;
  const resetPage = () => setVisible(PAGE);

  if (loading) return <PageLoading />;

  return (
    <div className="flex gap-4">
      <RulesFilterSidebar
        severities={[
          { key: "error", label: "Error", count: count((r) => r.severity === "error"), color: "text-danger-500" },
          { key: "warning", label: "Warning", count: count((r) => r.severity === "warning"), color: "text-warning-500" },
          { key: "info", label: "Info", count: count((r) => r.severity === "info"), color: "text-primary-500" },
        ]}
        activeSeverity={sevFilter}
        onSeverityChange={(k) => { setSevFilter(k); resetPage(); }}
        languages={[...new Set(rules.map((r) => r.lang))].sort().map((l) => ({
          key: l, icon: l, label: l.charAt(0).toUpperCase() + l.slice(1), count: count((r) => r.lang === l),
        }))}
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
            const enabled = !disabled.has(r.id);
            return (
              <div key={r.id} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${enabled ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full shrink-0 ${severityDotCls(r.severity)}`} />
                  <span className="text-xs font-mono text-text-muted truncate flex-1">{r.id}</span>
                  <ToggleSwitch checked={enabled} onChange={() => toggle(r.id)} ariaLabel={r.id} />
                </div>
                <p className="text-sm/relaxed text-text">{r.name}</p>
                {r.message && <p className="text-xs/relaxed text-text-muted bg-secondary-500/10 px-2 py-1 rounded line-clamp-2">{r.message}</p>}
                <div><TechBadge name={r.lang} icon={r.lang} label={r.lang} /></div>
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
