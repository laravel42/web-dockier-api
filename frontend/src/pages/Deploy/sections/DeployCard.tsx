import type { Deployment, Project } from "../types";
import TechBadge from "../../../components/TechBadge";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  repo: string;
  deploys: Deployment[];
  project: Project | undefined;
  badges: Array<{ name: string; category: string; confidence: number }> | undefined;
  onClick: () => void;
}

export default function DeployCard({ repo, deploys, project, badges, onClick }: Props) {
  const sorted = deploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latest = sorted[0];
  const statusDot = latest.status === "success" ? "bg-success-500"
    : latest.status === "failed" ? "bg-danger-500"
    : latest.status === "building" || latest.status === "deploying" ? "bg-primary-500"
    : "bg-secondary-400";

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
    >
      {/* Header: rocket icon + deploy count */}
      <div className="flex items-center gap-3 min-w-0">
        <RocketIcon className="w-6 h-6 shrink-0 text-primary-500" />
        <span className="text-sm text-text-secondary truncate">{sorted.length} deploy{sorted.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Project name */}
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-text truncate">{project?.name || repo}</h3>
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {badges.slice(0, 4).map((b) => (
              <TechBadge key={b.name} name={b.name} />
            ))}
          </div>
        )}
      </div>

      {/* Last deploy status + branch */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-xs text-text-muted">
            Last deploy: {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
          <LinkIcon className="w-3 h-3" />
          {latest.branch}
        </span>
      </div>
    </div>
  );
}
