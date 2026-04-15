import type { Project, RepoStats } from "../types";
import { cardCls } from "../constants";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import CodeIcon from "../../../components/icons/outlined/CodeIcon";
import UserIcon from "../../../components/icons/outlined/UserIcon";
import ChatBubbleIcon from "../../../components/icons/outlined/ChatBubbleIcon";

interface Props {
  project: Project;
  stats: RepoStats | null;
}

const templateDescriptions: Record<string, string> = {
  wordpress: "Full WordPress setup with MySQL database, ready to deploy.",
};

export default function RepoInfoCard({ project, stats }: Props) {
  const isTemplate = project.sourceType === "template";

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
            <CodeIcon className="w-5 h-5 text-text-muted shrink-0" />
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
          <CodeIcon className="w-5 h-5 text-text-muted shrink-0" />
          {project.branch && project.repository ? (
            <a href={`${project.repository}/-/tree/${project.branch}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors">{project.branch}</a>
          ) : project.branch ? (
            <span className="text-sm text-text-secondary">{project.branch}</span>
          ) : (
            <span className="text-sm text-text-muted">No branch selected</span>
          )}
        </div>
        {stats?.lastCommitAuthor && (
          <div className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-text-muted shrink-0" />
            <span className="text-sm text-text-secondary">{stats.lastCommitAuthor}</span>
            {stats.lastCommitHash ? (
              <a href={`${project.repository}/-/commit/${stats.lastCommitHash}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary-500 hover:text-primary-700 transition-colors">{stats.lastCommitHash.slice(0, 7)}</a>
            ) : (
              <span className="text-xs text-text-muted">last commit</span>
            )}
          </div>
        )}
        {stats?.lastCommitMessage && (
          <div className="flex items-start gap-2 pt-2 mt-2 border-t border-border">
            <ChatBubbleIcon className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-text truncate">{stats.lastCommitMessage}</p>
              {stats.lastCommitDate && <p className="text-xs text-text-muted mt-0.5">{new Date(stats.lastCommitDate).toLocaleString()}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
