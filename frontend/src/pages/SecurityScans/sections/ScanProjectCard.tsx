import TechBadge from "../../../components/TechBadge";
import SeverityBadge from "../../../components/SeverityBadge";
import type { Scan, Project, TechBadgeInfo } from "../../../types";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  project: Project | undefined;
  projectId: string;
  scans: Scan[];
  badges: TechBadgeInfo[] | undefined;
  onSelect: (scanId: string) => void;
}

export default function ScanProjectCard({ project, projectId, scans, badges, onSelect }: Props) {
  const sorted = [...scans].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latest = sorted[0];
  const latestCompleted = sorted.find((s) => s.status === "completed");
  const summary = latestCompleted?.summary;
  const isClean = summary && summary.totalFindings === 0;

  const statusDot = latest.status === "completed"
    ? (isClean ? "bg-success-500" : summary && summary.errors > 0 ? "bg-danger-500" : "bg-warning-500")
    : latest.status === "failed" ? "bg-danger-500"
    : latest.status === "running" ? "bg-primary-500"
    : "bg-secondary-400";

  return (
    <div
      onClick={() => onSelect(latest.id)}
      className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
    >
      {/* Header: shield icon + scan count + result badges */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <ShieldCheckIcon className="w-6 h-6 shrink-0 text-success-500" />
          <span className="text-sm text-text-secondary truncate">{sorted.length} scan{sorted.length !== 1 ? "s" : ""}</span>
        </div>
        {summary && (
          <div className="flex items-center gap-1 shrink-0">
            {summary.errors > 0 && <SeverityBadge severity="error" count={summary.errors} />}
            {summary.warnings > 0 && <SeverityBadge severity="warning" count={summary.warnings} />}
            {summary.infos > 0 && <SeverityBadge severity="info" count={summary.infos} />}
            {isClean && <SeverityBadge severity="clean" label="Clean" />}
          </div>
        )}
      </div>

      {/* Project name + language icons */}
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-text truncate">{project?.name || projectId.slice(0, 8)}</h3>
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {badges.slice(0, 4).map((b) => (
              <TechBadge key={b.name} name={b.name} />
            ))}
          </div>
        )}
      </div>

      {/* Last scan status + branch */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-xs text-text-muted">
            Last scan: {new Date(latest.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        {project?.branch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
            <LinkIcon className="w-3 h-3" strokeWidth={2} />
            {project.branch}
          </span>
        )}
      </div>

      {latestCompleted?.commitSha && (
        <div className="flex items-center gap-2 text-[11px] text-text-muted truncate">
          <span className="font-mono shrink-0">{latestCompleted.commitSha.slice(0, 8)}</span>
          {latestCompleted.commitMessage && (
            <span className="truncate">{latestCompleted.commitMessage}</span>
          )}
        </div>
      )}
    </div>
  );
}
