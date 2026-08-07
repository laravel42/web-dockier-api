import DeployWizard from "@/components/DeployWizard";
import Button from "@/components/ui/Button";
import { useDeployDetail } from "./useDeployDetail";
import DeployHeader from "./sections/DeployHeader";
import InfoCards from "./sections/InfoCards";
import { resolveDeployUrl } from "@/utils/resolveDeployUrl";
import DeployLogs from "./sections/DeployLogs";
import DeployHistory from "./sections/DeployHistory";
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import { usePermissions } from "@/context/PermissionsContext";
import { ChevronLeftIcon } from "lucide-react";

export default function DeployDetail() {
  const {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    cancelling,
    redeploying,
    provKey,
    showDeployWizard, setShowDeployWizard,
    openDeployWizard, canLaunchDeploy,
    analysis, analysisLoading, analysisError,
    handleDeployComplete,
    handleCancel,
    handleRedeploy,
    handleRollback,
  } = useDeployDetail();
  const { has } = usePermissions();
  const canCancel = has("deploy:manage");
  const canRedeploy = has("deploy:create");

  if (loading) {
    return <PageLoading />;
  }

  if (error || !deploy) {
    return (
      <div>
        <PageError message={error || "Deployment not found"} />
        <div className="text-center mt-4">
          <Button variant="secondary" onClick={() => navigate("/projects")}>
            Back to Project
          </Button>
        </div>
      </div>
    );
  }

  const deployUrl = resolveDeployUrl(deploy);

  // The most recent successful deployment is the current live version — rolling
  // back "to this" would be a no-op, so the rollback action is hidden for it.
  // Until the deployment list has loaded (`latestSuccessfulId` undefined), treat
  // this as the latest so the rollback button doesn't flicker in and then out.
  const latestSuccessfulId = allDeploys.find((d) => d.status === "success")?.id;
  const isLatestSuccessful = latestSuccessfulId === undefined || deploy.id === latestSuccessfulId;

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => project ? navigate(`/projects/${project.id}`) : navigate("/projects")}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6"
        >
          <ChevronLeftIcon className="size-4 " />
          Back to Project
        </button>

        <DeployHeader
          deploy={deploy}
          project={project}
          onNavigateProject={() => project && navigate(`/projects/${project.id}`)}
          canCancel={canCancel}
          cancelling={cancelling}
          onCancel={handleCancel}
          canRedeploy={canRedeploy}
          redeploying={redeploying}
          onRedeploy={handleRedeploy}
          onRollback={() => deploy && handleRollback(deploy.id)}
          isLatestSuccessful={isLatestSuccessful}
        />

        <InfoCards deploy={deploy} provKey={provKey} deployUrl={deployUrl} />

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
        fallbackCommitHash={project?.lastCommitHash}
        canLaunchDeploy={canLaunchDeploy}
        onNewDeploy={openDeployWizard}
        onSelect={(id) => navigate(`/deploy/${id}`)}
      />

      {project && (
        <DeployWizard
          open={showDeployWizard}
          onClose={() => setShowDeployWizard(false)}
          project={project}
          analysis={analysis}
          analysisLoading={analysisLoading}
          analysisError={analysisError}
          providers={providers}
          onDeployComplete={handleDeployComplete}
        />
      )}

    </div>
  );
}
