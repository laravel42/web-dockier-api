import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import { chipCls, tableCellCls, tableCellMutedCls } from "../../../utils/styles";
import DataTable, { tableRowCls } from "../../../components/ui/DataTable";
import type { Project, TechBadgeInfo } from "../../../types";

interface Props {
  projects: Project[];
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelect: (id: string) => void;
}

export default function ProjectTable({ projects, projectLangs, projectBadgeLoading, onSelect }: Props) {
  return (
    <DataTable columns={["Name", "Repository", "Branch", "Tech", "Created"]}>
      {projects.map((p) => {
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
            <td className="text-ui-sm text-text-muted">
              {new Date(p.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
