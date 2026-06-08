import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import { statusDotColors as statusColors } from "../../../utils/styles";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import { chipCls } from "../../../utils/styles";
import type { Deployment, Project, TechBadgeInfo } from "../../../types";

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
        const sorted = [...repoDeploys].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        const latest = sorted[0];
        const badges = proj ? projectLangs[proj.id] : undefined;
        const repoLabel = proj?.repository ? getRepoSlug(proj.repository) : latest.repo;

        return (
          <tr key={groupKey} onClick={() => onSelect(latest.id)} className={tableRowCls}>
            <td className="px-4 py-3 font-medium text-text">{proj?.name || latest.repo}</td>
            <td className="px-4 py-3 text-text-muted lowercase">{repoLabel}</td>
            <td className="px-4 py-3">
              <span className={chipCls}>{latest.branch}</span>
            </td>
            <td className="px-4 py-3 text-text-muted">{sorted.length}</td>
            <td className="px-4 py-3">
              <ProjectTechBadges
                badges={badges}
                loading={proj ? projectBadgeLoading.has(proj.id) : false}
                platform={proj?.platform}
                limit={3}
                emptyPlaceholder={<span className="text-xs text-text-muted">—</span>}
              />
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full shrink-0 ${statusColors[latest.status] || "bg-text-muted"}`} />
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
