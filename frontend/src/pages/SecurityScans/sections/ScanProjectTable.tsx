import SeverityBadge from "../../../components/SeverityBadge";
import type { Scan, Project } from "../../../types";

interface Props {
  sortedProjectIds: string[];
  grouped: Record<string, Scan[]>;
  projects: Record<string, Project>;
  onSelectScan: (scanId: string) => void;
  onSelectEmpty: (projectId: string) => void;
}

function getScanStatusDot(latest: Scan, summary: Scan["summary"] | undefined): string {
  if (latest.status === "completed") {
    if (summary && summary.totalFindings === 0) return "bg-success-500";
    if (summary && summary.errors > 0) return "bg-danger-500";
    return "bg-warning-500";
  }
  if (latest.status === "failed") return "bg-danger-500";
  if (latest.status === "running") return "bg-primary-500";
  return "bg-secondary-400";
}

export default function ScanProjectTable({
  sortedProjectIds,
  grouped,
  projects,
  onSelectScan,
  onSelectEmpty,
}: Props) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-card)] overflow-hidden shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Scans</th>
            <th className="px-4 py-3 font-medium">Findings</th>
            <th className="px-4 py-3 font-medium">Last Scan</th>
          </tr>
        </thead>
        <tbody>
          {sortedProjectIds.map((projectId) => {
            const project = projects[projectId];
            const projectScans = grouped[projectId];
            const hasScans = projectScans && projectScans.length > 0;

            if (!hasScans) {
              return (
                <tr
                  key={projectId}
                  onClick={() => onSelectEmpty(projectId)}
                  className="border-b border-border last:border-0 hover:bg-secondary-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-text">{project?.name || projectId.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    {project?.branch ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted">
                        {project.branch}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">0</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-muted">Not scanned yet</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-muted">—</span>
                  </td>
                </tr>
              );
            }

            const sorted = [...projectScans].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            const latest = sorted[0];
            const latestCompleted = sorted.find((s) => s.status === "completed");
            const summary = latestCompleted?.summary;

            return (
              <tr
                key={projectId}
                onClick={() => onSelectScan(latest.id)}
                className="border-b border-border last:border-0 hover:bg-secondary-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-text">{project?.name || projectId.slice(0, 8)}</td>
                <td className="px-4 py-3">
                  {project?.branch ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted">
                      {project.branch}
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{sorted.length}</td>
                <td className="px-4 py-3">
                  {summary && summary.totalFindings > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {summary.errors > 0 && <SeverityBadge severity="error" count={summary.errors} />}
                      {summary.warnings > 0 && <SeverityBadge severity="warning" count={summary.warnings} />}
                      {summary.infos > 0 && <SeverityBadge severity="info" count={summary.infos} />}
                    </div>
                  ) : summary && summary.totalFindings === 0 ? (
                    <SeverityBadge severity="clean" label="Clean" />
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${getScanStatusDot(latest, summary)}`} />
                    <span className="text-xs text-text-muted">
                      {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
