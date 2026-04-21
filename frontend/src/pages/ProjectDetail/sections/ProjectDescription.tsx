import { useState, useEffect, useMemo } from "react";
import type { RepoAnalysis, SensitiveField, Dependency } from "../../../components/DeployWizard";
import MDEditor from "@uiw/react-md-editor";
import { cardCls } from "../constants";
import SensitivityBadge, { getSensitivityStyle } from "../../../components/badges/SensitivityBadge";

interface Props {
  analysis: RepoAnalysis | null;
  analysisLoading: boolean;
  onRefresh?: () => void;
}

const SECTION_TABS = [
  { key: "overview",     label: "Overview" },
  { key: "howItWorks",   label: "How It Works" },
  { key: "techStack",    label: "Tech Stack" },
  { key: "architecture", label: "Architecture" },
  { key: "dataStorage",  label: "Data & Storage" },
  { key: "codeQuality",  label: "Code Quality" },
  { key: "security",     label: "Security" },
  { key: "deployment",   label: "Deployment" },
] as const;

type TabKey = typeof SECTION_TABS[number]["key"] | "sensitiveData" | "dependencies";

function SensitiveDataTab({ data }: { data: SensitiveField[] }) {
  const grouped = data.reduce((acc, f) => {
    (acc[f.entity] = acc[f.entity] || []).push(f);
    return acc;
  }, {} as Record<string, SensitiveField[]>);

  const entities = Object.keys(grouped);
  const [selected, setSelected] = useState(entities[0] || "");

  const fields = grouped[selected] || [];

  return (
    <div>
      <div className="flex gap-3 min-h-30">
        {/* Left nav */}
        <div className="w-44 shrink-0 border-r border-border pr-3 space-y-0.5">
          {entities.map((entity) => {
            const count = grouped[entity].length;
            const hasSecret = grouped[entity].some((f: { sensitivity: string; }) => f.sensitivity === "secret");
            const hasSensitive = grouped[entity].some((f: { sensitivity: string; }) => f.sensitivity === "sensitive");
            const topLevel = hasSecret ? "secret" : hasSensitive ? "sensitive" : "personal";
            const countStyle = getSensitivityStyle(topLevel);
            return (
              <button
                key={entity}
                onClick={() => setSelected(entity)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between gap-1 ${
                  selected === entity
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "text-text-muted hover:text-text hover:bg-secondary-50"
                }`}
              >
                <span className="truncate">{entity}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-semibold ${countStyle.bg} ${countStyle.text}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {selected && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-text">{selected}</span>
                <span className="text-[10px] text-text-muted">{fields.length} fields</span>
              </div>
              <div className="divide-y divide-border">
                {fields.map((f, i) => (
                    <div key={i} className="flex items-center px-3 py-1.5 gap-2">
                      <span className="text-xs font-mono text-text w-2/5 truncate">{f.field}</span>
                      <span className="text-[11px] text-text-muted flex-1 truncate">{f.reason}</span>
                      <SensitivityBadge level={f.sensitivity} />
                    </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const VULN_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/20", text: "text-red-400" },
  high:     { bg: "bg-orange-500/20", text: "text-orange-400" },
  medium:   { bg: "bg-amber-500/20", text: "text-amber-400" },
  low:      { bg: "bg-blue-500/15", text: "text-blue-400" },
};

type VulnDetail = { id: string; severity: string; title: string; details: string; aliases: string[]; url: string; pkg: string };

function VulnModal({ vuln, onClose }: { vuln: VulnDetail; onClose: () => void }) {
  const vs = VULN_STYLES[vuln.severity] || VULN_STYLES.medium;
  const [details, setDetails] = useState(vuln.details);
  const [aliases, setAliases] = useState(vuln.aliases);
  const [loading, setLoading] = useState(!vuln.details);

  useEffect(() => {
    if (vuln.details) return;
    fetch(`https://api.osv.dev/v1/vulns/${vuln.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setDetails(data.details || data.summary || "");
          setAliases(data.aliases || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [vuln.id, vuln.details]);

  return (
    <div className="fixed inset-0 z-99999" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-card rounded-xl border border-border shadow-xl max-w-xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${vs.bg} ${vs.text}`}>{vuln.severity}</span>
                <span className="text-[11px] font-mono text-text-muted">{vuln.id}</span>
              </div>
              <h3 className="text-sm font-semibold text-text leading-snug">{vuln.title}</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Package: {vuln.pkg}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-secondary-50 transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1 scrollbar-hide">
            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-muted">Loading details…</span>
              </div>
            ) : (
              <>
                {aliases.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Aliases</p>
                    <div className="flex flex-wrap gap-1">
                      {aliases.map(a => <span key={a} className="text-[11px] font-mono text-text-muted bg-secondary-50 border border-border px-1.5 py-0.5 rounded">{a}</span>)}
                    </div>
                  </div>
                )}
                {details ? (
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Details</p>
                    <MDEditor.Markdown source={details} style={{ background: "transparent", color: "inherit", fontSize: "0.75rem" }} />
                  </div>
                ) : (
                  <p className="text-xs text-text-muted py-2">No additional details available.</p>
                )}
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <a href={`https://osv.dev/vulnerability/${vuln.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:text-primary-400 font-medium transition-colors">
              View on OSV.dev →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function DependenciesTab({ data }: { data: Dependency[] }) {
  const [filter, setFilter] = useState<"all" | "production" | "dev" | "vulnerable">("all");
  const [selectedVuln, setSelectedVuln] = useState<VulnDetail | null>(null);

  const filtered = data.filter(d => {
    if (filter === "production") return d.type === "production";
    if (filter === "dev") return d.type === "dev";
    if (filter === "vulnerable") return d.vulnerabilities.length > 0;
    return true;
  });

  const vulnCount = data.reduce((sum, d) => sum + d.vulnerabilities.length, 0);
  const prodCount = data.filter(d => d.type === "production").length;
  const devCount = data.filter(d => d.type === "dev").length;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 mb-3">
        {([
          { key: "all", label: `All (${data.length})` },
          { key: "production", label: `Production (${prodCount})` },
          { key: "dev", label: `Dev (${devCount})` },
          { key: "vulnerable", label: `Vulnerable (${vulnCount > 0 ? vulnCount : 0})` },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] px-2 py-1 rounded-md font-medium transition-colors ${
              filter === f.key
                ? f.key === "vulnerable" ? "bg-red-500/20 text-red-400" : "bg-primary-100 text-primary-700"
                : "text-text-muted hover:text-text hover:bg-secondary-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-secondary-50 px-3 py-1.5 border-b border-border flex items-center gap-3 text-[10px] font-semibold text-text-muted uppercase tracking-wide">
          <span className="w-2/5">Package</span>
          <span className="w-[10%]">Version</span>
          <span className="w-[10%]">Latest</span>
          <span className="w-[12%]">Status</span>
          <span className="flex-1">Vulnerabilities</span>
        </div>
        <div className="divide-y divide-border max-h-100 overflow-y-auto scrollbar-hide">
          {filtered.map((d, i) => {
            const hasVulns = d.vulnerabilities.length > 0;
            return (
              <div key={i} className="px-3 py-1.5 flex items-start gap-3 hover:bg-secondary-50/50 transition-colors">
                <div className="w-2/5 min-w-0">
                  <a href={d.repoUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary-500 hover:text-primary-400 truncate block">{d.name}</a>
                  <span className="text-[10px] text-text-muted">{d.ecosystem} · {d.type}</span>
                </div>
                <span className="text-xs font-mono text-text w-[10%] truncate">{d.version}</span>
                <span className="text-xs font-mono w-[10%] truncate">
                  {d.latestVersion ? (
                    d.latestVersion === d.version
                      ? <span className="text-emerald-400">{d.latestVersion}</span>
                      : <span className="text-amber-400">{d.latestVersion}</span>
                  ) : <span className="text-text-muted">—</span>}
                </span>
                <span className="w-[12%]">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    d.status === "active" ? "bg-emerald-500/15 text-emerald-400" :
                    d.status === "outdated" ? "bg-amber-500/20 text-amber-400" :
                    d.status === "deprecated" ? "bg-red-500/20 text-red-400" :
                    "bg-gray-500/15 text-gray-400"
                  }`}>{d.status}</span>
                </span>
                <div className="flex-1 min-w-0">
                  {hasVulns ? (
                    <div className="flex flex-wrap gap-1">
                      {d.vulnerabilities.slice(0, 3).map((v, vi) => {
                        const vs = VULN_STYLES[v.severity] || VULN_STYLES.medium;
                        return (
                          <button key={vi} onClick={() => setSelectedVuln({ ...v, pkg: d.name })}
                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${vs.bg} ${vs.text} hover:opacity-80 transition-opacity truncate max-w-35 text-left cursor-pointer`}>
                            {v.title || v.id}
                          </button>
                        );
                      })}
                      {d.vulnerabilities.length > 3 && (
                        <span className="text-[9px] text-text-muted">+{d.vulnerabilities.length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-muted text-center">No dependencies match this filter.</div>
          )}
        </div>
      </div>
      {selectedVuln && <VulnModal vuln={selectedVuln} onClose={() => setSelectedVuln(null)} />}
    </div>
  );
}

export default function ProjectDescription({ analysis, analysisLoading, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const description = analysis?.aiAnalysis?.description;
  const sensitiveData = analysis?.sensitiveData;
  const dependencies = analysis?.dependencies;
  const summary = analysis?.aiAnalysis?.summary
    || (analysis?.techStack?.length
      ? `${analysis.primaryLanguage || analysis.techStack[0]?.name} project using ${analysis.techStack.slice(0, 4).map(t => t.name).join(", ")}${analysis.hasDocker ? ". Docker-ready" : ""}${analysis.hasCi ? " with CI/CD configured" : ""}.`
      : null);

  // Parse sections from AI response, or split description by ## headers as fallback
  const rawSections = analysis?.aiAnalysis?.sections;
  const sections = useMemo(() => {
    if (rawSections) {
      const valid: Record<string, string> = {};
      for (const tab of SECTION_TABS) {
        const val = (rawSections as Record<string, string>)[tab.key];
        if (val && typeof val === "string" && val.length > 10) valid[tab.key] = val;
      }
      if (Object.keys(valid).length >= 3) return valid;
    }
    if (!description) return null;
    const result: Record<string, string> = {};
    const headerMap: Record<string, string> = {
      "overview": "overview", "how it works": "howItWorks", "tech stack": "techStack",
      "architecture": "architecture", "data & storage": "dataStorage", "data and storage": "dataStorage",
      "code quality": "codeQuality", "code quality & patterns": "codeQuality",
      "security": "security", "security considerations": "security",
      "deployment": "deployment",
    };
    const parts = description.split(/^## /m);
    for (const part of parts) {
      if (!part.trim()) continue;
      const firstLine = part.split("\n")[0].trim().toLowerCase();
      const key = headerMap[firstLine];
      if (key) {
        result[key] = part.split("\n").slice(1).join("\n").trim();
      }
    }
    return Object.keys(result).length >= 2 ? result : null;
  }, [rawSections, description]);

  if (analysisLoading) {
    return (
      <div className={`${cardCls} p-8 mb-6`}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-text-muted">Analyzing project…</span>
        </div>
      </div>
    );
  }

  // If we have sections or sensitive data, render tabbed UI
  if ((sections && Object.values(sections).some(v => v)) || sensitiveData?.length || dependencies?.length) {
    const sectionTabs = SECTION_TABS.filter(t => sections?.[t.key]);
    const allTabs: Array<{ key: TabKey; label: string }> = [
      ...sectionTabs,
      ...(dependencies?.length ? [{ key: "dependencies" as TabKey, label: "Dependencies" }] : []),
      ...(sensitiveData?.length ? [{ key: "sensitiveData" as TabKey, label: "Sensitive Data" }] : []),
    ];

    return (
      <div className={`${cardCls} mb-6 overflow-hidden`}>
        <div className="h-1 bg-linear-to-r from-primary-500 via-primary-400 to-primary-300" />

        <div className="px-5 pt-4 pb-5">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-3">
            <h2 className="text-lg font-semibold text-text">Project Overview</h2>
            {onRefresh && (
              <button onClick={onRefresh} className="ml-auto p-1.5 rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" title="Re-analyze project">
                <svg className={`w-4 h-4 ${analysisLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                </svg>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto pb-2 mb-3 border-b border-border scrollbar-none">
            {allTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? tab.key === "sensitiveData" ? "bg-red-500/15 text-red-700 dark:text-red-300"
                    : tab.key === "dependencies" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    : "bg-primary-500/15 text-primary-700 dark:text-white"
                    : "text-text-muted hover:text-text hover:bg-secondary-50"
                }`}
              >
                {tab.label}
                {tab.key === "sensitiveData" && (
                  <span className="text-[9px] bg-red-200 text-red-700 px-1 rounded-full ml-1">{sensitiveData?.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "sensitiveData" && sensitiveData ? (
            <SensitiveDataTab data={sensitiveData} />
          ) : activeTab === "dependencies" && dependencies ? (
            <DependenciesTab data={dependencies} />
          ) : sections?.[activeTab as keyof typeof sections] ? (
            <MDEditor.Markdown source={sections[activeTab as keyof typeof sections] || ""} style={{ background: "transparent", color: "inherit", fontSize: "14px" }} />
          ) : null}
        </div>
      </div>
    );
  }

  // Fallback: single description or summary
  if (!description && !summary) return null;

  return (
    <div className={`${cardCls} mb-6 overflow-hidden`}>
      <div className="h-1 bg-linear-to-r from-primary-500 via-primary-400 to-primary-300" />
      <div className="px-5 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-lg font-semibold text-text">Project Overview</h2>
          {onRefresh && (
            <button onClick={onRefresh} className="ml-auto p-1.5 rounded-md text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors" title="Re-analyze project">
              <svg className={`w-4 h-4 ${analysisLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
              </svg>
            </button>
          )}
        </div>
        {description ? (
          <MDEditor.Markdown source={description} style={{ background: "transparent", color: "inherit", fontSize: "14px" }} />
        ) : (
          <p className="text-sm text-text leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  );
}
