import type { CommitInfo } from "@/types";
import { cardCls } from "@/utils/styles";
import { timeAgo } from "@/utils/timeAgo";
import Spinner from "@/components/Spinner";

interface Props {
  commits: CommitInfo[];
  commitsLoading: boolean;
  commitsError: string;
}

function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type TimelineRow =
  | { type: "header"; key: string; label: string }
  | { type: "commit"; key: string; commit: CommitInfo };

function buildRows(commits: CommitInfo[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let currentDay = "";
  for (const commit of commits) {
    const day = new Date(commit.date).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      rows.push({ type: "header", key: `day-${day}`, label: dayLabel(commit.date) });
    }
    rows.push({ type: "commit", key: commit.hash, commit });
  }
  return rows;
}

export default function RecentCommits({ commits, commitsLoading, commitsError }: Props) {
  if (commitsLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-4">Recent Commits</h2>
        <div className={`${cardCls} p-6 flex justify-center`}>
          <Spinner className="size-5 " />
        </div>
      </div>
    );
  }

  if (commitsError) {
    return (
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text mb-4">Recent Commits</h2>
        <div className={`${cardCls} p-4`}>
          <p className="text-sm text-danger-500">{commitsError}</p>
        </div>
      </div>
    );
  }

  if (!commits.length) return null;

  const rows = buildRows(commits);

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text mb-4">Recent Commits</h2>
      <div className={`${cardCls} p-4`}>
        <ol className="relative">
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const lineTop = row.type === "header" ? "top-6" : "top-9";
            return (
              <li key={row.key} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-4 ${lineTop} bottom-0 w-px -translate-x-1/2 bg-border`}
                  />
                )}
                {row.type === "header" ? (
                  <>
                    <div className="relative z-10 flex size-8 shrink-0 items-center justify-center">
                      <span className="size-2.5 rounded-full bg-border ring-4 ring-card" />
                    </div>
                    <span className="text-[14px] font-bold text-text-muted pt-1.5">{row.label}</span>
                  </>
                ) : (
                  <>
                    <div className="relative z-10 shrink-0">
                      {row.commit.authorAvatar ? (
                        <img src={row.commit.authorAvatar} alt={row.commit.author} className="size-8 rounded-full ring-2 ring-border" />
                      ) : (
                        <div className="size-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs ring-2 ring-border">
                          {row.commit.author.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      {row.commit.url ? (
                        <a
                          href={row.commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[14px]/snug font-medium text-text hover:text-primary-500 transition-colors line-clamp-2"
                        >
                          {row.commit.message.split("\n")[0].trim()}
                        </a>
                      ) : (
                        <span className="text-xs/snug font-medium text-text line-clamp-2">
                          {row.commit.message.split("\n")[0].trim()}
                        </span>
                      )}
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-text-muted mt-1">
                        <span className="font-mono text-primary-500">{row.commit.shortHash}</span>
                        <span>·</span>
                        <span>
                          <span>{row.commit.author}</span>
                          {row.commit.authorLogin && row.commit.authorLogin !== row.commit.author && (
                            <span> ({row.commit.authorLogin})</span>
                          )}
                          {" committed "}
                          {timeAgo(row.commit.date)}
                        </span>
                        {((row.commit.additions ?? 0) > 0 || (row.commit.deletions ?? 0) > 0) && (
                          <span className="flex items-center gap-2 tabular-nums">
                            <span>·</span>
                            <span className="text-emerald-400">{(row.commit.additions ?? 0).toLocaleString()} ++</span>
                            <span className="text-danger-500">{(row.commit.deletions ?? 0).toLocaleString()} --</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
