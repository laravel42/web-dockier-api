import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { cardInteractiveCls, chipCls, typeCardMeta, typeCardTitle } from "../../../utils/styles";
import { compareByTime, getSortTimestamp } from "../../../utils/sortByTime";
import type { Scan, Project, TechBadgeInfo } from "../../../types";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  project: Project | undefined;
  projectId: string;
  scans: Scan[];
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onSelect: (scanId: string) => void;
}

export default function ScanProjectCard({ project, projectId, scans, badges, badgeLoading, onSelect }: Props) {
  const sorted = [...scans].sort((a, b) => compareByTime(a, b, "updated"));
  const latest = sorted[0];
  const latestCompleted = sorted.find((s) => s.status === "completed");
  const summary = latestCompleted?.summary;
  const isClean = summary && summary.totalFindings === 0;

  const statusDot =
    latest.status === "completed"
      ? isClean
        ? "bg-success-500"
        : summary && summary.errors > 0
          ? "bg-danger-500"
          : "bg-warning-500"
      : latest.status === "failed"
        ? "bg-danger-500"
        : latest.status === "running"
          ? "bg-primary-500"
          : "bg-secondary-400";

  return (
    <div onClick={() => onSelect(latest.id)} className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <ShieldCheckIcon className="size-5 shrink-0 text-primary-500" />
        <span className={`${typeCardMeta} truncate`}>
          {sorted.length} scan{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className={`${typeCardTitle} truncate`}>{project?.name || projectId.slice(0, 8)}</h3>
        <ProjectTechBadges
          badges={badges}
          loading={badgeLoading}
          platform={project?.platform}
          limit={4}
          className="mt-1.5"
        />
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-xs text-text-muted">
            {new Date(getSortTimestamp(latest, "updated")).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        {project?.branch && (
          <span className={chipCls}>
            <LinkIcon className="size-3" strokeWidth={2} />
            {project.branch}
          </span>
        )}
      </div>
    </div>
  );
}
