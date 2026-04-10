import type { Project } from "../types";
import { cardCls } from "../constants";

interface Props {
  project: Project;
}

export default function ProjectDetailsCard({ project }: Props) {
  return (
    <div className={`${cardCls} p-5`}>
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Details</h2>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-text-muted">Project ID</p>
          <p className="text-sm text-text-secondary font-mono mt-0.5">{project.id}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Created</p>
          <p className="text-sm text-text-secondary mt-0.5">{new Date(project.createdAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
