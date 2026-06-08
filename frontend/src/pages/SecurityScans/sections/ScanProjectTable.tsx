import ProjectTechBadges from "../../../components/ProjectTechBadges";
import SeverityBadge from "../../../components/SeverityBadge";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import { chipCls } from "../../../utils/styles";
import type { Scan, Project, TechBadgeInfo } from "../../../types";

interface Props {
  sortedProjectIds: string[];
  grouped: Record<string, Scan[]>;
  projects: Record<string, Project>;
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
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
  projectLangs,
  projectBadgeLoading,
  onSelectScan,
  onSelectEmpty,
}: Props) {
  return (
    <DataTable columns={["Name", "Tech", "Branch", "Scans", "Findings", "Last scan"]}>
      {sortedProjectIds.map((projectId) => {
        const project = projects[projectId];
        const projectScans = grouped[projectId];
        const hasScans = projectScans && projectScans.length > 0;
        const badges = projectLangs[projectId];

        const techCell = (
          <ProjectTechBadges
            badges={badges}
            loading={projectBadgeLoading.has(projectId)}
            platform={project?.platform}
            limit={3}
            emptyPlaceholder={<span className="text-xs text-text-muted">—</span>}
          />
        );

        if (!hasScans) {
          return (
            <tr key={projectId} onClick={() => onSelectEmpty(projectId)} className={tableRowCls}>
              <td className="px-4 py-3 font-medium text-text">{project?.name || projectId.slice(0, 8)}</td>
              <td className="px-4 py-3">{techCell}</td>
              <td className="px-4 py-3">
                {project?.branch ? <span className={chipCls}>{project.branch}</span> : <span className="text-xs text-text-muted">—</span>}
              </td>
              <td className="px-4 py-3 text-text-muted">0</td>
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
          <tr key={projectId} onClick={() => onSelectScan(latest.id)} className={tableRowCls}>
            <td className="px-4 py-3 font-medium text-text">{project?.name || projectId.slice(0, 8)}</td>
            <td className="px-4 py-3">{techCell}</td>
            <td className="px-4 py-3">
              {project?.branch ? <span className={chipCls}>{project.branch}</span> : <span className="text-xs text-text-muted">—</span>}
            </td>
            <td className="px-4 py-3 text-text-muted">{sorted.length}</td>
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
                <span className={`size-2 rounded-full shrink-0 ${getScanStatusDot(latest, summary)}`} />
                <span className="text-xs text-text-muted">
                  {new Date(latest.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
