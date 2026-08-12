import { useProjectDetail } from "./useProjectDetail";
import DeployWizard from "@/components/DeployWizard";
import Button from "@/components/ui/Button";
import ProjectHeader from "./sections/ProjectHeader";
import RepoInfoCard from "./sections/RepoInfoCard";
import ProjectDetailsCard from "./sections/ProjectDetailsCard";
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
import PageLoading from "@/components/ui/PageLoading";
import PageError from "@/components/ui/PageError";
import { useState } from "react";
import { useProjectSiteUrl } from "@/hooks/useProjectSiteUrl";
import { useProjectRepoFavicon } from "@/hooks/useProjectRepoFavicon";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { resolveDeployUrl } from "@/utils/resolveDeployUrl";
import { gitApi } from "@/services/api";
import type { RepoIssue, RepoPullRequest } from "@/types";
import { ChevronLeftIcon } from "lucide-react";

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
    pullLog, setPullLog, pullLoading,
    recentDeploys,
    recentScans,
    deploysError, scansError, fetchScans, hasLiveDeploy,
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

  const lastSuccessfulDeployUrl = recentDeploys
    .filter((d) => d.status === "success")
    .map((d) => resolveDeployUrl(d))
    .find(Boolean);
  const siteUrl = useProjectSiteUrl(
    project?.id,
    lastSuccessfulDeployUrl,
    project?.infraState === "torn_down",
  );
  const repoFaviconUrl = useProjectRepoFavicon(project ?? undefined);

  if (loading) {
    return <PageLoading />;
  }

  if (error || !project) {
    return (
      <div>
        <PageError message={error || "Project not found"} />
        <div className="text-center mt-4">
          <Button variant="secondary" onClick={() => navigate("/projects")}>
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  const hasRepo = Boolean(project.connectionId && project.repository);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/projects")}
        iconLeft={<ChevronLeftIcon className="size-4" />}
        className="mb-6"
      >
        Back to Projects
      </Button>

      <ProjectHeader
        project={project}
        siteUrl={siteUrl}
        repoFaviconUrl={repoFaviconUrl}
        onDeploy={() => setShowDeployWizard(true)}
        onScan={() => navigate(`/security/project/${project.id}`)}
        onNameSave={handleUpdateName}
        nameSaving={nameSaving}
        nameError={nameError}
        liveDeploy={hasLiveDeploy}
      />

      <div className="mb-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <RepoInfoCard project={project} stats={stats} badges={badges} allBadges={allBadges} />
        <ProjectDetailsCard
          project={project}
          deployUrl={lastSuccessfulDeployUrl}
          stats={stats}
          statsLoading={statsLoading}
          statsError={statsError}
        />
      </div>

      <ProjectDescription
        analysis={analysis}
        analysisLoading={analysisLoading}
        recentScans={recentScans}
        recentDeploys={recentDeploys}
        projectId={project.id}
        project={project}
        onProjectUpdate={setProject}
        activityPanel={
          <div>
            <RecentCommits commits={recentCommits} commitsLoading={commitsLoading} commitsError={commitsError} />
            {hasRepo && (
              <div className="grid grid-cols-1 gap-4">
                <OpenIssues
                  issues={openIssues}
                  issuesLoading={issuesLoading}
                  issuesError={issuesError}
                  onIssueClick={setSelectedIssue}
                />
                <PullRequests
                  pullRequests={pullRequests}
                  pullRequestsLoading={pullRequestsLoading}
                  pullRequestsError={pullRequestsError}
                  onPRClick={setSelectedPR}
                />
              </div>
            )}
            <ContributorsGrid stats={stats} nameByLogin={nameByLogin} />
          </div>
        }
        deploysPanel={
          <RecentDeploys
            deploys={recentDeploys}
            allProviders={allProviders}
            navigate={navigate}
            fallbackCommitHash={stats?.lastCommitHash}
            error={deploysError}
            onRetry={fetchLastDeploy}
            onDeploy={() => setShowDeployWizard(true)}
          />
        }
        securityPanel={
          <RecentScans
            scans={recentScans}
            navigate={navigate}
            projectId={project.id}
            error={scansError}
            onRetry={fetchScans}
          />
        }
      />

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
