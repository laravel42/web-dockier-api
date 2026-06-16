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
import OpenIssues from "./sections/OpenIssues";
import PullRequests from "./sections/PullRequests";
import RecentCommits from "./sections/RecentCommits";
import RecentDeploys from "./sections/RecentDeploys";
import RecentScans from "./sections/RecentScans";
import ProjectDescription from "./sections/ProjectDescription";
import PullLogModal from "./modals/PullLogModal";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";

export default function ProjectDetail() {
  const {
    project, loading, error, navigate,
    showDelete, setShowDelete, headerMenuOpen, setHeaderMenuOpen,
    handleDelete, handlePullOrigin,
    handleUpdateName, nameSaving, nameError,
    showDeployWizard, setShowDeployWizard,
    allProviders, analysis, analysisLoading, analysisError, fetchLastDeploy, refreshAnalysis,
    stats, statsLoading, statsError,
    badges, allBadges,
    recentCommits, commitsLoading, commitsError,
    openIssues, issuesLoading, issuesError,
    pullRequests, pullRequestsLoading, pullRequestsError,
    loadBranches,
    branchList, branchLoading, branchSearch, setBranchSearch, handleSwitchBranch,
    pullLog, setPullLog, pullLoading,
    recentDeploys,
    recentScans,
  } = useProjectDetail();

  const nameByLogin: Record<string, string> = {};
  for (const c of recentCommits) {
    if (c.authorLogin && c.author && c.author !== c.authorLogin) {
      nameByLogin[c.authorLogin.toLowerCase()] = c.author;
    }
  }

  const lastSuccessfulDeployUrl = recentDeploys.find(
    (d) => (d.status === "success" || d.status === "completed") && d.appUrl,
  )?.appUrl;

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
        onDelete={() => setShowDelete(true)}
        onNameSave={handleUpdateName}
        nameSaving={nameSaving}
        nameError={nameError}
        branchList={branchList}
        branchLoading={branchLoading}
        branchSearch={branchSearch}
        onBranchSearchChange={setBranchSearch}
        onLoadBranches={loadBranches}
        onSwitchBranch={handleSwitchBranch}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 items-stretch">
        <RepoInfoCard project={project} stats={stats} badges={badges} allBadges={allBadges} />
        <ProjectDetailsCard project={project} deployUrl={lastSuccessfulDeployUrl} />
      </div>

      <ProjectDescription
        analysis={analysis}
        analysisLoading={analysisLoading}
        onRefresh={refreshAnalysis}
        projectId={project.id}
        project={project}
      />

      {/* UserJourneyTree hidden for now */}

      {project.connectionId && project.repository && (
        <KpiDashboard stats={stats} statsLoading={statsLoading} statsError={statsError} />
      )}

      <ContributorsGrid stats={stats} nameByLogin={nameByLogin} />

      {project.connectionId && project.repository && (
        <>
          <OpenIssues issues={openIssues} issuesLoading={issuesLoading} issuesError={issuesError} />
          <PullRequests
            pullRequests={pullRequests}
            pullRequestsLoading={pullRequestsLoading}
            pullRequestsError={pullRequestsError}
          />
        </>
      )}

      <RecentCommits commits={recentCommits} commitsLoading={commitsLoading} commitsError={commitsError} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8 items-stretch">
        <RecentDeploys
          deploys={recentDeploys}
          allProviders={allProviders}
          navigate={navigate}
          fallbackCommitHash={stats?.lastCommitHash}
        />

        <RecentScans scans={recentScans} navigate={navigate} />
      </div>

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

      <PullLogModal pullLog={pullLog} pullLoading={pullLoading} onClose={() => setPullLog(null)} />
    </div>
  );
}
