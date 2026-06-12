import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { getRepoSlug, getRepoKey } from "../../../utils/parseOwnerRepo";
import { chipCls, statusDotColors as statusColors, tableCellCls, tableCellMutedCls } from "../../../utils/styles";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import type { Project, TechBadgeInfo } from "../../../types";

interface Deploy {
  id: string;
  repo: string;
  branch: string;
  status: string;
  createdAt: string;
}

interface Props {
  projects: Project[];
  deployments: Deploy[];
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelect: (id: string) => void;
}

export default function ProjectTable({ projects, deployments, projectLangs, projectBadgeLoading, onSelect }: Props) {
  return (
    <DataTable columns={["Name", "Repository", "Branch", "Tech", "Last deploy"]}>
      {projects.map((p) => {
        const repoKey = p.repository ? getRepoKey(p.repository) : null;
        const lastDeploy = repoKey
          ? deployments
              .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
          : null;
        const badges = projectLangs[p.id];
        return (
          <tr key={p.id} onClick={() => onSelect(p.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>{p.name}</td>
            <td className={`${tableCellMutedCls} lowercase`}>{p.repository ? getRepoSlug(p.repository) : "—"}</td>
            <td>
              <span className={chipCls}>{p.branch || "main"}</span>
            </td>
            <td>
              <ProjectTechBadges
                badges={badges}
                loading={projectBadgeLoading.has(p.id)}
                platform={p.platform}
                limit={3}
                emptyPlaceholder={<span className="text-ui-sm text-text-muted">—</span>}
              />
            </td>
            <td>
              {lastDeploy ? (
                <div className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
                  <span className="text-ui-sm text-text-muted">
                    {new Date(lastDeploy.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ) : (
                <span className="text-ui-sm text-text-muted">—</span>
              )}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
