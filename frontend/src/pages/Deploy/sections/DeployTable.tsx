import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import {
  chipCls,
  statusDotColors as statusColors,
  tableCellCls,
  tableCellMutedCls,
} from "../../../utils/styles";
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
              <span className={chipCls}>{latest.branch}</span>
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
                <span className="text-ui-sm text-text-muted">
                  {new Date(getSortTimestamp(latest, "updated")).toLocaleString(undefined, {
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
