import DeployWizard from "../../components/DeployWizard";
import { btnSecondary } from "../../utils/styles";
import { useDeployDetail } from "./useDeployDetail";
import ChevronLeftIcon from "../../components/icons/outlined/ChevronLeftIcon";
import { useState } from "react";
import DeployHeader from "./sections/DeployHeader";
import InfoCards from "./sections/InfoCards";
import { resolveDeployUrl } from "../../utils/resolveDeployUrl";
import DeployLogs from "./sections/DeployLogs";
import DeployHistory from "./sections/DeployHistory";
import ConfirmModal from "../../components/ConfirmModal";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import { usePermissions } from "../../context/PermissionsContext";

export default function DeployDetail() {
  const {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    destroying,
    cancelling,
    provKey,
    showDeployWizard, setShowDeployWizard,
    openDeployWizard, canLaunchDeploy,
    analysis, analysisLoading, analysisError,
    handleDeployComplete,
    handleDestroy,
    handleCancel,
  } = useDeployDetail();
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const { has } = usePermissions();
  const canDestroy = has("deploy:manage");
  const canCancel = has("deploy:manage");

  if (loading) {
    return <PageLoading />;
  }

  if (error || !deploy) {
    return (
      <div>
        <PageError message={error || "Deployment not found"} />
        <div className="text-center mt-4">
          <button type="button" onClick={() => navigate("/projects")} className={btnSecondary}>
            Back to Project
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
          canDestroy={canDestroy}
          destroying={destroying}
          onDestroy={() => setShowDestroyConfirm(true)}
          canCancel={canCancel}
          cancelling={cancelling}
          onCancel={handleCancel}
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

      <ConfirmModal
        open={showDestroyConfirm}
        onClose={() => setShowDestroyConfirm(false)}
        title="Destroy Deployment"
        message="This will destroy all cloud infrastructure for this deployment (servers, firewall rules, static IPs, etc). This action cannot be undone."
        confirmLabel="Destroy"
        onConfirm={async () => {
          const result = await handleDestroy();
          if (result.success) setShowDestroyConfirm(false);
        }}
      />
    </div>
  );
}
