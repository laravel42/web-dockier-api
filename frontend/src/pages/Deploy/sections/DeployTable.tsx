import { Link } from "react-router-dom";
import TechCell from "@/components/TechCell";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { getRepoSlug } from "@/utils/parseOwnerRepo";
import {
  tableCellCls,
  tableCellMutedCls,
  typeCardDateCls,
  tableRowLinkCls,
} from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import DataTable, { tableRowCls } from "@/components/ui/DataTable";
import type { Deployment, TechBadgeInfo } from "@/types";
import type { DeployListProject } from "../useDeploy";
import { compareByTime, getSortTimestamp } from "@/utils/sortByTime";
import { projectInfraDotClass } from "@/utils/projectInfraDot";

interface Props {
  grouped: Array<[string, Deployment[]]>;
  projectById: Record<string, DeployListProject>;
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  onSelect: (deployId: string) => void;
}

export default function DeployTable({ grouped, projectById, projectLangs, projectBadgeLoading, onSelect }: Props) {
  return (
    <DataTable label="Deployments" columns={["Name", "Repository", "Branch", "Deploys", "Tech", "Last deploy"]}>
      {grouped.map(([groupKey, repoDeploys]) => {
        const proj = projectById[groupKey];
        const sorted = [...repoDeploys].sort((a, b) => compareByTime(a, b, "updated"));
        const latest = sorted[0];
        const repoLabel = proj?.repository ? getRepoSlug(proj.repository) : latest.repo;

        return (
          <tr key={groupKey} onClick={() => onSelect(latest.id)} className={tableRowCls}>
            <td className={`${tableCellCls} font-medium`}>
              <Link to={`/deploy/${latest.id}`} onClick={(e) => e.stopPropagation()} className={tableRowLinkCls}>
                {proj?.name || latest.repo}
              </Link>
            </td>
            <td className={`${tableCellMutedCls} lowercase`}>{repoLabel}</td>
            <td>
              <BranchCommitLabel
                branch={latest.branch}
                onClick={() => onSelect(latest.id)}
              />
            </td>
            <td className={tableCellMutedCls}>{sorted.length}</td>
            <td>
              <TechCell
                projectId={proj?.id ?? ""}
                projectLangs={projectLangs}
                projectBadgeLoading={projectBadgeLoading}
                platform={proj?.platform}
              />
            </td>
            <td>
              <div className="flex items-center gap-1.5">
                {/* Deployment rows carry no infra state, so the dot falls back to deploy status. */}
                <span className={`size-2 rounded-full shrink-0 ${projectInfraDotClass(undefined, latest.status)}`} />
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
