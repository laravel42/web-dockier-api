import CheckCircleIcon from "../../../components/icons/outlined/CheckCircleIcon";
import ChevronRightIcon from "../../../components/icons/outlined/ChevronRightIcon";
import SeverityBadge from "../../../components/SeverityBadge";
import { cardCls } from "../../../utils/styles";
import type { Finding, PMIntegration } from "../types";

interface Props {
  findings: Finding[];
  findingsLoading: boolean;
  scanCompleted: boolean;
  severityFilter: string;
  providerFilter: string;
  onProviderFilterChange: (provider: string) => void;
  fileContents: Record<string, string>;
  pmIntegrations: PMIntegration[];
  hasConnectionId: boolean;
  mrCreating: string | null;
  onCreateIssue: (f: Finding) => void;
  onCreateMR: (f: Finding) => void;
}

export default function FindingsList({
  findings, findingsLoading, scanCompleted,
  severityFilter, providerFilter, onProviderFilterChange,
  fileContents, pmIntegrations, hasConnectionId, mrCreating,
  onCreateIssue, onCreateMR,
}: Props) {
  if (findingsLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (findings.length === 0 && scanCompleted) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <CheckCircleIcon className="w-10 h-10 mx-auto text-success-500 mb-3" />
        <p className="text-sm text-text-muted">No findings{severityFilter ? ` with severity "${severityFilter}"` : ""} — looking clean.</p>
      </div>
    );
  }

  if (findings.length === 0) return null;

  // Provider filter pills
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    const p = f.ruleId.startsWith("sonar.") ? "sonar" : f.ruleId.startsWith("custom.") ? "custom" : "semgrep";
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});

  const providers = [
    { key: "", label: "All Providers", count: findings.length },
    { key: "semgrep", label: "Semgrep", count: counts["semgrep"] || 0 },
    { key: "sonar", label: "SonarQube", count: counts["sonar"] || 0 },
    { key: "custom", label: "Custom Rules", count: counts["custom"] || 0 },
  ].filter(p => p.key === "" || p.count > 0);

  const filtered = findings
    .filter((f) => !severityFilter || f.severity === severityFilter)
    .filter((f) => {
      if (!providerFilter) return true;
      if (providerFilter === "sonar") return f.ruleId.startsWith("sonar.");
      if (providerFilter === "custom") return f.ruleId.startsWith("custom.");
      return !f.ruleId.startsWith("sonar.") && !f.ruleId.startsWith("custom.");
    });

  const grouped = Object.entries(
    filtered.reduce<Record<string, Finding[]>>((acc, f) => {
      (acc[f.filePath] ||= []).push(f);
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => b.length - a.length);

  return (
    <>
      {/* Provider filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-text-muted mr-1">Source:</span>
        {providers.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onProviderFilterChange(p.key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              providerFilter === p.key
                ? "bg-primary-500 text-white"
                : "bg-secondary-50 text-text-muted hover:bg-secondary-100 hover:text-text"
            }`}
          >
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm text-text-muted">No findings from this provider{severityFilter ? ` with severity "${severityFilter}"` : ""}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(([filePath, fileFindings]) => (
            <details key={filePath} className={`${cardCls} group`}>
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-secondary-50/50 transition-colors">
                <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted shrink-0 transition-transform group-open:rotate-90" />
                <span className="text-xs font-mono text-text truncate">{filePath}</span>
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {fileFindings.filter(f => f.severity === "error").length > 0 && (
                    <SeverityBadge severity="error" count={fileFindings.filter(f => f.severity === "error").length} />
                  )}
                  {fileFindings.filter(f => f.severity === "warning").length > 0 && (
                    <SeverityBadge severity="warning" count={fileFindings.filter(f => f.severity === "warning").length} />
                  )}
                  {fileFindings.filter(f => f.severity === "info").length > 0 && (
                    <SeverityBadge severity="info" count={fileFindings.filter(f => f.severity === "info").length} />
                  )}
                </div>
              </summary>
              <div className="divide-y divide-border border-t border-border">
                {fileFindings.map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    fileContent={fileContents[f.filePath]}
                    pmIntegrations={pmIntegrations}
                    hasConnectionId={hasConnectionId}
                    mrCreating={mrCreating}
                    onCreateIssue={onCreateIssue}
                    onCreateMR={onCreateMR}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

// ── Individual finding row ───────────────────────────────────────

interface FindingRowProps {
  finding: Finding;
  fileContent: string | undefined;
  pmIntegrations: PMIntegration[];
  hasConnectionId: boolean;
  mrCreating: string | null;
  onCreateIssue: (f: Finding) => void;
  onCreateMR: (f: Finding) => void;
}

function FindingRow({ finding: f, fileContent, pmIntegrations, hasConnectionId, mrCreating, onCreateIssue, onCreateMR }: FindingRowProps) {
  return (
    <div className="px-3 py-3 pl-9 space-y-1.5">
      {/* Top row: severity badge + buttons */}
      <div className="flex items-center gap-2">
        <SeverityBadge severity={f.severity as "error" | "warning" | "info"} label={f.severity} />
        <span className="text-[10px] text-text-muted font-mono">L{f.startLine}</span>
        <span className="text-[10px] text-text-muted font-mono px-1 py-px bg-secondary-50 rounded">{f.ruleId}</span>
        {(pmIntegrations.length > 0 || hasConnectionId) && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => onCreateIssue(f)}
              className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Create issue
            </button>
            {hasConnectionId && (
              <button
                type="button"
                onClick={() => onCreateMR(f)}
                disabled={mrCreating === f.id}
                className="h-8 px-4 flex items-center gap-1.5 rounded-lg bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 disabled:opacity-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
                {mrCreating === f.id ? "Fixing…" : "Fix with AI"}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Message */}
      <p className="text-xs text-text leading-snug">{f.message}</p>
      {/* Code preview */}
      <CodePreview finding={f} fileContent={fileContent} />
    </div>
  );
}

// ── Code preview with context lines ──────────────────────────────

function CodePreview({ finding: f, fileContent }: { finding: Finding; fileContent: string | undefined }) {
  if (!fileContent) {
    return f.snippet ? (
      <pre className="p-1.5 rounded bg-gray-900 text-gray-300 text-[11px] font-mono overflow-x-auto leading-tight">
        <code>{f.snippet}</code>
      </pre>
    ) : null;
  }

  const allLines = fileContent.split("\n");
  const ctxBefore = 5;
  const ctxAfter = 5;
  const start = Math.max(0, f.startLine - 1 - ctxBefore);
  const end = Math.min(allLines.length, f.endLine + ctxAfter);
  const visibleLines = allLines.slice(start, end);
  const gutterWidth = String(end).length;

  return (
    <div className="rounded-lg overflow-hidden border border-gray-700/50 bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#181825] border-b border-gray-700/50">
        <span className="text-[10px] text-gray-400 font-mono">{f.filePath}</span>
        <span className="text-[10px] text-gray-500">L{start + 1}–{end}</span>
      </div>
      <pre className="p-0 m-0 overflow-x-auto text-[11px] leading-[1.6] font-mono">
        {visibleLines.map((line, i) => {
          const lineNum = start + i + 1;
          const isVulnerable = lineNum >= f.startLine && lineNum <= f.endLine;
          return (
            <div key={lineNum} className={`flex ${isVulnerable ? "bg-danger-500/15" : "hover:bg-white/[0.03]"}`}>
              <span className={`shrink-0 select-none text-right pr-3 pl-3 ${isVulnerable ? "text-danger-400 bg-danger-500/10" : "text-gray-600"}`} style={{ width: `${gutterWidth + 3}ch` }}>
                {lineNum}
              </span>
              <code className={`flex-1 pr-3 ${isVulnerable ? "text-gray-200" : "text-gray-400"}`}>
                {line || " "}
              </code>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
