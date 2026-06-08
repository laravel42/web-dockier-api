import type { Deployment as DeployInfo, Provider as ProviderInfo } from "../../../types";
import { cardCls } from "../../../utils/styles";
import { usePermissions } from "../../../context/PermissionsContext";
import ProviderBadge from "../../../components/ProviderBadge";

interface Props {
  lastDeploy: DeployInfo;
  allProviders: ProviderInfo[];
  destroying: boolean;
  onDestroy: () => void;
  onViewDetails: () => void;
}

export default function LastDeployCard({ lastDeploy, allProviders, destroying, onDestroy, onViewDetails }: Props) {
  const { has } = usePermissions();
  const canDestroy = has("deploy:manage");
  const prov = allProviders.find(p => p.id === lastDeploy.providerId);
  const provKey = prov?.provider || "";
  const strategyLabels: Record<string, string> = { vps: "VPS", managed: "ECS Fargate" };
  const statusColors: Record<string, string> = {
    success: "bg-success-500/10 text-success-500",
    failed: "bg-danger-500/10 text-danger-500",
    building: "bg-warning-500/10 text-warning-500",
    deploying: "bg-primary-500/10 text-primary-500",
    pending: "bg-secondary-100 text-text-muted",
    destroyed: "bg-secondary-100 text-text-muted",
  };

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Last Deploy</h2>
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center gap-3 mb-4">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[lastDeploy.status] || "bg-secondary-100 text-text-muted"}`}>{lastDeploy.status}</span>
          <ProviderBadge provider={provKey} suffix={` · ${strategyLabels[lastDeploy.deployStrategy] || lastDeploy.deployStrategy}`} iconSize="w-3 h-3" />
          <span className="text-xs text-text-muted ml-auto">{new Date(lastDeploy.createdAt).toLocaleString()}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-text-muted">Branch</p>
            <p className="text-sm text-text font-medium mt-0.5">{lastDeploy.branch}</p>
          </div>
          {lastDeploy.commitHash && (
            <div>
              <p className="text-xs text-text-muted">Commit</p>
              <p className="text-sm text-text font-mono mt-0.5">{lastDeploy.commitHash.slice(0, 7)}</p>
            </div>
          )}
          {lastDeploy.appUrl && (
            <div>
              <p className="text-xs text-text-muted">App URL</p>
              <a href={lastDeploy.appUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-500 hover:text-primary-700 transition-colors mt-0.5 block truncate">
                {lastDeploy.appUrl.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
          {lastDeploy.dockerImage && (
            <div>
              <p className="text-xs text-text-muted">Docker Image</p>
              <p className="text-sm text-text font-mono mt-0.5 truncate" title={lastDeploy.dockerImage}>{lastDeploy.dockerImage.split("/").pop()?.split(":")[0] || lastDeploy.dockerImage}</p>
            </div>
          )}
          <div className="flex items-end gap-3 sm:-col-start-1 justify-end">
            {canDestroy && lastDeploy.status === "success" && (
              <button
                disabled={destroying}
                onClick={onDestroy}
                className="text-xs text-danger-500 hover:text-danger-700 font-medium transition-colors disabled:opacity-50"
              >
                {destroying ? "Destroying…" : "Destroy"}
              </button>
            )}
            <button onClick={onViewDetails} className="text-xs text-primary-500 hover:text-primary-700 font-medium transition-colors">
              View details →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
