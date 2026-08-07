import type { RepoStats } from "@/types";

interface Props {
  stats: RepoStats | null;
  nameByLogin?: Record<string, string>;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="size-10 rounded-full shrink-0 ring-2 ring-border" />;
  }
  return (
    <div className="size-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0 ring-2 ring-border">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ContributorsGrid({ stats, nameByLogin }: Props) {
  if (!stats?.topContributors?.length) return null;

  const contributors = stats.topContributors;
  const maxCommits = Math.max(...contributors.map((c) => c.commits), 1);

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text mb-3">Contributors</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {contributors.map((c, i) => {
            const rank = i + 1;
            const pct = Math.round((c.commits / maxCommits) * 100);
            const realName = nameByLogin?.[c.name.toLowerCase()];
            const displayName = realName && realName !== c.name ? `${realName} (${c.name})` : c.name;
            const nameEl = c.profileUrl ? (
              <a
                href={c.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-semibold text-primary-500 hover:text-primary-700 transition-colors truncate"
                title={displayName}
              >
                {displayName}
              </a>
            ) : (
              <span className="block text-sm font-semibold text-text truncate" title={displayName}>
                {displayName}
              </span>
            );

            return (
              <div
                key={c.name}
                className="flex items-center gap-3 min-w-0 rounded-lg border border-border/50 bg-secondary-50/30 px-3 py-2.5 hover:border-primary/30 hover:bg-secondary-50/60 transition-colors"
              >
                <span className="shrink-0 inline-flex items-center justify-center min-w-7 h-6 px-1.5 rounded-full text-[11px] font-bold tabular-nums ring-1 bg-secondary-100/50 text-text-muted ring-border">
                  #{rank}
                </span>
                <Avatar name={c.name} avatarUrl={c.avatarUrl} />
                <div className="min-w-0 flex-1">
                  {nameEl}
                  <div className="mt-1.5 h-1.5 w-[85%] overflow-hidden rounded-full bg-secondary-100/60">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-text-muted tabular-nums">
                    {c.commits.toLocaleString()} commit{c.commits !== 1 ? "s" : ""}
                  </div>
                  {(c.additions > 0 || c.deletions > 0) && (
                    <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] tabular-nums">
                      <span className="text-emerald-400">{c.additions.toLocaleString()} ++</span>
                      <span className="text-danger-500">{c.deletions.toLocaleString()} --</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
