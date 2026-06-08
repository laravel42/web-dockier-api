import TechBadge from "../../../components/TechBadge";
import { getRepoSlug } from "../../../utils/parseOwnerRepo";
import { statusDotColors as statusColors } from "../../../utils/styles";
import type { Deployment, Project, TechBadgeInfo } from "../../../types";

interface Props {
  grouped: Array<[string, Deployment[]]>;
  projectById: Record<string, Project>;
  projectLangs: Record<string, TechBadgeInfo[]>;
  onSelect: (deployId: string) => void;
}

export default function DeployTable({ grouped, projectById, projectLangs, onSelect }: Props) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-card)] overflow-hidden shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Repository</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Deploys</th>
            <th className="px-4 py-3 font-medium">Tech</th>
            <th className="px-4 py-3 font-medium">Last Deploy</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(([groupKey, repoDeploys]) => {
            const proj = projectById[groupKey];
            const sorted = [...repoDeploys].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
            const latest = sorted[0];
            const badges = proj ? projectLangs[proj.id] : undefined;
            const repoLabel = proj?.repository ? getRepoSlug(proj.repository) : latest.repo;

            return (
              <tr
                key={groupKey}
                onClick={() => onSelect(latest.id)}
                className="border-b border-border last:border-0 hover:bg-secondary-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-text">{proj?.name || latest.repo}</td>
                <td className="px-4 py-3 text-text-secondary lowercase">{repoLabel}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted">
                    {latest.branch}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{sorted.length}</td>
                <td className="px-4 py-3">
                  {badges && badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {badges.slice(0, 3).map((b) => (
                        <TechBadge key={b.name} name={b.name} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[latest.status] || "bg-text-muted"}`} />
                    <span className="text-xs text-text-muted">
                      {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
