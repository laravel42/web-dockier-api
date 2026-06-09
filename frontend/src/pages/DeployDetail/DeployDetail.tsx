import { btnSecondary } from "../../utils/styles";
import { useDeployDetail } from "./useDeployDetail";
import ChevronLeftIcon from "../../components/icons/outlined/ChevronLeftIcon";
import DeployHeader from "./sections/DeployHeader";
import InfoCards from "./sections/InfoCards";
import { resolveDeployUrl } from "../../utils/resolveDeployUrl";
import DeployLogs from "./sections/DeployLogs";
import DeployHistory from "./sections/DeployHistory";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";

export default function DeployDetail() {
  const {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    provKey,
  } = useDeployDetail();

  if (loading) {
    return <PageLoading />;
  }

  if (error || !deploy) {
    return (
      <div>
        <PageError message={error || "Deployment not found"} />
        <div className="text-center mt-4">
          <button type="button" onClick={() => navigate("/deploy")} className={btnSecondary}>
            Back to Deployments
          </button>
        </div>
      </div>
    );
  }

  const deployUrl = resolveDeployUrl(deploy);

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => navigate("/deploy")}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6"
        >
          <ChevronLeftIcon className="size-4 " />
          Back to Deployments
        </button>

        <DeployHeader
          deploy={deploy}
          project={project}
          deployUrl={deployUrl}
          onNavigateProject={() => project && navigate(`/projects/${project.id}`)}
        />

        <InfoCards deploy={deploy} provKey={provKey} />

        {/* VPS warm-up notice */}
        {deploy.status === "success" && deploy.deployStrategy === "vps" && deployUrl && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mb-6">
            <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1">First-time startup notice</p>
            <p className="text-xs/relaxed text-text-muted ">
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
