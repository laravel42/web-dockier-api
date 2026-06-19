import ProjectTechBadges from "../../../components/ProjectTechBadges";
import BranchCommitLabel from "../../../components/BranchCommitLabel";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import { tableCellCls, tableCellMutedCls, typeCardDateCls } from "../../../utils/styles";
import { formatCardDateTime } from "../../../utils/formatCardDate";
import type { Scan, Project, TechBadgeInfo } from "../../../types";
import { compareByTime, getSortTimestamp } from "../../../utils/sortByTime";
import { isScanSecurityClean, scanHasSecurityErrors, scanSecurityFindingCount } from "../../../utils/scanSummary";

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
    if (summary && isScanSecurityClean(summary)) return "bg-success-500";
    if (summary && scanHasSecurityErrors(summary)) return "bg-danger-500";
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
            emptyPlaceholder={<span className="text-ui-sm text-text-muted">—</span>}
          />
        );

        if (!hasScans) {
          return (
            <tr key={projectId} onClick={() => onSelectEmpty(projectId)} className={tableRowCls}>
              <td className={`${tableCellCls} font-medium`}>{project?.name || projectId.slice(0, 8)}</td>
              <td>{techCell}</td>
              <td>
                {project?.branch ? (
                  <BranchCommitLabel branch={project.branch} onClick={() => onSelectEmpty(projectId)} />
                ) : (
                  <span className="text-ui-sm text-text-muted">—</span>
                )}
              </td>
              <td className={tableCellMutedCls}>0</td>
              <td>
                <span className="text-ui-sm text-text-muted">Not scanned yet</span>
              </td>
              <td>
                <span className="text-ui-sm text-text-muted">—</span>
              </td>
            </tr>
          );
        }

        const sorted = [...projectScans].sort((a, b) => compareByTime(a, b, "updated"));
        const latest = sorted[0];
        const latestCompleted = sorted.find((s) => s.status === "completed");
        const summary = latestCompleted?.summary;

        return (
          <tr key={projectId} onClick={() => onSelectScan(latest.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>{project?.name || projectId.slice(0, 8)}</td>
            <td>{techCell}</td>
            <td>
              {project?.branch ? (
                <BranchCommitLabel
                  branch={project.branch}
                  commit={latest.commitSha || undefined}
                  onClick={() => onSelectScan(latest.id)}
                />
              ) : (
                <span className="text-ui-sm text-text-muted">—</span>
              )}
            </td>
            <td className={tableCellMutedCls}>{sorted.length}</td>
            <td className={`${tableCellMutedCls} tabular-nums`}>
              {summary != null ? scanSecurityFindingCount(summary) : "—"}
            </td>
            <td>
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full shrink-0 ${getScanStatusDot(latest, summary)}`} />
                <span className={typeCardDateCls}>
                  {formatCardDateTime(getSortTimestamp(latest, "updated"))}
                </span>
              </div>
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
