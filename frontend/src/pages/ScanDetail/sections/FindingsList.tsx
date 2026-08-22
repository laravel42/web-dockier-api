import SeverityBadge from "@/components/SeverityBadge";
import { cardCls } from "@/utils/styles";
import Button from "@/components/ui/Button";
import SparklesIcon from "@/components/icons/outlined/SparklesIcon";
import { displayFindingPath } from "@/pages/ScanDetail/utils/scanPaths";
import { buildCodePreviewRows, buildSnippetPreviewRow } from "@/pages/ScanDetail/utils/codePreview";
import { providerCount } from "@/pages/ScanDetail/utils/findingCounts";
import { usePermissions } from "@/context/PermissionsContext";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { Finding, PMIntegration, SecurityFindingCounts } from "@/types";
import Spinner from "@/components/Spinner";
import {
  ChevronRightIcon,
  CircleCheckIcon,
  CirclePlusIcon,
} from "lucide-react";
import type { KeyboardEvent } from "react";

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
  fileContents: Record<string, string>;
  pmIntegrations: PMIntegration[];
  hasConnectionId: boolean;
  mrCreating: string | null;
  onCreateIssue: (f: Finding) => void;
  onCreateMR: (f: Finding) => void;
}

type ProviderKey = "semgrep" | "bearer" | "custom" | "codeql";

const PROVIDER_DEFS: Array<{
  key: string;
  label: string;
  countKey: ProviderKey | null;
}> = [
  { key: "", label: "All", countKey: null },
  { key: "custom", label: "Custom rules", countKey: "custom" },
  { key: "codeql", label: "CodeQL", countKey: "codeql" },
  { key: "bearer", label: "Bearer", countKey: "bearer" },
];

export function ProviderFilters({
  findingCounts,
  providerFilter,
  onProviderFilterChange,
}: {
  findingCounts: SecurityFindingCounts | null;
  providerFilter: string;
  onProviderFilterChange: (provider: string) => void;
}) {
  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PROVIDER_DEFS.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onProviderFilterChange(PROVIDER_DEFS[next].key);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Filter findings by engine"
      className="inline-flex flex-wrap items-center rounded-md border border-border/50 bg-card/30 p-0.5"
    >
      {PROVIDER_DEFS.map((p, index) => {
        const count =
          findingCounts == null
            ? null
            : p.key === ""
              ? findingCounts.total
              : p.countKey
                ? providerCount(findingCounts, p.countKey)
                : null;
        const selected = providerFilter === p.key;
        return (
          <button
            key={p.key || "all"}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onProviderFilterChange(p.key)}
            onKeyDown={(event) => moveSelection(event, index)}
            className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-ui font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
              selected ? "bg-primary-500/10 text-text" : "text-text-muted hover:text-text"
            }`}
          >
            {p.label}
            {count != null && (
              <span className="ml-1 tabular-nums text-text-muted">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const SEVERITY_RANK: Record<string, number> = { error: 3, warning: 2, info: 1 };

function severityCount(findings: Finding[], severity: string): number {
  return findings.filter((f) => f.severity === severity).length;
}

function sortFindingsBySeverityDesc(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
}

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
  findings, findingCounts, findingsLoading, findingsLoadingMore, hasMoreFindings, onLoadMore,
  scanCompleted,
  severityFilter, providerFilter,
  fileContents, pmIntegrations, hasConnectionId, mrCreating,
  onCreateIssue, onCreateMR,
}: Props) {
  const sentinelRef = useInfiniteScroll(onLoadMore, {
    enabled: hasMoreFindings && !findingsLoading,
    isLoading: findingsLoadingMore,
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
    sortFindingsBySeverityDesc(findings).reduce<Record<string, Finding[]>>((acc, f) => {
      (acc[f.filePath] ||= []).push(f);
      return acc;
    }, {}),
  );

  return (
    <>
      {findings.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm text-text-muted">{emptyFilterMessage(severityFilter, providerFilter)}</p>
          {hasActiveFilter && (
            <p className="text-xs text-text-muted mt-2">Clear the summary or source filters to see all findings.</p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {grouped.map(([filePath, fileFindings]) => {
              const errorCount = severityCount(fileFindings, "error");
              const warningCount = severityCount(fileFindings, "warning");
              const infoCount = severityCount(fileFindings, "info");
              return (
              <details key={filePath} className={`${cardCls} group`}>
                <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-secondary-50/50 transition-colors">
                  <ChevronRightIcon className="size-3.5  text-text-muted shrink-0 transition-transform group-open:rotate-90" />
                  <span className="text-xs font-mono text-text truncate">{displayFindingPath(filePath)}</span>
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {errorCount > 0 && (
                      <SeverityBadge severity="error" count={errorCount} />
                    )}
                    {warningCount > 0 && (
                      <SeverityBadge severity="warning" count={warningCount} />
                    )}
                    {infoCount > 0 && (
                      <SeverityBadge severity="info" count={infoCount} />
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
              );
            })}
          </div>

          <div ref={sentinelRef} className="h-4" aria-hidden />
          {findingsLoadingMore && (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
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

  const gutterWidth = String(Math.max(...rows.map((r) => r.lineNumber))).length;
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
          <div
            key={row.lineNumber}
            className={`flex items-start ${row.highlighted ? "bg-danger-surface" : "bg-secondary-900/40"}`}
          >
            <span
              className={`shrink-0 select-none border-r py-px pr-3 text-right text-sm/5 tabular-nums ${
                row.highlighted
                  ? "border-danger-line bg-danger-500/10 text-danger-ink"
                  : "border-border/30 bg-muted/30 text-text-muted"
              }`}
              style={{ width: `${gutterWidth + 3}ch` }}
            >
              {row.lineNumber}
            </span>
            <code
              className={`min-w-0 flex-1 px-3 py-px whitespace-pre-wrap break-all leading-5 language-markup ${
                row.highlighted ? "text-text" : "text-text-muted"
              }`}
              dangerouslySetInnerHTML={{ __html: row.html }}
            />
          </div>
        ))}
      </pre>
    </div>
  );
}
