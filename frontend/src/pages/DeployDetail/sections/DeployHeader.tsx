import type { Deployment, Project } from "../types";
import { statusColors } from "../constants";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";

interface Props {
  deploy: Deployment;
  project: Project | null;
  onNavigateProject: () => void;
}

export default function DeployHeader({ deploy, project, onNavigateProject }: Props) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
          <RocketIcon className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-text">Deployment</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[deploy.status] || "bg-secondary-100 text-text-muted"}`}>
              {deploy.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {project && (
              <button
                onClick={onNavigateProject}
                className="text-sm text-primary-500 hover:text-primary-700 transition-colors"
              >
                {project.name}
              </button>
            )}
            <span className="text-sm text-text-muted font-mono">{deploy.repo}</span>
            <span className="text-xs text-text-muted">{deploy.branch}</span>
            <span className="text-xs text-text-muted">{new Date(deploy.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
