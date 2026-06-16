import ProjectTechBadges from "../../../components/ProjectTechBadges";
import BranchCommitLabel from "../../../components/BranchCommitLabel";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import {
  statusDotColors as statusColors,
  tableCellCls,
  tableCellMutedCls,
  typeCardDateCls,
} from "../../../utils/styles";
import { formatCardDateTime } from "../../../utils/formatCardDate";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import type { Deployment, Project, TechBadgeInfo } from "../../../types";
import { compareByTime, getSortTimestamp } from "../../../utils/sortByTime";

interface Props {
  grouped: Array<[string, Deployment[]]>;
  projectById: Record<string, Project>;
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelect: (deployId: string) => void;
}

export default function DeployTable({ grouped, projectById, projectLangs, projectBadgeLoading, onSelect }: Props) {
  return (
    <DataTable columns={["Name", "Repository", "Branch", "Deploys", "Tech", "Last deploy"]}>
      {grouped.map(([groupKey, repoDeploys]) => {
        const proj = projectById[groupKey];
        const sorted = [...repoDeploys].sort((a, b) => compareByTime(a, b, "updated"));
        const latest = sorted[0];
        const badges = proj ? projectLangs[proj.id] : undefined;
        const repoLabel = proj?.repository ? getRepoSlug(proj.repository) : latest.repo;

        return (
          <tr key={groupKey} onClick={() => onSelect(latest.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>{proj?.name || latest.repo}</td>
            <td className={`${tableCellMutedCls} lowercase`}>{repoLabel}</td>
            <td>
              <BranchCommitLabel
                branch={latest.branch}
                commit={latest.commitHash || proj?.lastCommitHash || undefined}
                onClick={() => onSelect(latest.id)}
              />
            </td>
            <td className={tableCellMutedCls}>{sorted.length}</td>
            <td>
              <ProjectTechBadges
                badges={badges}
                loading={proj ? projectBadgeLoading.has(proj.id) : false}
                platform={proj?.platform}
                limit={3}
                emptyPlaceholder={<span className="text-ui-sm text-text-muted">—</span>}
              />
            </td>
            <td>
              <div className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full shrink-0 ${statusColors[latest.status] || "bg-text-muted"}`} />
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
