import type { Scan, Project } from "../../../types";
import { cardCls, btnLink, typeCardDateCls, typeCardTitle, typePanelDesc, typePanelTitle } from "../../../utils/styles";
import { formatCardDateTime } from "../../../utils/formatCardDate";
import SeverityBadge from "../../../components/SeverityBadge";

interface Props {
  scans: Scan[];
  projectMap: Record<string, Project>;
  onViewAll: () => void;
  onViewScan: (id: string) => void;
}

export default function RecentScans({ scans, projectMap, onViewAll, onViewScan }: Props) {
  return (
    <div className={cardCls}>
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className={typePanelTitle}>Recent Security Scans</h2>
          <p className={`${typePanelDesc} mt-0.5`}>Latest activity</p>
        </div>
        <button type="button" onClick={onViewAll} className={btnLink}>
          View all
        </button>
      </div>
      {scans.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No scans yet</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {scans.map((s) => {
            const proj = projectMap[s.projectId];
            const statusDot =
              s.status === "completed"
                ? s.summary?.totalFindings === 0
                  ? "bg-success-500"
                  : s.summary?.errors > 0
                    ? "bg-danger-500"
                    : "bg-warning-500"
                : s.status === "failed"
                  ? "bg-danger-500"
                  : "bg-primary-500";
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onViewScan(s.id)}
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-card/40 transition-colors text-left"
                >
                  <span className={`size-2 rounded-full shrink-0 ${statusDot}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`${typeCardTitle} truncate`}>{proj?.name || s.repo}</p>
                    <p className={`${typeCardDateCls} mt-0.5`}>
                      {s.branch} · {formatCardDateTime(s.createdAt)}
                    </p>
                  </div>
                  {s.summary && s.status === "completed" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.summary.errors > 0 && <SeverityBadge severity="error" count={s.summary.errors} />}
                      {s.summary.warnings > 0 && <SeverityBadge severity="warning" count={s.summary.warnings} />}
                      {s.summary.infos > 0 && <SeverityBadge severity="info" count={s.summary.infos} />}
                      {s.summary.totalFindings === 0 && <SeverityBadge severity="clean" label="Clean" />}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
