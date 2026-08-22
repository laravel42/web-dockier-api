import type { Scan } from "@/types";
import { cardCls, typeCardDateCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import SeverityBadge from "@/components/SeverityBadge";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { isScanSecurityClean, scanFindingSeverityDotClass } from "@/utils/scanSummary";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  scans: Scan[];
  navigate: (path: string) => void;
  /** Enables the "Run first scan" action on the empty state. */
  projectId?: string;
  /** Shown when a scan recorded no SHA of its own — the branch head stands in. */
  fallbackCommitHash?: string;
  /** Non-empty when the fetch failed — never conflated with "no scans". */
  error?: string;
  onRetry?: () => void;
}

function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type TimelineRow =
  | { type: "header"; key: string; label: string }
  | { type: "scan"; key: string; scan: Scan };

function buildRows(scans: Scan[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let currentDay = "";
  for (const scan of scans) {
    const day = new Date(scan.createdAt).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ type: "header", key: `day-${day}`, label: dayLabel(scan.createdAt) });
    }
    rows.push({ type: "scan", key: scan.id, scan });
  }
  return rows;
}

const rowCls =
  "flex min-w-0 w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-card/40";

export default function RecentScans({
  scans,
  navigate,
  projectId,
  fallbackCommitHash,
  error,
  onRetry,
}: Props) {

  if (error) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-text mb-4">Recent Security Scans</h2>
        <EmptyState
          compact
          title="Couldn't load scans"
          description={error}
          action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
        />
      </div>
    );
  }

  if (!scans.length) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-text mb-4">Recent Security Scans</h2>
        <EmptyState
          compact
          description="No security scans have been run for this project yet."
          action={
            projectId
              ? { label: "Run first scan", onClick: () => navigate(`/security/project/${projectId}`) }
              : undefined
          }
        />
      </div>
    );
  }

  const rows = buildRows(scans);
  const open = (id: string) => navigate(`/security/${id}`);

  return (
    /* No min-h-0 anywhere in this chain: the card should fill spare panel height
       but never be squeezed below its own rows. */
    <div className="flex min-w-0 flex-1 flex-col">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Security Scans</h2>
      {/* Vertical-only card padding so hover bands and day rules reach the card edges. */}
      <div className={`${cardCls} flex-1 py-2`}>
      <ul className="min-w-0">
      {rows.map((row, i) =>
        row.type === "header" ? (
          <li
            key={row.key}
            className={`flex items-center gap-3 px-4 pt-3 pb-1.5 ${i > 0 ? "mt-1 border-t border-border/40" : ""}`}
          >
            <span className="flex w-2 shrink-0 justify-center">
              <span className="size-2.5 rounded-full bg-border" />
            </span>
            <span className="text-sm font-bold text-text-muted">{row.label}</span>
          </li>
        ) : (
          /* No rule directly under a day heading — the heading is the divider. */
          <li key={row.key} className={rows[i - 1]?.type === "scan" ? "border-t border-border/40" : ""}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => open(row.scan.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  open(row.scan.id);
                }
              }}
              className={rowCls}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${
                  row.scan.status === "completed"
                    ? scanFindingSeverityDotClass(row.scan.summary)
                    : row.scan.status === "failed"
                      ? "bg-danger-500"
                      : "bg-primary-500"
                }`}
              />
              <div className="min-w-0 flex-1 overflow-hidden">
                <BranchCommitLabel
                  branch={row.scan.branch}
                  commit={row.scan.commitSha || fallbackCommitHash}
                />
              </div>
              {row.scan.summary && row.scan.status === "completed" && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {row.scan.summary.errors > 0 && (
                    <SeverityBadge severity="error" count={row.scan.summary.errors} />
                  )}
                  {row.scan.summary.warnings > 0 && (
                    <SeverityBadge severity="warning" count={row.scan.summary.warnings} />
                  )}
                  {row.scan.summary.infos > 0 && (
                    <SeverityBadge severity="info" count={row.scan.summary.infos} />
                  )}
                  {isScanSecurityClean(row.scan.summary) && (
                    <SeverityBadge severity="clean" label="Clean" />
                  )}
                </div>
              )}
              <span className={`${typeCardDateCls} shrink-0`}>{formatCardDateTime(row.scan.createdAt)}</span>
            </div>
          </li>
        ),
      )}
      </ul>
      </div>
    </div>
  );
}
