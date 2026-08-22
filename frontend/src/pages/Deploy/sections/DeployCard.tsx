import type { Deployment, Project, TechBadgeInfo } from "@/types";
import ProjectTechBadges from "@/components/ProjectTechBadges";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { cardInteractiveCls, typeCardDateCls, typeCardMeta, typeCardTitle } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { compareByTime, getSortTimestamp } from "@/utils/sortByTime";
import RocketIcon from "@/components/icons/outlined/RocketIcon";
import { clickableProps } from "@/utils/a11y";
import { projectInfraDotClass } from "@/utils/projectInfraDot";

interface Props {
  repo: string;
  deploys: Deployment[];
  project: Project | undefined;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onClick: () => void;
}

export default function DeployCard({ repo, deploys, project, badges, badgeLoading, onClick }: Props) {
  const sorted = [...deploys].sort((a, b) => compareByTime(a, b, "updated"));
  const latest = sorted[0];
  const statusDot = projectInfraDotClass(project?.infraState, latest.status);

  return (
    <div {...clickableProps(onClick)} className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <RocketIcon className="size-5 shrink-0 text-primary-500" />
        <span className={`${typeCardMeta} truncate`}>
          {sorted.length} deploy{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className={`${typeCardTitle} truncate`}>{project?.name || repo}</h3>
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
        <BranchCommitLabel
          branch={latest.branch}
          onClick={onClick}
        />
      </div>
    </div>
  );
}
