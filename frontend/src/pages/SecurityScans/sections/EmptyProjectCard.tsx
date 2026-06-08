import ProjectTechBadges from "../../../components/ProjectTechBadges";
import { cardInteractiveCls, chipCls, typeCardMeta, typeCardTitle } from "../../../utils/styles";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import type { Project, TechBadgeInfo } from "../../../types";

interface Props {
  project: Project | undefined;
  projectId: string;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onSelect: () => void;
}

export default function EmptyProjectCard({ project, projectId, badges, badgeLoading, onSelect }: Props) {
  return (
    <div onClick={onSelect} className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <ShieldCheckIcon className="size-5 shrink-0 text-text-muted" />
        <span className={`${typeCardMeta} truncate`}>No scans</span>
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
          <span className="size-2 rounded-full shrink-0 bg-secondary-400" />
          <span className="text-xs text-text-muted">Not scanned yet</span>
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
