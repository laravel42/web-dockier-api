import type { RepoIssue } from "@/types";
import { cardCls } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import Spinner from "@/components/Spinner";
import { CircleAlertIcon, MessageSquareTextIcon } from "lucide-react";
import { TabPanelSectionTitle } from "@/components/TabPanelHeader";

interface Props {
  issues: RepoIssue[];
  issuesLoading: boolean;
  issuesError: string;
  onIssueClick: (issue: RepoIssue) => void;
}

function Label({ name, color }: { name: string; color: string }) {
  if (color) {
    return (
      <span
        className="rounded-sm border px-1.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${color}20`, borderColor: `${color}55`, color }}
      >
        {name}
      </span>
    );
  }
  return (
    <span className="rounded-sm border border-border bg-secondary-50/50 px-1.5 py-0.5 text-xs font-medium text-text-muted">
      {name}
    </span>
  );
}

export default function OpenIssues({ issues, issuesLoading, issuesError, onIssueClick }: Props) {
  if (issuesLoading) {
    return (
      <section className="flex flex-col gap-3">
        <TabPanelSectionTitle title="Open Issues" />
        <div className={`${cardCls} p-6 flex justify-center`}>
          <Spinner className="size-5 " />
        </div>
      </section>
    );
  }

  if (!issuesError && issues.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <TabPanelSectionTitle
        title="Open Issues"
        suffix={issues.length > 0 ? <span className="ml-1.5 text-text-muted">({issues.length})</span> : undefined}
      />
      {issuesError ? (
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-danger-500">{issuesError}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <button
              key={issue.number}
              type="button"
              onClick={() => onIssueClick(issue)}
              className="w-full text-left flex items-start gap-3 rounded-lg border border-border/50 bg-secondary-50/30 px-3 py-2.5 hover:border-primary/30 hover:bg-secondary-50/60 transition-colors cursor-pointer"
            >
              <CircleAlertIcon className="size-4 text-success-ink mt-0.5 shrink-0" />
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
                  <MessageSquareTextIcon className="size-3.5" />
                  {issue.comments}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
