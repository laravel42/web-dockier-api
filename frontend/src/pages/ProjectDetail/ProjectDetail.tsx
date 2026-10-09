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
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectSiteUrl } from "@/hooks/useProjectSiteUrl";
import { useProjectRepoFavicon } from "@/hooks/useProjectRepoFavicon";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { resolveDeployUrl } from "@/utils/resolveDeployUrl";
import { gitApi } from "@/services/api";
import type { RepoIssue, RepoPullRequest } from "@/types";
import { ChevronLeftIcon } from "lucide-react";

export default function ProjectDetail() {
  const {
    project, setProject, refetchProject, loading, error, navigate,
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

  // Bumped after a successful deploy to re-fetch the primary custom domain
  // (see useProjectSiteUrl) — projectId is stable, so the domain fetch needs an
  // explicit nudge to pick up a newly-active custom domain without a reload.
  const [domainRefreshKey, setDomainRefreshKey] = useState(0);

  // Guards for the post-deploy project poll below. `mountedRef` bails the loop
  // after unmount; `pollRunRef` is an incrementing run-id so a second
  // deploy-complete supersedes any in-flight poll (only the latest run may act).
  const mountedRef = useRef(true);
  const pollRunRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // After a deploy finishes, refresh the deploy list AND re-fetch the core
  // project so infraState-derived fields (site URL, torn-down state) update
  // without a page reload, and bump domainRefreshKey so a newly-active custom
  // domain replaces the generic deploy URL. Order preserved: fetchLastDeploy first.
  //
  // The backend marks infra_state="live" before flipping the deployment to
  // "success", so a single refetch is normally enough. This bounded poll is
  // defense-in-depth: it refetches the project up to 5 times, ~1.5s apart,
  // stopping early as soon as infraState is no longer "torn_down" (ideally
  // "live"). When the poll settles it bumps domainRefreshKey again so the
  // custom-domain hook re-reads once infra is live.
  const handleDeployComplete = useCallback(() => {
    void fetchLastDeploy();
    setDomainRefreshKey((k) => k + 1);

    const runId = ++pollRunRef.current;
    const maxAttempts = 5;
    const intervalMs = 1500;

    const poll = async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!mountedRef.current || pollRunRef.current !== runId) return;
        const fetched = await refetchProject();
        if (!mountedRef.current || pollRunRef.current !== runId) return;
        if (fetched && fetched.infraState !== "torn_down") break;
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
      if (!mountedRef.current || pollRunRef.current !== runId) return;
      // Re-read the primary custom domain now that infra is (likely) live.
      setDomainRefreshKey((k) => k + 1);
    };

    void poll();
  }, [fetchLastDeploy, refetchProject]);

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
  const deployedCommitHash =
    recentDeploys.find((d) => d.status === "success" && d.commitHash)?.commitHash || undefined;
  const siteUrl = useProjectSiteUrl(
    project?.id,
    lastSuccessfulDeployUrl,
    project?.infraState === "torn_down",
    domainRefreshKey,
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
        deployedCommitHash={deployedCommitHash}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        badges={badges}
        allBadges={allBadges}
        nameByLogin={nameByLogin}
        recentCommits={recentCommits}
        domainRefreshKey={domainRefreshKey}
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
          <div className="flex flex-col gap-6">
            <RecentCommits commits={recentCommits} commitsLoading={commitsLoading} commitsError={commitsError} />
            {hasRepo && (
              <>
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
              </>
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
        onDeployComplete={handleDeployComplete}
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
