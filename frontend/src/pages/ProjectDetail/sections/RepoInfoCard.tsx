import { useState } from "react";
import type { Project, RepoStats } from "../types";
import { cardCls } from "../constants";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import GitBranchIcon from "../../../components/icons/outlined/GitBranchIcon";
import GitCommitIcon from "../../../components/icons/outlined/GitCommitIcon";
import TechBadge from "../../../components/TechBadge";

interface Props {
  project: Project;
  stats: RepoStats | null;
  badges?: Array<{ name: string; category: string; confidence: number }>;
  allBadges?: Array<{ name: string; category: string; confidence: number }>;
}

const templateDescriptions: Record<string, string> = {
  wordpress: "Full WordPress setup with MySQL database, ready to deploy.",
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function RepoInfoCard({ project, stats, badges, allBadges }: Props) {
  const isTemplate = project.sourceType === "template";
  const [showAll, setShowAll] = useState(false);

  if (isTemplate) {
    return (
      <div className={`${cardCls} p-5`}>
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Template</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-text-muted shrink-0" />
            <a href={project.repository} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors truncate">
              {project.repository}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <GitBranchIcon className="w-5 h-5 text-text-muted shrink-0" />
            <span className="text-sm text-text-secondary">{project.branch}</span>
          </div>
          {project.template && templateDescriptions[project.template] && (
            <p className="text-xs text-text-muted pt-2 mt-2 border-t border-border">
              {templateDescriptions[project.template]}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-5`}>
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Repository</h2>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-text-muted shrink-0" />
          {project.repository ? (
            <a href={project.repository} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors truncate">{project.repository}</a>
          ) : (
            <span className="text-sm text-text-muted">No repository linked</span>
          )}
        </div>                
        <div className="flex items-center gap-2">
          <GitBranchIcon className="w-5 h-5 text-text-muted shrink-0" />
          {project.branch && project.repository ? (
            <a href={`${project.repository}/-/tree/${project.branch}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors">{project.branch}</a>
          ) : project.branch ? (
            <span className="text-sm text-text-secondary">{project.branch}</span>
          ) : (
            <span className="text-sm text-text-muted">No branch selected</span>
          )}
        </div>
        {stats?.lastCommitHash && (
          <div className="flex items-start gap-2">
            <GitCommitIcon className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              {stats.lastCommitMessage && (
                <a
                  href={`${project.repository}/-/commit/${stats.lastCommitHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate block"
                >{stats.lastCommitMessage}</a>
              )}
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="font-mono text-primary-500">{stats.lastCommitHash.substring(0, 7)}</span>
                {stats.lastCommitAuthor && (
                  <>
                    <span>·</span>
                    <span>{stats.lastCommitAuthor}</span>
                  </>
                )}
                {stats.lastCommitDate && (
                  <>
                    <span>·</span>
                    <span>{timeAgo(stats.lastCommitDate)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {badges && badges.length > 0 && (
          <div className="pt-3 mt-2 border-t border-border">
            <div className="flex flex-wrap items-center gap-2">
              {(showAll && allBadges ? allBadges : badges).map((b) => (
                <TechBadge key={b.name} name={b.name} iconSize="w-5 h-5" />
              ))}
              {allBadges && allBadges.length > badges.length && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-[11px] text-primary-500 hover:text-primary-400 font-medium transition-colors"
                >
                  {showAll ? "show less" : `+${allBadges.length - badges.length} more`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
