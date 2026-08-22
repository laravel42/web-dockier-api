import { useProjectDetail } from "./useProjectDetail";
import DeployWizard from "@/components/DeployWizard";
import Button from "@/components/ui/Button";
import ProjectHeader from "./sections/ProjectHeader";
import ProjectDetailsCard from "./sections/ProjectDetailsCard";
import OpenIssues from "./sections/OpenIssues";
import PullRequests from "./sections/PullRequests";
import RecentCommits from "./sections/RecentCommits";
import RecentDeploys from "./sections/RecentDeploys";
import { DeployInfraStatus } from "./sections/ProjectPostureLine";
import RecentScans from "./sections/RecentScans";
import ProjectDescription from "./sections/ProjectDescription";
import PullLogModal from "./modals/PullLogModal";
import IssueDetailModal from "./modals/IssueDetailModal";
import PRDetailModal from "./modals/PRDetailModal";
import FixPreviewModal from "./modals/FixPreviewModal";
import ReviewPreviewModal, { type GeneratedReview } from "./modals/ReviewPreviewModal";
import type { FixPlan, ReviewComment } from "@/services/git";
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
    deploysLoaded,
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

  const [fixPlan, setFixPlan] = useState<FixPlan | null>(null);

  /** Generates the fix and shows it. Writes nothing — see FixPreviewModal. */
  const handleFixWithAI = async (issue: RepoIssue) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const plan = await gitApi.planFix(project.connectionId, {
      owner: parsed.owner,
      repo: parsed.repo,
      baseBranch: project.branch || "main",
      issueNumber: issue.number,
      issueTitle: issue.title,
      issueBody: issue.body,
    });
    setFixPlan(plan);
  };

  /** The only call in this flow that touches the repository. */
  const handleCreatePullRequest = async (plan: FixPlan) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) throw new Error("Invalid repository URL");
    const result = await gitApi.applyFix(project.connectionId, {
      owner: parsed.owner, repo: parsed.repo, plan,
    });
    setFixResult(result);
    setFixPlan(null);
  };

  // PR detail modal state
  const [selectedPR, setSelectedPR] = useState<RepoPullRequest | null>(null);

  const [pendingReview, setPendingReview] = useState<GeneratedReview | null>(null);

  /** Generates comments and shows them. Posts nothing. */
  const handleReviewWithAI = async (pr: RepoPullRequest) => {
    if (!project) throw new Error("Project not loaded");
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) throw new Error("Invalid repository URL");
    const review = await gitApi.generateReview(project.connectionId, {
      owner: parsed.owner,
      repo: parsed.repo,
      prNumber: pr.number,
      prTitle: pr.title,
      prBody: pr.body,
    });
    setPendingReview(review);
    return review;
  };

  /** Posts the subset the author approved, publicly, on their colleague's PR. */
  const handlePostReview = async (comments: ReviewComment[], approved: boolean) => {
    if (!project || !selectedPR || !pendingReview) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) throw new Error("Invalid repository URL");
    await gitApi.postReview(project.connectionId, {
      owner: parsed.owner,
      repo: parsed.repo,
      prNumber: selectedPR.number,
      summary: pendingReview.summary,
      approved,
      comments,
    });
    setPendingReview(null);
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/projects")}
          iconLeft={<ChevronLeftIcon className="size-4" />}
        >
          Back to Projects
        </Button>
        <DeployInfraStatus
          project={project}
          deploys={recentDeploys}
          allProviders={allProviders}
          error={deploysError}
          loaded={deploysLoaded}
        />
      </div>

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

      <ProjectDetailsCard
        project={project}
        deployUrl={lastSuccessfulDeployUrl}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        badges={badges}
        allBadges={allBadges}
        nameByLogin={nameByLogin}
      />

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
            fallbackCommitHash={stats?.lastCommitHash}
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

      <FixPreviewModal
        open={fixPlan !== null}
        plan={fixPlan}
        onClose={() => setFixPlan(null)}
        onCreatePullRequest={handleCreatePullRequest}
      />

      <ReviewPreviewModal
        open={pendingReview !== null}
        review={pendingReview}
        prNumber={selectedPR?.number ?? 0}
        onClose={() => setPendingReview(null)}
        onPost={handlePostReview}
      />

      <IssueDetailModal
        issue={selectedIssue}
        onClose={() => { setSelectedIssue(null); setFixResult(null); }}
        onCloseIssue={handleCloseIssue}
        onFixWithAI={handleFixWithAI}
        fixResult={fixResult}
        repoLabel={project.repository.replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "")}
      />

      <PRDetailModal
        pr={selectedPR}
        onClose={() => setSelectedPR(null)}
        onReviewWithAI={handleReviewWithAI}
      />
    </div>
  );
}
