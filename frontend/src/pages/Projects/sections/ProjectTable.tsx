import TechBadge from "../../../components/TechBadge";
import PlatformBadge from "../../../components/PlatformBadge";
import { getRepoSlug, getRepoKey } from "../utils";
import { statusColors } from "../constants";
import type { Project, TechBadgeInfo } from "../types";

interface Deploy {
  id: string;
  repo: string;
  branch: string;
  status: string;
  createdAt: string;
}

interface Props {
  projects: Project[];
  deployments: Deploy[];
  projectLangs: Record<string, TechBadgeInfo[]>;
  onSelect: (id: string) => void;
}

export default function ProjectTable({ projects, deployments, projectLangs, onSelect }: Props) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-card)] overflow-hidden shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-muted text-xs uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Repository</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Tech</th>
            <th className="px-4 py-3 font-medium">Last Deploy</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const repoKey = p.repository ? getRepoKey(p.repository) : null;
            const lastDeploy = repoKey
              ? deployments
                  .filter((d) => d.repo === repoKey && (!p.branch || d.branch === p.branch))
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
              : null;
            const badges = projectLangs[p.id];
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="border-b border-border last:border-0 hover:bg-secondary-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-text">{p.name}</td>
                <td className="px-4 py-3 text-text-secondary lowercase">{p.repository ? getRepoSlug(p.repository) : "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted">
                    {p.branch || "main"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {badges && badges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {badges.slice(0, 3).map((b) => (
                        <TechBadge key={b.name} name={b.name} />
                      ))}
                    </div>
                  ) : p.platform ? (
                    <PlatformBadge slug={p.platform} />
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lastDeploy ? (
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[lastDeploy.status] || "bg-text-muted"}`} />
                      <span className="text-xs text-text-muted">
                        {new Date(lastDeploy.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
