import type { CommitInfo } from "../types";
import { cardCls } from "../constants";

interface Props {
  commits: CommitInfo[];
  commitsLoading: boolean;
  commitsError: string;
}

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

export default function RecentCommits({ commits, commitsLoading, commitsError }: Props) {
  if (commitsLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Recent Commits</h2>
        <div className={`${cardCls} p-6 flex justify-center`}>
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (commitsError) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Recent Commits</h2>
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-danger-500">{commitsError}</p>
        </div>
      </div>
    );
  }

  if (!commits.length) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Recent Commits</h2>
      <div className={`${cardCls} divide-y divide-border`}>
        {commits.map((c) => (
          <div key={c.hash} className="px-4 py-3 flex items-start gap-3">
            {c.authorAvatar ? (
              <img src={c.authorAvatar} alt={c.author} className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs shrink-0 mt-0.5">
                {c.author.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate"
                  >
                    {c.message}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-text truncate">{c.message}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <span className="font-mono text-primary-500">{c.shortHash}</span>
                <span>·</span>
                <span>{c.author}</span>
                <span>·</span>
                <span>{timeAgo(c.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
