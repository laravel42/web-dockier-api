import { useState, useEffect } from "react";
import { codeAnalysisApi } from "../../../services/api";
import TechBadge from "../../../components/TechBadge";
import PageLoading from "../../../components/ui/PageLoading";
import Button from "../../../components/ui/Button";
import Spinner from "../../../components/Spinner";
import { ChevronDownIcon } from "lucide-react";
import ToggleSwitch from "../../../components/ui/ToggleSwitch";
import RulesFilterSidebar from "./RulesFilterSidebar";
import { severityDotCls } from "./shared";

// SonarQube rules cache (persists across tab switches within the session)
type SQRuleItem = {
  key: string;
  name: string;
  severity: string;
  lang: string;
  type: string;
  isActive: boolean;
  cleanCodeAttribute: string;
  impacts: Array<{ softwareQuality: string; severity: string }>;
  profileKey: string;
};

let _sqCache: {
  profiles: Array<{ key: string; name: string; language: string; languageName: string; isDefault: boolean; activeRuleCount: number }>;
  rules: SQRuleItem[];
} | null = null;

export default function SonarQubeRulesPanel() {
  const [profiles, setProfiles] = useState(() => _sqCache?.profiles ?? []);
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [allRules, setAllRules] = useState(() => _sqCache?.rules ?? []);
  const [loading, setLoading] = useState(!_sqCache);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [error, setError] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [sqVisible, setSqVisible] = useState(30);
  const [disabledSqRules, setDisabledSqRules] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load disabled rules from DB
    codeAnalysisApi.listRuleOverrides("sonarqube").then(res => {
      setDisabledSqRules(new Set(res.overrides.filter(o => !o.enabled).map(o => o.ruleId)));
    }).catch(() => { /* ignore */ });

    if (_sqCache) return;
    codeAnalysisApi.listSonarProfiles()
      .then(async (res) => {
        setProfiles(res.profiles);
        setRulesLoading(true);
        const merged: typeof allRules = [];
        const seen = new Set<string>();
        for (const p of res.profiles) {
          try {
            const data = await codeAnalysisApi.listSonarRules(p.key, 1);
            for (const r of data.rules) {
              if (!seen.has(r.key)) {
                seen.add(r.key);
                merged.push({ ...r, profileKey: p.key });
              }
            }
          } catch { /* skip profile on error */ }
        }
        setAllRules(merged);
        _sqCache = { profiles: res.profiles, rules: merged };
        setRulesLoading(false);
      })
      .catch(e => setError(e.message || "Failed to connect to SonarQube"))
      .finally(() => setLoading(false));
  }, []);

  const rules = allRules.filter(r => selectedLangs.size === 0 || selectedLangs.has(r.lang) || (selectedLangs.has("py") && r.lang === "ipynb"));

  const handleToggle = async (ruleKey: string) => {
    const nowEnabled = disabledSqRules.has(ruleKey);
    setDisabledSqRules(prev => {
      const n = new Set(prev);
      if (nowEnabled) n.delete(ruleKey); else n.add(ruleKey);
      return n;
    });
    try {
      await codeAnalysisApi.toggleRule("sonarqube", ruleKey, nowEnabled);
    } catch (e: unknown) {
      // Revert on failure
      setDisabledSqRules(prev => {
        const n = new Set(prev);
        if (nowEnabled) n.add(ruleKey); else n.delete(ruleKey);
        return n;
      });
      setError((e as Error).message || "Failed to toggle rule");
      setTimeout(() => setError(""), 3000);
    }
  };

  if (loading) return <PageLoading />;
  if (error && profiles.length === 0) return <div className="bg-card rounded-xl border border-border p-6 text-center"><p className="text-sm text-danger-500">{error}</p><p className="text-xs text-text-muted mt-2">Check that SonarQubeUrl and SonarQubeToken secrets are configured correctly.</p></div>;

  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-lg bg-danger-500/10 text-danger-500 text-sm">{error}</div>}

      <div className="flex gap-4">
        <RulesFilterSidebar
          severities={[
            { key: "BLOCKER", label: "Blocker", count: rules.filter(r => r.severity === "BLOCKER").length, color: "text-red-500", icon: "🔴" },
            { key: "CRITICAL", label: "High", count: rules.filter(r => r.severity === "CRITICAL").length, color: "text-orange-500", icon: "🟠" },
            { key: "MAJOR", label: "Medium", count: rules.filter(r => r.severity === "MAJOR").length, color: "text-yellow-500", icon: "🟡" },
            { key: "MINOR", label: "Low", count: rules.filter(r => r.severity === "MINOR").length, color: "text-blue-500", icon: "🔵" },
            { key: "INFO", label: "Info", count: rules.filter(r => r.severity === "INFO").length, color: "text-slate-400", icon: "⚪" },
          ]}
          activeSeverity={sevFilter}
          onSeverityChange={(k) => { setSevFilter(k); setSqVisible(30); }}
          languages={profiles.filter(p => p.language !== "ipynb").map(p => {
            const langIcon: Record<string, string> = { java: "java", js: "javascript", ts: "typescript", py: "python", python: "python", php: "php", go: "go", ruby: "ruby", cs: "csharp", kotlin: "kotlin", swift: "swift", scala: "scala", web: "html5", css: "css3", xml: "xml", docker: "docker", dockerfile: "docker", terraform: "terraform", azureresourcemanager: "azureresourcemanager", azuresqldatabase: "azure" };
            const langRename: Record<string, string> = { "Azure Resource Manager": "Azure" };
            const count = allRules.filter(r => r.lang === p.language || (p.language === "py" && r.lang === "ipynb")).length;
            return { key: p.language, icon: langIcon[p.language] || p.language, label: langRename[p.languageName] || p.languageName, count };
          })}
          activeLangs={selectedLangs}
          onLangToggle={(k) => { setSelectedLangs(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; }); setSqVisible(30); }}
          onLangClear={() => { setSelectedLangs(new Set()); setSqVisible(30); }}
        />

        <div className="flex-1 min-w-0">
          {rulesLoading ? (
            <div className="flex justify-center py-12"><Spinner className="size-5" /></div>
          ) : (() => {
            const sqFiltered = rules.filter(r => (!sevFilter || r.severity === sevFilter));
            const sqShown = sqFiltered.slice(0, sqVisible);
            return (<>
              <div className="grid grid-cols-2 gap-2">
                {sqShown.map(r => {
                  const langExts: Record<string, Array<{ ext: string; icon: string }>> = {
                    java: [{ ext: ".java", icon: "java" }],
                    js: [{ ext: ".js", icon: "javascript" }, { ext: ".jsx", icon: "react" }],
                    ts: [{ ext: ".ts", icon: "typescript" }, { ext: ".tsx", icon: "react" }],
                    py: [{ ext: ".py", icon: "python" }],
                    php: [{ ext: ".php", icon: "php" }],
                    go: [{ ext: ".go", icon: "go" }],
                    ruby: [{ ext: ".rb", icon: "ruby" }],
                    cs: [{ ext: ".cs", icon: "csharp" }],
                    kotlin: [{ ext: ".kt", icon: "kotlin" }],
                    swift: [{ ext: ".swift", icon: "swift" }],
                    scala: [{ ext: ".scala", icon: "scala" }],
                    web: [{ ext: ".html", icon: "html5" }, { ext: ".css", icon: "css3" }],
                    css: [{ ext: ".css", icon: "css3" }],
                    xml: [{ ext: ".xml", icon: "xml" }],
                  };
                  const exts = langExts[r.lang] || [{ ext: `.${r.lang}`, icon: r.lang }];
                  const langRename: Record<string, string> = { azureresourcemanager: "Azure", ipynb: "Python", web: "HTML/CSS" };
                  const techLabel = langRename[r.lang] || r.lang;
                  return (
                    <div key={r.key} className={`bg-card border border-border rounded-lg p-3 flex flex-col gap-2 transition-all ${disabledSqRules.has(r.key) ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className={`size-2.5 rounded-full shrink-0 ${severityDotCls(r.severity)}`} />
                        <span className="text-xs font-mono text-text-muted truncate flex-1">{r.key}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {exts.slice(0, 1).map(e => (
                            <TechBadge key={e.ext} name={e.ext} icon={e.icon} label={techLabel} />
                          ))}
                        </div>
                        <ToggleSwitch checked={!disabledSqRules.has(r.key)} onChange={() => handleToggle(r.key)} />
                      </div>
                      <p className="text-sm/relaxed text-text">{r.name}</p>
                      {/* Impacts */}
                      <div className="flex flex-wrap gap-1.5">
                        {r.impacts.map(i => {
                          const sevColors: Record<string, { statusBg: string; icon: string; iconBg: string; labelBg: string; labelText: string }> = {
                            BLOCKER: { statusBg: "bg-red-100", icon: "text-red-600", iconBg: "bg-red-500", labelBg: "bg-red-50", labelText: "text-red-700" },
                            HIGH: { statusBg: "bg-red-100", icon: "text-red-600", iconBg: "bg-red-500", labelBg: "bg-red-50", labelText: "text-red-700" },
                            MEDIUM: { statusBg: "bg-amber-100", icon: "text-amber-600", iconBg: "bg-amber-500", labelBg: "bg-amber-50", labelText: "text-amber-700" },
                            LOW: { statusBg: "bg-emerald-100", icon: "text-emerald-600", iconBg: "bg-emerald-500", labelBg: "bg-emerald-50", labelText: "text-emerald-700" },
                            INFO: { statusBg: "bg-sky-100", icon: "text-sky-600", iconBg: "bg-sky-500", labelBg: "bg-sky-50", labelText: "text-sky-700" },
                          };
                          const s = sevColors[i.severity] || { statusBg: "bg-secondary-100", icon: "text-text-muted", iconBg: "bg-secondary-400", labelBg: "bg-secondary-50", labelText: "text-text" };
                          const isUp = i.severity === "HIGH" || i.severity === "MEDIUM" || i.severity === "BLOCKER";
                          return (
                            <span key={i.softwareQuality} className="inline-flex items-center rounded-lg text-xs overflow-hidden">
                              <span className={`font-medium px-2.5 py-1 ${s.labelBg} ${s.labelText}`}>{i.softwareQuality.charAt(0) + i.softwareQuality.slice(1).toLowerCase()}</span>
                              <span className={`inline-flex items-center gap-1 font-semibold px-2 py-1 ${s.statusBg} ${s.icon}`}>
                                <span className={`size-4 rounded-full flex items-center justify-center ${s.iconBg}`}>
                                  {i.severity === "INFO" ? (
                                    <span className="text-[10px] font-bold text-white leading-none">i</span>
                                  ) : (
                                    <ChevronDownIcon className={`size-2.5 text-white stroke-3 ${isUp ? "rotate-180" : ""}`} />
                                  )}
                                </span>
                                {i.severity.charAt(0) + i.severity.slice(1).toLowerCase()}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {sqFiltered.length === 0 && <p className="text-text-muted text-center py-12 text-sm col-span-2">{sevFilter || selectedLangs.size ? "No rules match your filters" : "No rules found"}</p>}
              </div>
              {sqVisible < sqFiltered.length && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" onClick={() => setSqVisible(v => v + 30)}>
                    Load more ({sqFiltered.length - sqVisible} remaining)
                  </Button>
                </div>
              )}
            </>);
          })()}
        </div>
      </div>
    </div>
  );
}
