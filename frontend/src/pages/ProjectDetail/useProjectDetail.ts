/**
 * useProjectDetail — Composer Hook
 *
 * Thin orchestrator that composes focused sub-hooks and returns the same
 * public shape consumed by ProjectDetail.tsx and its child sections.
 *
 * Each sub-hook owns a single concern:
 *   - useProjectData: core project fetch, name edit
 *   - useRepoStats: stats + tech badges
 *   - useRepoActivity: commits, issues, PRs
 *   - useProjectAnalysis: AI analysis + cache
 *   - useProjectDeploys: providers, recent deploys/scans, wizard visibility
 *
 * Returns only what the page renders. Anything added here that no consumer
 * reads is dead on arrival — the branch switcher and pull-from-origin flows
 * sat here unreachable for exactly that reason.
 */

import { useEffect } from "react";
import { useProjectData } from "./hooks/useProjectData";
import { useRepoStats } from "./hooks/useRepoStats";
import { useRepoActivity } from "./hooks/useRepoActivity";
import { useProjectAnalysis } from "./hooks/useProjectAnalysis";
import { useProjectDeploys } from "./hooks/useProjectDeploys";

export function useProjectDetail() {
  const data = useProjectData();
  const { project, projectId, navigate, openDeployFromNav } = data;

  const { stats, statsLoading, statsError, badges, allBadges } = useRepoStats(project);
  const activity = useRepoActivity(project);
  const analysisHook = useProjectAnalysis(project);
  const deploys = useProjectDeploys(project, projectId);

  // Auto-open deploy wizard from navigation state
  useEffect(() => {
    if (openDeployFromNav) {
      deploys.setShowDeployWizard(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDeployFromNav]);

  return {
    // Core project data
    project: data.project,
    setProject: data.setProject,
    refetchProject: data.refetchProject,
    loading: data.loading,
    error: data.error,
    navigate,
    // Header
    handleUpdateName: data.handleUpdateName,
    nameSaving: data.nameSaving,
    nameError: data.nameError,
    // Deploy wizard
    showDeployWizard: deploys.showDeployWizard,
    setShowDeployWizard: deploys.setShowDeployWizard,
    allProviders: deploys.allProviders,
    analysis: analysisHook.analysis,
    analysisLoading: analysisHook.analysisLoading,
    analysisError: analysisHook.analysisError,
    fetchLastDeploy: deploys.fetchLastDeploy,
    // Stats
    stats,
    statsLoading,
    statsError,
    badges,
    allBadges,
    // Recent commits
    recentCommits: activity.recentCommits,
    commitsLoading: activity.commitsLoading,
    commitsError: activity.commitsError,
    // Open issues
    openIssues: activity.openIssues,
    setOpenIssues: activity.setOpenIssues,
    issuesLoading: activity.issuesLoading,
    issuesError: activity.issuesError,
    // Pull requests
    pullRequests: activity.pullRequests,
    pullRequestsLoading: activity.pullRequestsLoading,
    pullRequestsError: activity.pullRequestsError,
    // Recent deploys and scans
    recentDeploys: deploys.recentDeploys,
    recentScans: deploys.recentScans,
    deploysError: deploys.deploysError,
    scansError: deploys.scansError,
    fetchScans: deploys.fetchScans,
    hasLiveDeploy: deploys.hasLiveDeploy,
    deploysLoaded: deploys.deploysLoaded,
    scansLoaded: deploys.scansLoaded,
  };
}
