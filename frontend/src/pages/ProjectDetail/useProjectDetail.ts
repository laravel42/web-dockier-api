/**
 * useProjectDetail — Composer Hook
 *
 * Thin orchestrator that composes focused sub-hooks and returns the same
 * public shape consumed by ProjectDetail.tsx and its child sections.
 *
 * Each sub-hook owns a single concern:
 *   - useProjectData: core project fetch, CRUD, branch, pull
 *   - useRepoStats: stats + tech badges
 *   - useRepoActivity: commits, issues, PRs
 *   - useProjectAnalysis: AI analysis + cache + refresh
 *   - useProjectDeploys: providers, recent deploys/scans, wizard visibility
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

  // Wrap handlePullOrigin to pass stats (avoids stale closure in the sub-hook)
  const handlePullOrigin = () => data.handlePullOrigin(stats);

  return {
    // Core project data
    project: data.project,
    setProject: data.setProject,
    loading: data.loading,
    error: data.error,
    navigate,
    // Header
    showDelete: data.showDelete,
    setShowDelete: data.setShowDelete,
    headerMenuOpen: data.headerMenuOpen,
    setHeaderMenuOpen: data.setHeaderMenuOpen,
    handleDelete: data.handleDelete,
    handlePullOrigin,
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
    refreshAnalysis: analysisHook.refreshAnalysis,
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
    // Branch selector
    loadBranches: data.loadBranches,
    branchList: data.branchList,
    branchLoading: data.branchLoading,
    branchSearch: data.branchSearch,
    setBranchSearch: data.setBranchSearch,
    handleSwitchBranch: data.handleSwitchBranch,
    // Pull log
    pullLog: data.pullLog,
    setPullLog: data.setPullLog,
    pullLoading: data.pullLoading,
    // Recent deploys
    recentDeploys: deploys.recentDeploys,
    recentScans: deploys.recentScans,
    deploysError: deploys.deploysError,
    scansError: deploys.scansError,
    fetchScans: deploys.fetchScans,
    hasLiveDeploy: deploys.hasLiveDeploy,
    hasLiveScan: deploys.hasLiveScan,
  };
}
