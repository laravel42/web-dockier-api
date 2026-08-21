import { useCallback, useMemo } from "react";
import { gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { useAsyncData } from "@/hooks/useAsyncData";
import type { Project, CommitInfo, RepoIssue, RepoPullRequest } from "@/types";

/**
 * Recent commits, open issues, and pull requests for the project.
 *
 * Uses `useAsyncData` for each domain (commits, issues, PRs), which handles
 * loading/error state, stale-request cancellation, and manual reload.
 */
export function useRepoActivity(project: Project | null) {
  const parsed = useMemo(
    () => (project?.repository ? parseOwnerRepo(project.repository) : null),
    [project?.repository],
  );

  const enabled = !!(
    project?.connectionId &&
    project.repository &&
    project.sourceType !== "template" &&
    parsed
  );

  const { data: recentCommits, loading: commitsLoading, error: commitsError } = useAsyncData<CommitInfo[]>(
    () => gitApi.getRecentCommits(project!.connectionId, parsed!.owner, parsed!.repo, project!.branch || undefined, 5)
      .then((res) => res.commits),
    [project?.id, project?.connectionId, project?.repository, project?.branch],
    { enabled },
  );

  const { data: openIssues, loading: issuesLoading, error: issuesError, setData: setOpenIssuesRaw } = useAsyncData<RepoIssue[]>(
    () => gitApi.getOpenIssues(project!.connectionId, parsed!.owner, parsed!.repo, 10)
      .then((res) => res.issues),
    [project?.id, project?.connectionId, project?.repository],
    { enabled },
  );

  // Wrap setData to match the consumer's expected signature: (updater: (prev) => next) => void
  const setOpenIssues = useCallback(
    (updater: (prev: RepoIssue[]) => RepoIssue[]) => {
      setOpenIssuesRaw((prev) => updater(prev ?? []));
    },
    [setOpenIssuesRaw],
  );

  const { data: pullRequests, loading: pullRequestsLoading, error: pullRequestsError } = useAsyncData<RepoPullRequest[]>(
    () => gitApi.getPullRequests(project!.connectionId, parsed!.owner, parsed!.repo, 10)
      .then((res) => res.pullRequests),
    [project?.id, project?.connectionId, project?.repository],
    { enabled },
  );

  return {
    recentCommits: recentCommits ?? [],
    commitsLoading,
    commitsError: commitsError ?? "",
    openIssues: openIssues ?? [],
    setOpenIssues,
    issuesLoading,
    issuesError: issuesError ?? "",
    pullRequests: pullRequests ?? [],
    pullRequestsLoading,
    pullRequestsError: pullRequestsError ?? "",
  };
}
