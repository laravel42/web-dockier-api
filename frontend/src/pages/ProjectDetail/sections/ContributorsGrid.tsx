import type { RepoStats } from "../../../types";
import { cardCls } from "../../../utils/styles";

interface Props {
  stats: RepoStats | null;
}

export default function ContributorsGrid({ stats }: Props) {
  if (!stats?.topContributors?.length) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Contributors</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {stats.topContributors.map((c) => (
          <div key={c.name} className={`${cardCls} p-4 flex items-center gap-3`}>
            {c.avatarUrl ? (
              <img src={c.avatarUrl} alt={c.name} className="size-10  rounded-full shrink-0" />
            ) : (
              <div className="size-10  rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0">
                {c.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {c.profileUrl ? (
                <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-text hover:text-primary-500 transition-colors truncate block">{c.name}</a>
              ) : (
                <p className="text-sm font-medium text-text truncate">{c.name}</p>
              )}
              <p className="text-xs text-text-muted">{c.commits} commit{c.commits !== 1 ? "s" : ""}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
