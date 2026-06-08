import type { CommitInfo } from "../../../types";
import { cardCls } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import Spinner from "../../../components/Spinner";

interface Props {
  commits: CommitInfo[];
  commitsLoading: boolean;
  commitsError: string;
}


export default function RecentCommits({ commits, commitsLoading, commitsError }: Props) {
  if (commitsLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Recent Commits</h2>
        <div className={`${cardCls} p-6 flex justify-center`}>
          <Spinner className="size-5 " />
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
              <img src={c.authorAvatar} alt={c.author} className="size-8  rounded-full shrink-0 mt-0.5" />
            ) : (
              <div className="size-8  rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs shrink-0 mt-0.5">
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
