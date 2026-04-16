import { useProjectDetail } from "./useProjectDetail";
import { btnSecondary, cardCls } from "./constants";
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
import LastDeployCard from "./sections/LastDeployCard";
import BranchModal from "./modals/BranchModal";
import PullLogModal from "./modals/PullLogModal";

export default function ProjectDetail() {
  const {
    project, loading, error, navigate,
    showDelete, setShowDelete, headerMenuOpen, setHeaderMenuOpen,
    handleDelete, handlePullOrigin, handleOpenBranchModal,
    showDeployWizard, setShowDeployWizard,
    allProviders, analysis, analysisLoading, analysisError, fetchLastDeploy,
    stats, statsLoading, statsError,
    recentCommits, commitsLoading, commitsError,
    showBranchModal, setShowBranchModal,
    branchList, branchLoading, branchSearch, setBranchSearch, handleSwitchBranch,
    pullLog, setPullLog, pullLoading,
    lastDeploy, destroying, showDestroyConfirm, setShowDestroyConfirm, handleDestroy,
    recentDeploys,
  } = useProjectDetail();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-16">
        <p className="text-danger-500 text-sm mb-4">{error || "Project not found"}</p>
        <button onClick={() => navigate("/projects")} className={btnSecondary}>Back to Projects</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate("/projects")} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors mb-6">
        <ChevronLeftIcon className="w-4 h-4" />
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
        <RepoInfoCard project={project} stats={stats} techStack={analysis?.techStack} />
        <ProjectDetailsCard project={project} />
      </div>

      {(() => {
        const summary = analysis?.aiAnalysis?.summary
          || (analysis?.techStack?.length
            ? `${analysis.primaryLanguage || analysis.techStack[0]?.name} project using ${analysis.techStack.slice(0, 4).map(t => t.name).join(", ")}${analysis.hasDocker ? ". Docker-ready" : ""}${analysis.hasCi ? " with CI/CD configured" : ""}.`
            : null);
        return summary ? (
          <div className={`${cardCls} p-5 mb-6`}>
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">Description</h2>
            <p className="text-sm text-text leading-relaxed">{summary}</p>
          </div>
        ) : null;
      })()}

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
