import type { Scan, Project } from "@/types";
import { cardCls, typeCardDateCls, typeCardTitle, typePanelDesc, typePanelTitle, dashboardActivityRowCls } from "@/utils/styles";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { formatCardDateTime } from "@/utils/formatCardDate";
import SeverityBadge from "@/components/SeverityBadge";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { isScanSecurityClean } from "@/utils/scanSummary";
import ScanStatusDot from "@/components/ScanStatusDot";
import { clickableProps } from "@/utils/a11y";

interface Props {
  scans: Scan[];
  projectMap: Record<string, Project>;
  fallbackCommitByProject?: Record<string, string>;
  loading?: boolean;
  onViewAll: () => void;
  onViewScan: (id: string) => void;
}

export default function RecentScans({ scans, projectMap, fallbackCommitByProject, loading, onViewAll, onViewScan }: Props) {
  return (
    <div className={cardCls}>
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className={typePanelTitle}>Recent Security Scans</h2>
          <p className={`${typePanelDesc} mt-0.5`}>Latest activity</p>
        </div>
        <Button variant="link" onClick={onViewAll}>
          View all
        </Button>
      </div>
      {loading ? (
        <ul className="divide-y divide-border/40" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-2 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-14" />
            </li>
          ))}
        </ul>
      ) : scans.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No scans yet</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {scans.map((s) => {
            const proj = projectMap[s.projectId];
            const summary = s.summary;
            return (
              <li key={s.id}>
                <div {...clickableProps(() => onViewScan(s.id))} className={`${dashboardActivityRowCls} flex-wrap sm:flex-nowrap`}>
                  <ScanStatusDot status={s.status} summary={summary} />
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
                    <div className="flex basis-full flex-wrap items-center gap-1.5 pl-5 sm:basis-auto sm:shrink-0 sm:flex-nowrap sm:pl-0">
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
