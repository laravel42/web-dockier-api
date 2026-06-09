import type { Scan } from "../../../types";
import { cardCls, chipCls } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import StatusBadge from "../../../components/badges/StatusBadge";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";

interface Props {
  scans: Scan[];
  navigate: (path: string) => void;
}

export default function RecentScans({ scans, navigate }: Props) {
  if (!scans.length) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Security Scans</h2>
      <div className={`${cardCls} divide-y divide-border`}>
        {scans.map((scan, index) => {
          const isLatest = index === 0;
          const summary = scan.summary;
          const findingsLabel =
            scan.status === "completed" || scan.status === "failed"
              ? `${summary?.totalFindings ?? 0} finding${(summary?.totalFindings ?? 0) === 1 ? "" : "s"}`
              : null;

          return (
            <div key={scan.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <ShieldCheckIcon className="size-4 shrink-0 text-primary-500" />
                <button
                  type="button"
                  onClick={() => navigate(`/security/${scan.id}`)}
                  className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate text-left"
                >
                  {scan.branch}
                  {scan.commitSha ? ` @ ${scan.commitSha.slice(0, 7)}` : ""}
                </button>
                {isLatest && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none shrink-0 bg-primary/10 text-primary">
                    Latest
                  </span>
                )}
                <StatusBadge status={scan.status} />
                {findingsLabel && (
                  <span className={`${chipCls} whitespace-nowrap tabular-nums`}>{findingsLabel}</span>
                )}
                {(summary?.errors ?? 0) > 0 && (
                  <span className="text-[10px] font-medium text-danger-500 tabular-nums">
                    {summary!.errors} error{summary!.errors === 1 ? "" : "s"}
                  </span>
                )}
                <span className="text-xs text-text-muted ml-auto shrink-0">{timeAgo(scan.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 pl-6">
                <button
                  type="button"
                  onClick={() => navigate(`/security/${scan.id}`)}
                  className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors"
                >
                  View scan →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
