import { Link } from "react-router-dom";
import TechCell from "@/components/TechCell";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import DataTable, { tableRowCls } from "@/components/ui/DataTable";
import { tableCellCls, tableCellMutedCls, typeCardDateCls, tableRowLinkCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import type { Scan, Project, TechBadgeInfo } from "@/types";
import { compareByTime, getSortTimestamp } from "@/utils/sortByTime";
import { failedScanDotClass, scanFindingSeverityDotClass, scanSecurityFindingCount } from "@/utils/scanSummary";

interface Props {
  sortedProjectIds: string[];
  grouped: Record<string, Scan[]>;
  /** All of each project's scans; `grouped` holds only the newest page. */
  scanCounts: Record<string, number>;
  projects: Record<string, Project>;
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelectScan: (scanId: string) => void;
  onSelectEmpty: (projectId: string) => void;
}

function getScanStatusDot(latest: Scan, summary: Scan["summary"] | undefined): string {
  if (latest.status === "completed") return scanFindingSeverityDotClass(summary);
  if (latest.status === "failed") return failedScanDotClass(latest.summary);
  if (latest.status === "running") return "bg-primary-500";
  return "bg-secondary-400";
}

export default function ScanProjectTable({
  sortedProjectIds,
  grouped,
  scanCounts,
  projects,
  projectLangs,
  projectBadgeLoading,
  onSelectScan,
  onSelectEmpty,
}: Props) {
  return (
    <DataTable label="Security scans by project" columns={["Name", "Tech", "Branch", "Scans", "Findings", "Last scan"]}>
      {sortedProjectIds.map((projectId) => {
        const project = projects[projectId];
        const projectScans = grouped[projectId];
        const hasScans = projectScans && projectScans.length > 0;

        const techCell = (
          <TechCell
            projectId={projectId}
            projectLangs={projectLangs}
            projectBadgeLoading={projectBadgeLoading}
            platform={project?.platform}
          />
        );

        if (!hasScans) {
          return (
            <tr key={projectId} onClick={() => onSelectEmpty(projectId)} className={tableRowCls}>
              <td className={`${tableCellCls} font-medium`}>
                <Link to={`/security/project/${projectId}`} onClick={(e) => e.stopPropagation()} className={tableRowLinkCls}>
                  {project?.name || projectId.slice(0, 8)}
                </Link>
              </td>
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
        // The row opens `latest`, which may still be running — say so rather
        // than passing an older scan's count off as this one's.
        const findingsTitle =
          latestCompleted && latestCompleted.id !== latest.id
            ? `From the last completed scan (${formatCardDateTime(getSortTimestamp(latestCompleted, "updated"))})`
            : undefined;

        return (
          <tr key={projectId} onClick={() => onSelectScan(latest.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>
              <Link to={`/security/${latest.id}`} onClick={(e) => e.stopPropagation()} className={tableRowLinkCls}>
                {project?.name || projectId.slice(0, 8)}
              </Link>
            </td>
            <td>{techCell}</td>
            <td>
              {project?.branch ? (
                <BranchCommitLabel
                  branch={project.branch}
                  onClick={() => onSelectScan(latest.id)}
                />
              ) : (
                <span className="text-ui-sm text-text-muted">—</span>
              )}
            </td>
            <td className={tableCellMutedCls}>{scanCounts[projectId] ?? sorted.length}</td>
            <td className={`${tableCellMutedCls} tabular-nums`} title={findingsTitle}>
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
