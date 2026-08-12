import ProjectTechBadges from "@/components/ProjectTechBadges";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { cardInteractiveCls, typeCardDateCls, typeCardMeta, typeCardTitle } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { compareByTime, getSortTimestamp } from "@/utils/sortByTime";
import { isScanSecurityClean, scanHasSecurityErrors } from "@/utils/scanSummary";
import type { Scan, Project, TechBadgeInfo } from "@/types";
import { ShieldCheckIcon } from "lucide-react";
import { clickableProps } from "@/utils/a11y";

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
  const isClean = summary ? isScanSecurityClean(summary) : false;

  const statusDot =
    latest.status === "completed"
      ? isClean
        ? "bg-success-500"
        : summary && scanHasSecurityErrors(summary)
          ? "bg-danger-500"
          : "bg-warning-500"
      : latest.status === "failed"
        ? "bg-danger-500"
        : latest.status === "running"
          ? "bg-primary-500"
          : "bg-secondary-400";

  return (
    <div {...clickableProps(() => onSelect(latest.id))} className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}>
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
          <span className={typeCardDateCls}>
            {formatCardDateTime(getSortTimestamp(latest, "updated"))}
          </span>
        </div>
        {project?.branch && (
          <BranchCommitLabel
            branch={project.branch}
            commit={latest.commitSha || undefined}
            onClick={() => onSelect(latest.id)}
          />
        )}
      </div>
    </div>
  );
}
