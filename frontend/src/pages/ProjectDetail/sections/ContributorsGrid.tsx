import type { RepoStats } from "@/types";

interface Props {
  stats: RepoStats | null;
  nameByLogin?: Record<string, string>;
}

const MAX_VISIBLE = 5;

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="size-6 shrink-0 rounded-full" />;
  }
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary-100 text-ui-sm font-semibold text-text-muted">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ContributorsGrid({ stats, nameByLogin }: Props) {
  if (!stats?.topContributors?.length) return null;

  const contributors = stats.topContributors.slice(0, MAX_VISIBLE);
  const overflow = stats.topContributors.length - contributors.length;
  const maxCommits = Math.max(...contributors.map((c) => c.commits), 1);

  return (
    <div aria-labelledby="project-contributors-heading">
      <p id="project-contributors-heading" className="text-ui font-semibold text-text-muted">
        Contributors
      </p>
      <ul className="mt-2 space-y-[17px]">
        {contributors.map((c, i) => {
          const pct = Math.round((c.commits / maxCommits) * 100);
          const realName = nameByLogin?.[c.name.toLowerCase()];
          const displayName = realName && realName !== c.name ? `${realName} (${c.name})` : c.name;
          const nameEl = c.profileUrl ? (
            <a
              href={c.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-ui font-medium text-text hover:text-primary-500"
              title={displayName}
            >
              {displayName}
            </a>
          ) : (
            <span className="truncate text-ui font-medium text-text" title={displayName}>
              {displayName}
            </span>
          );

          return (
            <li key={c.name} className="min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-1 w-5 shrink-0 text-ui-sm tabular-nums text-text-muted">
                  {i + 1}
                </span>
                <Avatar name={c.name} avatarUrl={c.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {nameEl}
                    <span className="ml-auto shrink-0 text-ui-sm tabular-nums text-text-muted">
                      {c.commits.toLocaleString()}
                      <span className="sr-only">
                        {" "}
                        commit{c.commits !== 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-0.5 overflow-hidden bg-border/50">
                    <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {overflow > 0 && (
        <p className="mt-3 text-ui-sm tabular-nums text-text-muted">+{overflow} more</p>
      )}
    </div>
  );
}
