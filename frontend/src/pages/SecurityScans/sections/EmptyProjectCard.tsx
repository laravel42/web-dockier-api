import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import ShieldCheckIcon from "../../../components/icons/outlined/ShieldCheckIcon";
import type { Project } from "../types";

interface Props {
  project: Project | undefined;
  projectId: string;
  onSelect: () => void;
}

export default function EmptyProjectCard({ project, projectId, onSelect }: Props) {
  return (
    <div
      onClick={onSelect}
      className="bg-card border border-border rounded-[var(--radius-card)] p-3 flex flex-col gap-3 hover:border-primary-500/30 transition-all overflow-hidden shadow-[var(--shadow-card)] cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <ShieldCheckIcon className="w-6 h-6 shrink-0 text-secondary-400"/>
        <span className="text-base text-text-secondary truncate">No scans</span>
      </div>
      <div className="min-w-0">
        <h3 className="text-xl font-bold text-text truncate">{project?.name || projectId.slice(0, 8)}</h3>
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-secondary-300" />
          <span className="text-xs text-text-muted">Not scanned yet</span>
        </div>
        {project?.branch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-secondary-50 text-[11px] text-text-muted shrink-0">
            <LinkIcon className="w-3 h-3" strokeWidth={2} />
            {project.branch}
          </span>
        )}
      </div>
    </div>
  );
}
