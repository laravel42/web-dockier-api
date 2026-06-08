import type { Deployment, Project, TechBadgeInfo } from "../../../types";
import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { cardInteractiveCls, chipCls, typeCardMeta, typeCardTitle } from "../../../utils/styles";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  repo: string;
  deploys: Deployment[];
  project: Project | undefined;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onClick: () => void;
}

export default function DeployCard({ repo, deploys, project, badges, badgeLoading, onClick }: Props) {
  const sorted = deploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latest = sorted[0];
  const statusDot =
    latest.status === "success"
      ? "bg-success-500"
      : latest.status === "failed"
        ? "bg-danger-500"
        : latest.status === "building" || latest.status === "deploying"
          ? "bg-primary-500"
          : "bg-secondary-400";

  return (
    <div onClick={onClick} className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}>
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
          <span className="text-xs text-text-muted">
            {new Date(latest.createdAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        <span className={chipCls}>
          <LinkIcon className="size-3" />
          {latest.branch}
        </span>
      </div>
    </div>
  );
}
