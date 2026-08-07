import type { RepoPullRequest } from "@/types";
import { cardCls } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import Spinner from "@/components/Spinner";
import GitBranchIcon from "@/components/icons/outlined/GitBranchIcon";

interface Props {
  pullRequests: RepoPullRequest[];
  pullRequestsLoading: boolean;
  pullRequestsError: string;
  onPRClick: (pr: RepoPullRequest) => void;
}

export default function PullRequests({ pullRequests, pullRequestsLoading, pullRequestsError, onPRClick }: Props) {
  if (pullRequestsLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-3">Pull Requests</h2>
        <div className={`${cardCls} p-6 flex justify-center`}>
          <Spinner className="size-5 " />
        </div>
      </div>
    );
  }

  if (pullRequestsError) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-3">Pull Requests</h2>
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-danger-500">{pullRequestsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text mb-3">
        Pull Requests
        {pullRequests.length > 0 && <span className="ml-1.5 text-text-muted">({pullRequests.length})</span>}
      </h2>
      {pullRequests.length === 0 ? (
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-text-muted">No open pull requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pullRequests.map((pr) => (
            <button
              key={pr.number}
              type="button"
              onClick={() => onPRClick(pr)}
              className="w-full text-left flex items-start gap-3 rounded-lg border border-border/50 bg-secondary-50/30 px-3 py-2.5 hover:border-primary/30 hover:bg-secondary-50/60 transition-colors cursor-pointer"
            >
              <GitBranchIcon className="size-4 text-primary-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text line-clamp-2">{pr.title}</div>
                <div className="mt-1 text-xs text-text-muted">
                  #{pr.number} opened {timeAgo(pr.createdAt)}
                  {pr.author && ` by ${pr.author}`}
                </div>
              </div>
              {pr.draft && (
                <span className="rounded-full border border-border bg-secondary-50/50 px-2 py-0.5 text-[10px] font-medium text-text-muted shrink-0">
                  Draft
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
