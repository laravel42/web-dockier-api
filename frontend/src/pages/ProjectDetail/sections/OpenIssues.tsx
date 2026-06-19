import type { RepoIssue } from "../../../types";
import { cardCls } from "../../../utils/styles";
import { timeAgo } from "../../../utils/timeAgo";
import Spinner from "../../../components/Spinner";
import AlertCircleIcon from "../../../components/icons/outlined/AlertCircleIcon";
import ChatBubbleIcon from "../../../components/icons/outlined/ChatBubbleIcon";

interface Props {
  issues: RepoIssue[];
  issuesLoading: boolean;
  issuesError: string;
}

function Label({ name, color }: { name: string; color: string }) {
  if (color) {
    return (
      <span
        className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: `${color}20`, borderColor: `${color}55`, color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-secondary-50/50 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
      {name}
    </span>
  );
}

export default function OpenIssues({ issues, issuesLoading, issuesError }: Props) {
  if (issuesLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-3">Open Issues</h2>
        <div className={`${cardCls} p-6 flex justify-center`}>
          <Spinner className="size-5 " />
        </div>
      </div>
    );
  }

  if (issuesError) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-3">Open Issues</h2>
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-danger-500">{issuesError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text mb-3">
        Open Issues
        {issues.length > 0 && <span className="ml-1.5 text-text-muted">({issues.length})</span>}
      </h2>
      {issues.length === 0 ? (
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-text-muted">No open issues.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <a
              key={issue.number}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-lg border border-border/50 bg-secondary-50/30 px-3 py-2.5 hover:border-primary/30 hover:bg-secondary-50/60 transition-colors"
            >
              <AlertCircleIcon className="size-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-text line-clamp-2">{issue.title}</div>
                <div className="mt-1 text-xs text-text-muted">
                  #{issue.number} opened {timeAgo(issue.createdAt)}
                  {issue.author && ` by ${issue.author}`}
                </div>
                {issue.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {issue.labels.map((label) => (
                      <Label key={label.name} name={label.name} color={label.color} />
                    ))}
                  </div>
                )}
              </div>
              {issue.comments > 0 && (
                <span className="flex items-center gap-1 text-xs text-text-muted shrink-0 tabular-nums">
                  <ChatBubbleIcon className="size-3.5" />
                  {issue.comments}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
