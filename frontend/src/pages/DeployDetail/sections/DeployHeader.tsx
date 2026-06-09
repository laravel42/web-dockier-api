import type { Deployment, Project } from "../../../types";
import { statusBadgeColors as statusColors, typeCaption, typePageTitle } from "../../../utils/styles";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import ExternalLinkIcon from "../../../components/icons/outlined/ExternalLinkIcon";

interface Props {
  deploy: Deployment;
  project: Project | null;
  deployUrl?: string;
  onNavigateProject: () => void;
}

export default function DeployHeader({ deploy, project, deployUrl, onNavigateProject }: Props) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="size-12  rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
          <RocketIcon className="size-6 " />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={typePageTitle}>Deployment</h1>
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
            <span className={`${typeCaption} font-mono`}>{deploy.repo}</span>
            <span className={typeCaption}>{deploy.branch}</span>
            <span className={typeCaption}>{new Date(deploy.createdAt).toLocaleString()}</span>
          </div>
          {deployUrl && (
            <div className="mt-2">
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-primary-500 transition-colors hover:text-primary-700 break-all"
              >
                <ExternalLinkIcon className="size-4 shrink-0" />
                {deployUrl}
              </a>
              {deploy.status !== "success" && (
                <p className="mt-0.5 text-xs text-text-muted">Infrastructure no longer active.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
