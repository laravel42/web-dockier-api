import { useProjectDetail } from "./useProjectDetail";
import { btnSecondary } from "../../utils/styles";
import DeployWizard from "../../components/DeployWizard";
import ConfirmModal from "../../components/ConfirmModal";
import ChevronLeftIcon from "../../components/icons/outlined/ChevronLeftIcon";
import ProjectHeader from "./sections/ProjectHeader";
import RepoInfoCard from "./sections/RepoInfoCard";
import ProjectDetailsCard from "./sections/ProjectDetailsCard";
import KpiDashboard from "./sections/KpiDashboard";
import ContributorsGrid from "./sections/ContributorsGrid";
import RecentCommits from "./sections/RecentCommits";
import RecentDeploys from "./sections/RecentDeploys";
import ProjectDescription from "./sections/ProjectDescription";
import LastDeployCard from "./sections/LastDeployCard";
import BranchModal from "./modals/BranchModal";
import PullLogModal from "./modals/PullLogModal";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";

export default function ProjectDetail() {
  const {
    project, loading, error, navigate,
    showDelete, setShowDelete, headerMenuOpen, setHeaderMenuOpen,
    handleDelete, handlePullOrigin, handleOpenBranchModal,
    showDeployWizard, setShowDeployWizard,
    allProviders, analysis, analysisLoading, analysisError, fetchLastDeploy, refreshAnalysis,
    stats, statsLoading, statsError,
    badges, allBadges,
    recentCommits, commitsLoading, commitsError,
    showBranchModal, setShowBranchModal,
    branchList, branchLoading, branchSearch, setBranchSearch, handleSwitchBranch,
    pullLog, setPullLog, pullLoading,
    lastDeploy, destroying, showDestroyConfirm, setShowDestroyConfirm, handleDestroy,
    recentDeploys,
  } = useProjectDetail();

  if (loading) {
    return <PageLoading />;
  }

  if (error || !project) {
    return (
      <div>
        <PageError message={error || "Project not found"} />
        <div className="text-center mt-4">
          <button type="button" onClick={() => navigate("/projects")} className={btnSecondary}>
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
        <ChevronLeftIcon className="size-4 " />
        Back to Projects
      </button>

      <ProjectHeader
        project={project}
        headerMenuOpen={headerMenuOpen}
        onToggleMenu={() => setHeaderMenuOpen(!headerMenuOpen)}
        onCloseMenu={() => setHeaderMenuOpen(false)}
        onDeploy={() => setShowDeployWizard(true)}
        onPull={handlePullOrigin}
        onSwitchBranch={handleOpenBranchModal}
        onDelete={() => setShowDelete(true)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <RepoInfoCard project={project} stats={stats} badges={badges} allBadges={allBadges} />
        <ProjectDetailsCard project={project} lastCommitDate={stats?.lastCommitDate} />
      </div>

      <ProjectDescription analysis={analysis} analysisLoading={analysisLoading} onRefresh={refreshAnalysis} projectId={project.id} />

      {/* UserJourneyTree hidden for now */}

      {project.connectionId && project.repository && (
        <KpiDashboard stats={stats} statsLoading={statsLoading} statsError={statsError} />
      )}

      <ContributorsGrid stats={stats} />

      <RecentCommits commits={recentCommits} commitsLoading={commitsLoading} commitsError={commitsError} />

      <RecentDeploys deploys={recentDeploys} allProviders={allProviders} navigate={navigate} />

      {lastDeploy && (
        <LastDeployCard
          lastDeploy={lastDeploy}
          allProviders={allProviders}
          destroying={destroying}
          onDestroy={() => setShowDestroyConfirm(true)}
          onViewDetails={() => navigate(`/deploy/${lastDeploy.id}`)}
        />
      )}

      <DeployWizard
        open={showDeployWizard}
        onClose={() => setShowDeployWizard(false)}
        project={project}
        analysis={analysis}
        analysisLoading={analysisLoading}
        analysisError={analysisError}
        providers={allProviders}
        onDeployComplete={() => fetchLastDeploy()}
      />

      <ConfirmModal open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} message={`Are you sure you want to delete "${project.name}"?`} />

      <ConfirmModal
        open={showDestroyConfirm}
        onClose={() => setShowDestroyConfirm(false)}
        title="Destroy Deployment"
        message="This will destroy all cloud infrastructure for this deployment (servers, firewall rules, static IPs, etc). This action cannot be undone."
        confirmLabel="Destroy"
        onConfirm={handleDestroy}
      />

      <PullLogModal pullLog={pullLog} pullLoading={pullLoading} onClose={() => setPullLog(null)} />

      <BranchModal
        open={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        branchList={branchList}
        branchLoading={branchLoading}
        branchSearch={branchSearch}
        onSearchChange={setBranchSearch}
        currentBranch={project.branch}
        onSwitchBranch={handleSwitchBranch}
      />
    </div>
  );
}
