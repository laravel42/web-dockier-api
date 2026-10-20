import { Link } from "react-router-dom";
import TechCell from "@/components/TechCell";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { getRepoSlug } from "@/utils/parseOwnerRepo";
import { tableCellCls, tableCellMutedCls, typeCardDateCls, tableRowLinkCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import DataTable, { tableRowCls } from "@/components/ui/DataTable";
import type { Project, TechBadgeInfo } from "@/types";

interface Props {
  projects: Project[];
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelect: (id: string) => void;
}

export default function ProjectTable({ projects, projectLangs, projectBadgeLoading, onSelect }: Props) {
  return (
    <DataTable label="Projects" columns={["Name", "Repository", "Branch", "Tech", "Created"]}>
      {projects.map((p) => {
        return (
          <tr key={p.id} onClick={() => onSelect(p.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>
              <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className={tableRowLinkCls}>
                {p.name}
              </Link>
            </td>
            <td className={`${tableCellMutedCls} lowercase`}>{p.repository ? getRepoSlug(p.repository) : "—"}</td>
            <td>
              <BranchCommitLabel branch={p.branch || "main"} onClick={() => onSelect(p.id)} />
            </td>
            <td>
              <TechCell
                projectId={p.id}
                projectLangs={projectLangs}
                projectBadgeLoading={projectBadgeLoading}
                platform={p.platform}
              />
            </td>
            <td className={typeCardDateCls}>
              {formatCardDateTime(p.createdAt)}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
