import TechBadge from "../../../components/TechBadge";
import PlatformBadge from "../../../components/PlatformBadge";
import SourceControlBadge from "../../../components/SourceControlBadge";
import { getRepoSlug, getRepoKey } from "../../../utils/parseOwnerRepo";
import { statusDotColors as statusColors } from "../../../utils/styles";
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
  onSelect: (id: string) => void;
}

export default function ProjectCard({ project: p, deployments, badges, onSelect }: Props) {
  const repoKey = p.repository ? getRepoKey(p.repository) : null;
  const lastDeploy = repoKey
    ? deployments
        .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const scProvider = p.repository?.includes("gitlab") ? "gitlab" : "github";

  return (
    <div
      onClick={() => onSelect(p.id)}
      className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
    >
      {/* Header: icon, slug */}
      <div className="flex items-center gap-3 min-w-0">
        <SourceControlBadge provider={scProvider} showName={false} iconSize="w-6 h-6" />
        <span className="text-sm text-text-secondary truncate lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</span>
      </div>

      {/* Title & tech badges */}
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-text truncate">{p.name}</h3>
        {badges && badges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {badges.slice(0, 4).map((b) => (
              <TechBadge key={b.name} name={b.name} />
            ))}
          </div>
        ) : p.platform ? (
          <div className="flex items-center gap-1.5 mt-1.5">
            <PlatformBadge slug={p.platform} />
          </div>
        ) : null}
      </div>

      {/* Last deploy + branch */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          {lastDeploy ? (
            <>
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
              <span className="text-xs text-text-muted">
                Last deploy: {new Date(lastDeploy.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">No deployments yet</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
          <LinkIcon className="w-3 h-3" strokeWidth={2} />
          {p.branch || "main"}
        </span>
      </div>
    </div>
  );
}
