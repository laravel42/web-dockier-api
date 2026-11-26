import ProjectTechBadges from "@/components/ProjectTechBadges";
import ProjectAvatar from "@/components/ProjectAvatar";
import DevIcon from "@/components/DevIcon";
import BranchCommitLabel from "@/components/BranchCommitLabel";
import { getRepoSlug } from "@/utils/parseOwnerRepo";
import { cardInteractiveCls, typeCardDateCls, typeCardTitle } from "@/utils/styles";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { DeployTile, SecurityTile } from "./ProjectSignals";
import type { ScanActivity } from "../useProjectActivity";
import type { Project, TechBadgeInfo, Deployment } from "@/types";
import { clickableProps } from "@/utils/a11y";

interface Props {
  project: Project;
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  repoFaviconUrl?: string;
  deploy?: Deployment;
  scan?: ScanActivity;
  onSelect: (id: string) => void;
  /** Deep-link for the Security tile (the project's scan findings). */
  onOpenSecurity?: (id: string) => void;
}

function getGitProvider(repository: string): string {
  if (repository.includes("gitlab")) return "gitlab";
  if (repository.includes("bitbucket")) return "bitbucket";
  return "github";
}

export default function ProjectCard({ project: p, badges, badgeLoading, repoFaviconUrl, deploy, scan, onSelect, onOpenSecurity }: Props) {
  const provider = p.repository ? getGitProvider(p.repository) : "github";

  return (
    <div
      {...clickableProps(() => onSelect(p.id))}
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

      {/* Deploy + security signal tiles, then created + branch — pinned to the bottom */}
      <div className="mt-auto flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <DeployTile deploy={deploy} infraState={p.infraState} onClick={() => onSelect(p.id)} />
          <SecurityTile scan={scan} onClick={onOpenSecurity ? () => onOpenSecurity(p.id) : undefined} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={typeCardDateCls}>
            Created: {formatCardDateTime(p.createdAt)}
          </span>
          <BranchCommitLabel branch={p.branch || "main"} onClick={() => onSelect(p.id)} />
        </div>
      </div>
    </div>
  );
}
