import type { Scan } from "../../../types";
import { cardCls } from "../../../utils/styles";
import StatusRingIcon from "../../../components/badges/StatusRingIcon";
import SeverityBadge from "../../../components/SeverityBadge";
import BranchCommitLabel from "../../../components/BranchCommitLabel";
import { isScanSecurityClean } from "../../../utils/scanSummary";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";

interface Props {
  scans: Scan[];
  navigate: (path: string) => void;
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

export default function RecentScans({ scans, navigate }: Props) {
  if (!scans.length) return null;

  const rows = buildRows(scans);

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Security Scans</h2>
      <div className={`${cardCls} p-4 flex-1`}>
        <ol className="relative">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const lineTop = row.type === "header" ? "top-6" : "top-9";
            return (
              <li key={row.key} className="relative flex gap-4 pb-4 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-4 ${lineTop} bottom-0 w-px -translate-x-1/2 bg-border`}
                  />
                )}
                {row.type === "header" ? (
                  <>
                    <div className="relative z-10 flex size-8 shrink-0 items-center justify-center">
                      <span className="size-2.5 rounded-full bg-border ring-4 ring-card" />
                    </div>
                    <span className="text-[14px] font-bold text-text-muted pt-1.5">{row.label}</span>
                  </>
                ) : (
                  <>
                    <div className="relative z-10 shrink-0 flex size-8 items-center justify-center rounded-full bg-card ring-2 ring-border">
                      <ShieldCheckIcon className="size-4 text-primary-500" />
                      <StatusRingIcon status={row.scan.status} />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <BranchCommitLabel
                          branch={row.scan.branch}
                          commit={row.scan.commitSha || undefined}
                          onClick={() => navigate(`/security/${row.scan.id}`)}
                        />
                      </div>
                      {row.scan.summary && row.scan.status === "completed" && (
                        <div className="flex items-center flex-wrap gap-1 mt-1.5">
                          {row.scan.summary.errors > 0 && (
                            <SeverityBadge severity="error" count={row.scan.summary.errors} size="compact" />
                          )}
                          {row.scan.summary.warnings > 0 && (
                            <SeverityBadge severity="warning" count={row.scan.summary.warnings} size="compact" />
                          )}
                          {row.scan.summary.infos > 0 && (
                            <SeverityBadge severity="info" count={row.scan.summary.infos} size="compact" />
                          )}
                          {isScanSecurityClean(row.scan.summary) && (
                            <SeverityBadge severity="clean" label="Clean" size="compact" />
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
