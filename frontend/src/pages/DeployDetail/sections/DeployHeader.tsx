import type { Deployment, Project } from "@/types";
import { statusBadgeColors as statusColors, typeCaption, typePageTitle } from "@/utils/styles";
import RocketIcon from "@/components/icons/outlined/RocketIcon";
import Button from "@/components/ui/Button";

interface Props {
  deploy: Deployment;
  project: Project | null;
  onNavigateProject: () => void;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
  canRedeploy: boolean;
  redeploying: boolean;
  onRedeploy: () => void;
  onRollback: () => void;
  /** True when this deployment is the most recent successful one (rollback is a no-op → hide it). */
  isLatestSuccessful: boolean;
}

export default function DeployHeader({
  deploy, project, onNavigateProject,
  canCancel, cancelling, onCancel,
  canRedeploy, redeploying, onRedeploy, onRollback,
  isLatestSuccessful,
}: Props) {
  const isTerminal = ["success", "failed", "cancelled"].includes(deploy.status);
  const isInProgress = ["pending", "building", "deploying"].includes(deploy.status);

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
          <RocketIcon className="size-6" />
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
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Redeploy — available on terminal deployments (success, failed, cancelled) */}
        {canRedeploy && isTerminal && deploy.status !== "destroyed" && (
          <Button variant="primary" size="sm" loading={redeploying} onClick={onRedeploy} iconLeft={<RocketIcon />}>
            Redeploy
          </Button>
        )}

        {/* Rollback — only on a PAST successful deployment (not the latest live one) with a commit hash */}
        {canRedeploy && deploy.status === "success" && deploy.commitHash && !isLatestSuccessful && (
          <Button variant="outline" size="sm" loading={redeploying} onClick={onRollback}>
            Rollback to this
          </Button>
        )}

        {/* Cancel — during in-progress deploys */}
        {canCancel && isInProgress && (
          <Button variant="danger" size="sm" loading={cancelling} onClick={onCancel}>
            Cancel Deploy
          </Button>
        )}
      </div>
    </div>
  );
}
