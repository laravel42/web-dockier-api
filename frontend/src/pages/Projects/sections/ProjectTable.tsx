import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TechCell from "@/components/TechCell";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { getRepoSlug } from "@/utils/parseOwnerRepo";
import { tableCellCls, tableCellMutedCls, typeCardDateCls, tableRowLinkCls } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import DataTable, { tableRowCls, type ColumnDef, type SortState } from "@/components/ui/DataTable";
import { DeploySignal, SecuritySignal } from "./ProjectSignals";
import type { ScanActivity } from "../useProjectActivity";
import type { Project, TechBadgeInfo, Deployment } from "@/types";

interface Props {
  projects: Project[];
  projectLangs: Record<string, TechBadgeInfo[]>;
  projectBadgeLoading: ReadonlySet<string>;
  deployByProject: Record<string, Deployment>;
  scanByProject: Record<string, ScanActivity>;
  onSelect: (id: string) => void;
}

const COLUMNS: (string | ColumnDef)[] = [
  { label: "Name", sortKey: "name" },
  { label: "Repository", sortKey: "repository" },
  { label: "Branch", sortKey: "branch" },
  "Tech",
  { label: "Deploy", sortKey: "deploy" },
  { label: "Security", sortKey: "security" },
  { label: "Created", sortKey: "created" },
];

export default function ProjectTable({
  projects,
  projectLangs,
  projectBadgeLoading,
  deployByProject,
  scanByProject,
  onSelect,
}: Props) {
  // Table-local sort. null = the caller's default (attention-first) order; a
  // header cycles asc → desc → back to default.
  const [sort, setSort] = useState<SortState | null>(null);
  const toggleSort = (key: string) =>
    setSort((prev) =>
      !prev || prev.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null,
    );

  const sorted = useMemo(() => {
    if (!sort) return projects;
    const slug = (p: Project) => (p.repository ? getRepoSlug(p.repository) : "");
    const deployTs = (p: Project) => {
      const d = deployByProject[p.id];
      return d ? Date.parse(d.updatedAt || d.createdAt) || 0 : 0;
    };
    // Deploy sorts by status — grouping deployed / in progress / failed / torn
    // down / not deployed — with recency only as the within-group tie-breaker.
    const deployRank = (p: Project) => {
      const status = deployByProject[p.id]?.status;
      if (status === "success" || p.infraState === "live") return 0; // deployed / live
      if (status === "building" || status === "deploying" || status === "pending") return 1; // in progress
      if (status === "failed") return 2; // failed
      if (status === "destroyed" || status === "cancelled") return 3; // torn down / cancelled
      return 4; // not deployed
    };
    // Scanned projects rank by errors then warnings; unscanned sort to the
    // "fewest issues" end — nothing is known against them.
    const issueVal = (p: Project) => {
      const c = scanByProject[p.id]?.latestCompleted?.summary;
      return c ? c.errors * 10000 + c.warnings : -1;
    };
    const cmps: Record<string, (a: Project, b: Project) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      repository: (a, b) => slug(a).localeCompare(slug(b)),
      branch: (a, b) => (a.branch || "main").localeCompare(b.branch || "main"),
      created: (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
      deploy: (a, b) => deployRank(a) - deployRank(b) || deployTs(b) - deployTs(a),
      security: (a, b) => issueVal(a) - issueVal(b),
    };
    const cmp = cmps[sort.key];
    if (!cmp) return projects;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...projects].sort((a, b) => cmp(a, b) * dir);
  }, [projects, sort, deployByProject, scanByProject]);

  return (
    <DataTable label="Projects" columns={COLUMNS} sort={sort} onSort={toggleSort}>
      {sorted.map((p) => (
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
          <td className={tableCellCls}>
            <div className="min-w-40">
              <DeploySignal deploy={deployByProject[p.id]} infraState={p.infraState} />
            </div>
          </td>
          <td className={tableCellCls}>
            <div className="min-w-40">
              <SecuritySignal scan={scanByProject[p.id]} />
            </div>
          </td>
          <td className={typeCardDateCls}>{formatCardDateTime(p.createdAt)}</td>
        </tr>
      ))}
    </DataTable>
  );
}
