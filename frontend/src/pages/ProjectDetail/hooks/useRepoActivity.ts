import { useState, useEffect } from "react";
import { gitApi } from "@/services/api";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { getErrorMessage } from "@/utils/errors";
import type { Project, CommitInfo, RepoIssue, RepoPullRequest } from "@/types";

/**
 * Recent commits, open issues, and pull requests for the project.
 */
export function useRepoActivity(project: Project | null) {
  const [recentCommits, setRecentCommits] = useState<CommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState("");

  const [openIssues, setOpenIssues] = useState<RepoIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState("");

  const [pullRequests, setPullRequests] = useState<RepoPullRequest[]>([]);
  const [pullRequestsLoading, setPullRequestsLoading] = useState(false);
  const [pullRequestsError, setPullRequestsError] = useState("");

  useEffect(() => {
    if (!project?.connectionId || !project.repository) return;
    if (project.sourceType === "template") return;

    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    setCommitsLoading(true);
    setCommitsError("");
    gitApi.getRecentCommits(project.connectionId, parsed.owner, parsed.repo, project.branch || undefined, 5)
      .then((res) => setRecentCommits(res.commits))
      .catch((err: unknown) => setCommitsError(getErrorMessage(err, "Failed to load commits")))
      .finally(() => setCommitsLoading(false));

    setIssuesLoading(true);
    setIssuesError("");
    gitApi.getOpenIssues(project.connectionId, parsed.owner, parsed.repo, 10)
      .then((res) => setOpenIssues(res.issues))
      .catch((err: unknown) => setIssuesError(getErrorMessage(err, "Failed to load issues")))
      .finally(() => setIssuesLoading(false));

    setPullRequestsLoading(true);
    setPullRequestsError("");
    gitApi.getPullRequests(project.connectionId, parsed.owner, parsed.repo, 10)
      .then((res) => setPullRequests(res.pullRequests))
      .catch((err: unknown) => setPullRequestsError(getErrorMessage(err, "Failed to load pull requests")))
      .finally(() => setPullRequestsLoading(false));
  }, [project?.id, project?.connectionId, project?.repository, project?.branch, project?.sourceType]);

  return {
    recentCommits,
    commitsLoading,
    commitsError,
    openIssues,
    setOpenIssues,
    issuesLoading,
    issuesError,
    pullRequests,
    pullRequestsLoading,
    pullRequestsError,
  };
}
