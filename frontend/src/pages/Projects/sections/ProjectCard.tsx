import ProjectTechBadges from "../../../components/ProjectTechBadges";
import SourceControlBadge from "../../../components/SourceControlBadge";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import { cardInteractiveCls, chipCls, typeCardTitle } from "../../../utils/styles";
import type { Project, TechBadgeInfo } from "../../../types";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  project: Project;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onSelect: (id: string) => void;
}

export default function ProjectCard({ project: p, badges, badgeLoading, onSelect }: Props) {
  const scProvider = p.repository?.includes("gitlab") ? "gitlab" : p.repository?.includes("bitbucket") ? "bitbucket" : "github";

  return (
    <div
      onClick={() => onSelect(p.id)}
      className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}
    >
      {/* Header: icon, slug */}
      <div className="flex items-center gap-3 min-w-0">
        <SourceControlBadge provider={scProvider} showName={false} iconSize="w-6 h-6" />
        <span className="text-sm text-text-muted truncate lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</span>
      </div>

      {/* Title & tech badges */}
      <div className="min-w-0">
        <h3 className={`${typeCardTitle} truncate`}>{p.name}</h3>
        <ProjectTechBadges
          badges={badges}
          loading={badgeLoading}
          platform={p.platform}
          limit={4}
          className="mt-1.5"
        />
      </div>

      {/* Created + branch */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="text-xs text-text-muted">
          Created: {new Date(p.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className={chipCls}>
          <LinkIcon className="size-3" strokeWidth={2} />
          {p.branch || "main"}
        </span>
      </div>
    </div>
  );
}
