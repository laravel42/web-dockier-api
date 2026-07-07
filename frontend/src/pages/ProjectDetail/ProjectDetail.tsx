import { useProjectDetail } from "./useProjectDetail";
import { btnSecondary } from "../../utils/styles";
import DeployWizard from "../../components/DeployWizard";
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
import IssueDetailModal from "./modals/IssueDetailModal";
import PRDetailModal from "./modals/PRDetailModal";
import PageLoading from "../../components/ui/PageLoading";
import PageError from "../../components/ui/PageError";
import { useState } from "react";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import { gitApi } from "../../services/api";
import type { RepoIssue, RepoPullRequest } from "../../types";

export default function ProjectDetail() {
  const {
    project, setProject, loading, error, navigate,
    handleUpdateName, nameSaving, nameError,
    showDeployWizard, setShowDeployWizard,
    allProviders, analysis, analysisLoading, analysisError, fetchLastDeploy,
    stats, statsLoading, statsError,
    badges, allBadges,
    recentCommits, commitsLoading, commitsError,
    openIssues, setOpenIssues, issuesLoading, issuesError,
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

  // Issue detail modal state
  const [selectedIssue, setSelectedIssue] = useState<RepoIssue | null>(null);
  const [fixResult, setFixResult] = useState<{ prUrl: string; prNumber: number; summary: string; filesChanged: number } | null>(null);

  const handleCloseIssue = async (issueNumber: number) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    await gitApi.closeIssue(project.connectionId, parsed.owner, parsed.repo, issueNumber);
    // Remove the closed issue from the list
    setOpenIssues((prev) => prev.filter((i) => i.number !== issueNumber));
  };

  const handleFixWithAI = async (issue: RepoIssue) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const baseBranch = project.branch || "main";
    const result = await gitApi.fixIssue(project.connectionId, {
      owner: parsed.owner,
      repo: parsed.repo,
      baseBranch,
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
    setFixResult(result);
  };

  // PR detail modal state
  const [selectedPR, setSelectedPR] = useState<RepoPullRequest | null>(null);

  const handleReviewWithAI = async (pr: RepoPullRequest) => {
    if (!project) throw new Error("Project not loaded");
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) throw new Error("Invalid repository URL");
    return await gitApi.reviewPR(project.connectionId, {
      owner: parsed.owner,
      repo: parsed.repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body,
    });
  };

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
        onDeploy={() => setShowDeployWizard(true)}
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
        projectId={project.id}
        project={project}
        providers={allProviders}
        onProjectUpdate={setProject}
      />

      {/* UserJourneyTree hidden for now */}

      {project.connectionId && project.repository && (
        <KpiDashboard stats={stats} statsLoading={statsLoading} statsError={statsError} />
      )}

      <ContributorsGrid stats={stats} nameByLogin={nameByLogin} />

      {project.connectionId && project.repository && (
        <>
          <OpenIssues issues={openIssues} issuesLoading={issuesLoading} issuesError={issuesError} onIssueClick={setSelectedIssue} />
          <PullRequests
            pullRequests={pullRequests}
            pullRequestsLoading={pullRequestsLoading}
            pullRequestsError={pullRequestsError}
            onPRClick={setSelectedPR}
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
        onDeployComplete={fetchLastDeploy}
      />

      <PullLogModal pullLog={pullLog} pullLoading={pullLoading} onClose={() => setPullLog(null)} />

      <IssueDetailModal
        issue={selectedIssue}
        onClose={() => { setSelectedIssue(null); setFixResult(null); }}
        onCloseIssue={handleCloseIssue}
        onFixWithAI={handleFixWithAI}
        fixResult={fixResult}
      />

      <PRDetailModal
        pr={selectedPR}
        onClose={() => setSelectedPR(null)}
        onReviewWithAI={handleReviewWithAI}
      />
    </div>
  );
}
