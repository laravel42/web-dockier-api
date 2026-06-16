import type { RepoStats } from "../../../types";
import { cardCls } from "../../../utils/styles";

interface Props {
  stats: RepoStats | null;
}

function ContributorAvatar({
  name,
  avatarUrl,
  profileUrl,
}: {
  name: string;
  avatarUrl: string;
  profileUrl: string;
}) {
  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt="" className="size-6 rounded-full shrink-0" />
  ) : (
    <div className="size-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-[10px] shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );

  if (!profileUrl) return avatar;

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-full hover:opacity-80 transition-opacity"
      title={`View ${name} profile`}
    >
      {avatar}
    </a>
  );
}

export default function ContributorsGrid({ stats }: Props) {
  if (!stats?.topContributors?.length) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text mb-3">Contributors</h2>
      <div className={`${cardCls} p-3 sm:p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-3 gap-y-2.5">
          {stats.topContributors.map((c) => {
            const nameEl = c.profileUrl ? (
              <a
                href={c.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary-500 hover:text-primary-700 transition-colors truncate"
                title={c.name}
              >
                {c.name}
              </a>
            ) : (
              <span className="text-xs font-medium text-text truncate" title={c.name}>
                {c.name}
              </span>
            );

            return (
              <div
                key={c.name}
                className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 hover:bg-secondary-50/60 transition-colors"
              >
                <ContributorAvatar name={c.name} avatarUrl={c.avatarUrl} profileUrl={c.profileUrl} />
                <div className="min-w-0 flex-1">{nameEl}</div>
                <span
                  className="text-[10px] text-text-muted tabular-nums shrink-0"
                  title={`${c.commits} commit${c.commits !== 1 ? "s" : ""}`}
                >
                  {c.commits}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
