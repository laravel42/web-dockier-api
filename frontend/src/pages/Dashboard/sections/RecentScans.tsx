import type { Scan, Project } from "../../../types";
import { cardCls } from "../../../utils/styles";
import SeverityBadge from "../../../components/SeverityBadge";

interface Props {
  scans: Scan[];
  projectMap: Record<string, Project>;
  onViewAll: () => void;
  onViewScan: (id: string) => void;
}

export default function RecentScans({ scans, projectMap, onViewAll, onViewScan }: Props) {
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Recent Security Scans</h2>
        <button onClick={onViewAll} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">View all</button>
      </div>
      {scans.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No scans yet</p>
      ) : (
        <div className="divide-y divide-border">
          {scans.map((s) => {
            const proj = projectMap[s.projectId];
            const statusDot = s.status === "completed" ? (s.summary?.totalFindings === 0 ? "bg-success-500" : s.summary?.errors > 0 ? "bg-danger-500" : "bg-warning-500") : s.status === "failed" ? "bg-danger-500" : "bg-primary-500";
            return (
              <button key={s.id} type="button" onClick={() => onViewScan(s.id)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-secondary-50/50 transition-colors text-left">
                <span className={`size-2  rounded-full shrink-0 ${statusDot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text truncate">{proj?.name || s.repo}</p>
                  <p className="text-xs text-text-muted">{s.branch} · {new Date(s.createdAt).toLocaleDateString()}</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
