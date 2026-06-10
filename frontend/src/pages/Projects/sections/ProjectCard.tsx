import ProjectTechBadges from "../../../components/ProjectTechBadges";
import SourceControlBadge from "../../../components/SourceControlBadge";
import { getRepoSlug, getRepoKey } from "../../../utils/parseOwnerRepo";
import { cardInteractiveCls, chipCls, statusDotColors as statusColors, typeCardTitle } from "../../../utils/styles";
import type { Project, TechBadgeInfo } from "../../../types";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Deploy {
  id: string;
  repo: string;
  branch: string;
  status: string;
  createdAt: string;
}

interface Props {
  project: Project;
  deployments: Deploy[];
  badges: TechBadgeInfo[] | undefined;
  badgeLoading?: boolean;
  onSelect: (id: string) => void;
}

export default function ProjectCard({ project: p, deployments, badges, badgeLoading, onSelect }: Props) {
  const repoKey = p.repository ? getRepoKey(p.repository) : null;
  const lastDeploy = repoKey
    ? deployments
        .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
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

      {/* Last deploy + branch */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          {lastDeploy ? (
            <>
              <span className={`size-2.5  rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
              <span className="text-xs text-text-muted">
                Last deploy: {new Date(lastDeploy.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">No deployments yet</span>
          )}
        </div>
        <span className={chipCls}>
          <LinkIcon className="size-3" strokeWidth={2} />
          {p.branch || "main"}
        </span>
      </div>
    </div>
  );
}
