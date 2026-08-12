import ProjectTechBadges from "@/components/ProjectTechBadges";
import ProjectAvatar from "@/components/ProjectAvatar";
import DevIcon from "@/components/DevIcon";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { getRepoSlug } from "@/utils/parseOwnerRepo";
import { cardInteractiveCls, typeCardDateCls, typeCardTitle } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import type { Project, TechBadgeInfo } from "@/types";

interface Props {
  project: Project;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  repoFaviconUrl?: string;
  onSelect: (id: string) => void;
}

function getGitProvider(repository: string): string {
  if (repository.includes("gitlab")) return "gitlab";
  if (repository.includes("bitbucket")) return "bitbucket";
  return "github";
}

export default function ProjectCard({ project: p, badges, badgeLoading, repoFaviconUrl, onSelect }: Props) {
  const provider = p.repository ? getGitProvider(p.repository) : "github";

  return (
    <div
      onClick={() => onSelect(p.id)}
      className={`${cardInteractiveCls} p-4 flex flex-col gap-3`}
    >
      {/* Header: avatar + title */}
      <div className="flex items-center gap-3 min-w-0">
        <ProjectAvatar project={p} size="sm" repoFaviconUrl={repoFaviconUrl} />
        <h3 className={`${typeCardTitle} truncate`}>{p.name}</h3>
      </div>

      {/* Repository & tech badges */}
      <div className="min-w-0">
        <div className="pb-1.5 flex items-center gap-1.5 min-w-0">
          <DevIcon src={provider} alt={provider} className="size-4 shrink-0" />
          <span className="text-sm text-text-muted truncate">{p.repository ? getRepoSlug(p.repository) : "—"}</span>
        </div>
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
        <span className={typeCardDateCls}>
          Created: {formatCardDateTime(p.createdAt)}
        </span>
        <BranchCommitLabel branch={p.branch || "main"} commit={p.lastCommitHash || undefined} onClick={() => onSelect(p.id)} />
      </div>
    </div>
  );
}
