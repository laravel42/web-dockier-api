import type { Project, RepoStats } from "@/types";
import { cardCls } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import GitCommitIcon from "@/components/icons/outlined/GitCommitIcon";
import SourceControlBadge from "@/components/SourceControlBadge";
import ProjectTechBadges from "@/components/ProjectTechBadges";

interface Props {
  project: Project;
  stats: RepoStats | null;
  badges?: Array<{ name: string; category: string; confidence: number }>;
  allBadges?: Array<{ name: string; category: string; confidence: number }>;
}

const templateDescriptions: Record<string, string> = {
  wordpress: "Full WordPress setup with MySQL database, ready to deploy.",
};

function labelCls() {
  return "text-xs text-text-muted";
}

function detectProvider(repo: string): string {
  if (!repo) return "git";
  if (repo.includes("github")) return "github";
  if (repo.includes("gitlab")) return "gitlab";
  if (repo.includes("bitbucket")) return "bitbucket";
  return "git";
}

function valueLinkCls() {
  return "text-sm text-primary-500 hover:text-primary-700 transition-colors truncate block mt-0.5";
}

export default function RepoInfoCard({ project, stats, badges, allBadges }: Props) {
  const isTemplate = project.sourceType === "template";
  const displayBadges = allBadges && allBadges.length > 0 ? allBadges : badges;

  if (isTemplate) {
    return (
      <div className={`${cardCls} p-5 h-full flex flex-col`}>
        <h2 className="text-sm font-semibold text-text mb-4">Template</h2>
        <div className="flex-1 flex flex-col space-y-3">
          <div>
            <p className={labelCls()}>Source</p>
            <a href={project.repository} target="_blank" rel="noopener noreferrer" className={valueLinkCls()}>
              {project.repository}
            </a>
          </div>
          <div>
            <p className={labelCls()}>Branch</p>
            <p className="text-sm text-text-secondary mt-0.5">{project.branch || "main"}</p>
          </div>
          {project.template && templateDescriptions[project.template] && (
            <div className="mt-auto pt-3 border-t border-border">
              <p className={labelCls()}>About</p>
              <p className="text-xs/relaxed text-text-secondary mt-1 ">
                {templateDescriptions[project.template]}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-5 h-full flex flex-col`}>
      <h2 className="text-sm font-semibold text-text mb-4">Repository</h2>
      <div className="flex-1 flex flex-col space-y-3 min-h-0">
        <div>
          <p className={labelCls()}>Remote</p>
          {project.repository ? (
            <a
              href={project.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1.5 text-sm text-primary-500 hover:text-primary-700 transition-colors min-w-0"
            >
              <SourceControlBadge provider={detectProvider(project.repository)} showName={false} />
              <span className="truncate">{project.repository}</span>
            </a>
          ) : (
            <p className="text-sm text-text-muted mt-0.5">No repository linked</p>
          )}
        </div>

        {stats?.lastCommitHash && (
          <div>
            <p className={labelCls()}>Latest commit</p>
            <div className="mt-1 flex items-start gap-2 min-w-0">
              <GitCommitIcon className="size-4 text-text-muted shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {stats.lastCommitMessage && (
                  <a
                    href={`${project.repository}/-/commit/${stats.lastCommitHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate block"
                  >
                    {stats.lastCommitMessage}
                  </a>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted mt-0.5">
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
          </div>
        )}

        {displayBadges && displayBadges.length > 0 && (
          <div className="mt-auto pt-3 border-t border-border min-h-15">
            <p className={`${labelCls()} mb-2`}>Tech stack</p>
            <ProjectTechBadges badges={displayBadges} limit={8} />
          </div>
        )}
      </div>
    </div>
  );
}
