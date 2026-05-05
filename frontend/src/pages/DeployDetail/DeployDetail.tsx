import { btnSecondary } from "../../utils/styles";
import { useDeployDetail } from "./useDeployDetail";
import ChevronLeftIcon from "../../components/icons/outlined/ChevronLeftIcon";
import DeployHeader from "./sections/DeployHeader";
import InfoCards from "./sections/InfoCards";
import DeployLogs from "./sections/DeployLogs";
import DeployHistory from "./sections/DeployHistory";
import Spinner from "../../components/Spinner";

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
        <Spinner />
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

        {/* VPS warm-up notice */}
        {deploy.status === "success" && deploy.deployStrategy === "vps" && deploy.appUrl && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-6">
            <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1">First-time startup notice</p>
            <p className="text-xs text-text-muted leading-relaxed">
              If you see an nginx welcome page when visiting the URL, don't worry — your application is still booting up. This is normal for VPS deployments and typically resolves within 1–3 minutes.
            </p>
          </div>
        )}

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
