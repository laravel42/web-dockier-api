import SeverityBadge from "@/components/SeverityBadge";
import { cardCls, segmentActiveCls, segmentIdleCls } from "@/utils/styles";
import Button from "@/components/ui/Button";
import SparklesIcon from "@/components/icons/outlined/SparklesIcon";
import { displayFindingPath } from "@/utils/scanPaths";
import { buildCodePreviewRows, buildSnippetPreviewRow } from "@/utils/codePreview";
import { providerCount } from "@/utils/findingCounts";
import { usePermissions } from "@/context/PermissionsContext";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { Finding, PMIntegration, SecurityFindingCounts } from "@/types";
import Spinner from "@/components/Spinner";
import { ChevronRightIcon, CircleCheckIcon, CirclePlusIcon } from "lucide-react";

interface Props {
  findings: Finding[];
  findingsTotal: number;
  findingCounts: SecurityFindingCounts | null;
  findingsLoading: boolean;
  findingsLoadingMore: boolean;
  hasMoreFindings: boolean;
  onLoadMore: () => void;
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

type ProviderKey = "semgrep" | "sonar" | "custom";

const PROVIDER_DEFS: Array<{ key: string; label: string; countKey: ProviderKey | null }> = [
  { key: "", label: "All Providers", countKey: null },
  { key: "semgrep", label: "Semgrep", countKey: "semgrep" },
  { key: "sonar", label: "SonarQube", countKey: "sonar" },
  { key: "custom", label: "Custom Rules", countKey: "custom" },
];

function emptyFilterMessage(severityFilter: string, providerFilter: string): string {
  const parts: string[] = [];
  if (providerFilter) {
    const label = PROVIDER_DEFS.find((p) => p.key === providerFilter)?.label ?? providerFilter;
    parts.push(label);
  }
  if (severityFilter) parts.push(`severity "${severityFilter}"`);
  if (parts.length === 0) return "No security findings for this scan.";
  return `No findings match ${parts.join(" and ")}.`;
}

export default function FindingsList({
  findings, findingsTotal, findingCounts, findingsLoading, findingsLoadingMore, hasMoreFindings, onLoadMore,
  scanCompleted,
  severityFilter, providerFilter, onProviderFilterChange,
  fileContents, pmIntegrations, hasConnectionId, mrCreating,
  onCreateIssue, onCreateMR,
}: Props) {
  const sentinelRef = useInfiniteScroll(onLoadMore, {
    enabled: hasMoreFindings && !findingsLoading,
    isLoading: findingsLoadingMore,
  });

  const providers = PROVIDER_DEFS.filter((p) => {
    if (p.key === "") return true;
    if (!findingCounts || !p.countKey) return false;
    return findingCounts[p.countKey] > 0;
  });

  const hasSecurityFindings = (findingCounts?.total ?? 0) > 0;
  const hasActiveFilter = Boolean(severityFilter || providerFilter);

  if (findingsLoading && findings.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!hasSecurityFindings && scanCompleted && !hasActiveFilter) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <CircleCheckIcon className="size-10  mx-auto text-success-500 mb-3" />
        <p className="text-sm text-text-muted">No security findings — looking clean.</p>
      </div>
    );
  }

  const grouped = Object.entries(
    findings.reduce<Record<string, Finding[]>>((acc, f) => {
      (acc[f.filePath] ||= []).push(f);
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => b.length - a.length);

  return (
    <>
      {providers.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-text-muted mr-1">Source:</span>
          {providers.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onProviderFilterChange(p.key)}
              className={`px-2.5 py-1 rounded-sm border text-xs font-medium transition-colors ${
                providerFilter === p.key
                  ? segmentActiveCls
                  : `${segmentIdleCls} bg-secondary-50 hover:bg-secondary-100 hover:text-text`
              }`}
            >
              {p.label}
              {p.key === "" && findingCounts ? ` (${findingCounts.total})` : ""}
              {p.countKey && findingCounts ? ` (${providerCount(findingCounts, p.countKey)})` : ""}
            </button>
          ))}
        </div>
      )}

      {findings.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm text-text-muted">{emptyFilterMessage(severityFilter, providerFilter)}</p>
          {hasActiveFilter && (
            <p className="text-xs text-text-muted mt-2">Clear the summary or source filters to see all findings.</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-text-muted mb-3 tabular-nums">
            Showing {findings.length} of {findingsTotal} finding{findingsTotal !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {grouped.map(([filePath, fileFindings]) => (
              <details key={filePath} className={`${cardCls} group`}>
                <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-secondary-50/50 transition-colors">
                  <ChevronRightIcon className="size-3.5  text-text-muted shrink-0 transition-transform group-open:rotate-90" />
                  <span className="text-xs font-mono text-text truncate">{displayFindingPath(filePath)}</span>
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
                      fileContent={fileContents[displayFindingPath(f.filePath)]}
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

          <div ref={sentinelRef} className="h-4" aria-hidden />
          {findingsLoadingMore && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}
          {!hasMoreFindings && findings.length > 0 && (
            <p className="text-center text-xs text-text-muted py-4">All findings loaded</p>
          )}
        </>
      )}
    </>
  );
}

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
  const { has } = usePermissions();
  const canManageScans = has("scan:manage");

  return (
    <div className="p-3  pl-9">
      <div className="mb-4 flex items-center gap-2">
        <SeverityBadge severity={f.severity as "error" | "warning" | "info"} />
        <span className="text-xs text-text-muted font-mono">L{f.startLine}</span>
        <span className="text-xs text-text-muted font-mono px-1 py-px bg-secondary-50 rounded">{f.ruleId}</span>
        {canManageScans && (pmIntegrations.length > 0 || hasConnectionId) && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => onCreateIssue(f)}
              iconLeft={
                <CirclePlusIcon className="size-4" />
              }
            >
              Create issue
            </Button>
            {hasConnectionId && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onCreateMR(f)}
                loading={mrCreating === f.id}
                iconLeft={
                  mrCreating !== f.id ? (
                    <SparklesIcon className="size-4" />
                  ) : undefined
                }
              >
                {mrCreating === f.id ? "Fixing…" : "Fix with AI"}
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="mb-2 text-xs/snug text-text ">{f.message}</p>
      <CodePreview finding={f} fileContent={fileContent} />
    </div>
  );
}

function CodePreview({ finding: f, fileContent }: { finding: Finding; fileContent: string | undefined }) {
  const relativePath = displayFindingPath(f.filePath);

  if (!fileContent) {
    const row = f.snippet ? buildSnippetPreviewRow(f.filePath, f.snippet, f.startLine) : null;
    if (!row) return null;

    return (
      <div className="code-preview rounded-lg overflow-hidden border border-border/60 bg-secondary-900/80">
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted px-3 py-2">
          <span className="min-w-0 truncate text-xs font-mono text-text-muted">{relativePath}</span>
          <span className="shrink-0 text-xs font-mono tabular-nums text-text-muted">L{row.lineNumber}</span>
        </div>
        <pre className="m-0 overflow-hidden p-0 font-mono text-sm/5 ">
          <div className="flex items-start bg-danger-500/15">
            <span className="shrink-0 select-none border-r border-border/30 bg-danger-500/10 py-px pr-3 text-right text-sm/5 tabular-nums  text-danger-500">
              {row.lineNumber}
            </span>
            <code
              className="min-w-0 flex-1 px-3 py-px whitespace-pre-wrap break-all leading-5 text-text language-markup"
              dangerouslySetInnerHTML={{ __html: row.html }}
            />
          </div>
        </pre>
      </div>
    );
  }

  const { rows, truncated } = buildCodePreviewRows(
    f.filePath,
    fileContent.split("\n"),
    f.startLine,
    f.endLine,
  );
  if (rows.length === 0) return null;

  const gutterWidth = String(rows[rows.length - 1]!.lineNumber).length;
  const lineLabel =
    rows.length === 1
      ? `L${rows[0]!.lineNumber}`
      : `L${rows[0]!.lineNumber}–${rows[rows.length - 1]!.lineNumber}${truncated ? "+" : ""}`;

  return (
    <div className="code-preview rounded-lg overflow-hidden border border-border/60 bg-secondary-900/80">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted px-3 py-2">
        <span className="min-w-0 truncate text-xs font-mono text-text-muted">{relativePath}</span>
        <span className="shrink-0 text-xs font-mono tabular-nums text-text-muted">{lineLabel}</span>
      </div>
      <pre className="m-0 overflow-hidden p-0 font-mono text-sm/5 ">
        {rows.map((row) => (
          <div key={row.lineNumber} className="flex items-start bg-danger-surface">
            <span
              className="shrink-0 select-none border-r border-danger-line bg-danger-500/10 py-px pr-3 text-right text-sm/5 tabular-nums text-danger-ink"
              style={{ width: `${gutterWidth + 3}ch` }}
            >
              {row.lineNumber}
            </span>
            <code
              className="min-w-0 flex-1 px-3 py-px whitespace-pre-wrap break-all leading-5 text-text language-markup"
              dangerouslySetInnerHTML={{ __html: row.html }}
            />
          </div>
        ))}
      </pre>
    </div>
  );
}
