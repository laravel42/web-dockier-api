import { btnSecondary } from "../../utils/styles";
import { useDeployDetail } from "./useDeployDetail";
import ChevronLeftIcon from "../../components/icons/outlined/ChevronLeftIcon";
import DeployHeader from "./sections/DeployHeader";
import InfoCards from "./sections/InfoCards";
import DeployLogs from "./sections/DeployLogs";
import DeployHistory from "./sections/DeployHistory";

export default function DeployDetail() {
  const {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    provKey, providerStyle,
  } = useDeployDetail();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !deploy) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Deployment not found"}</p>
        <button
          onClick={() => navigate("/deploy")}
          className={btnSecondary}
        >
          Back to Deployments
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => navigate("/deploy")}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to Deployments
        </button>

        <DeployHeader
          deploy={deploy}
          project={project}
          onNavigateProject={() => project && navigate(`/projects/${project.id}`)}
        />

        <InfoCards deploy={deploy} provKey={provKey} providerStyle={providerStyle} />

        <DeployLogs logs={deploy.logs} />
      </div>

      <DeployHistory
        deploys={allDeploys}
        providers={providers}
        activeDeployId={deployId}
        loading={allDeploysLoading}
        onSelect={(id) => navigate(`/deploy/${id}`)}
      />
    </div>
  );
}
