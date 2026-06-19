import type { Scan, Project } from "../../../types";
import { cardCls, btnLink, typeCardDateCls, typeCardTitle, typePanelDesc, typePanelTitle, dashboardActivityRowCls } from "../../../utils/styles";
import { formatCardDateTime } from "../../../utils/formatCardDate";
import SeverityBadge from "../../../components/SeverityBadge";
import BranchCommitLabel from "../../../components/BranchCommitLabel";
import { isScanSecurityClean, scanHasSecurityErrors } from "../../../utils/scanSummary";

interface Props {
  scans: Scan[];
  projectMap: Record<string, Project>;
  fallbackCommitByProject?: Record<string, string>;
  onViewAll: () => void;
  onViewScan: (id: string) => void;
}

export default function RecentScans({ scans, projectMap, fallbackCommitByProject, onViewAll, onViewScan }: Props) {
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
            const summary = s.summary;
            const isClean = summary ? isScanSecurityClean(summary) : false;
            const statusDot =
              s.status === "completed"
                ? isClean
                  ? "bg-success-500"
                  : summary && scanHasSecurityErrors(summary)
                    ? "bg-danger-500"
                    : "bg-warning-500"
                : s.status === "failed"
                  ? "bg-danger-500"
                  : "bg-primary-500";
            return (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onViewScan(s.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewScan(s.id);
                    }
                  }}
                  className={dashboardActivityRowCls}
                >
                  <span className={`size-2 rounded-full shrink-0 ${statusDot}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`${typeCardTitle} truncate`}>{proj?.name || s.repo}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <BranchCommitLabel
                        branch={s.branch}
                        commit={s.commitSha || fallbackCommitByProject?.[s.projectId] || undefined}
                        onClick={() => onViewScan(s.id)}
                      />
                      <span className={typeCardDateCls}>{formatCardDateTime(s.createdAt)}</span>
                    </div>
                  </div>
                  {s.summary && s.status === "completed" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.summary.errors > 0 && <SeverityBadge severity="error" count={s.summary.errors} />}
                      {s.summary.warnings > 0 && <SeverityBadge severity="warning" count={s.summary.warnings} />}
                      {s.summary.infos > 0 && <SeverityBadge severity="info" count={s.summary.infos} />}
                      {summary && isScanSecurityClean(summary) && <SeverityBadge severity="clean" label="Clean" />}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
