import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi } from "@/services/api";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useProjectBadges } from "@/hooks/useProjectBadges";
import { useViewMode } from "@/hooks/useViewMode";
import type { Deployment, Project } from "@/types";
import { compareByTime } from "@/utils/sortByTime";

// The API max. Large on purpose: rows are grouped by project, and a group only
// spans pages when a page boundary cuts through it.
// shortcut: grouping and search cover the current page only, upgrade with server-side grouping.
const PAGE_SIZE = 100;

/**
 * The only project fields a deployment row can supply. Deliberately not a
 * `Project` — the list has no infra state and no real connection or platform.
 */
export type DeployListProject = Pick<
  Project,
  "id" | "name" | "repository" | "branch" | "connectionId" | "platform"
>;

export function useDeploy() {
  const navigate = useNavigate();
  const { viewMode, changeViewMode } = useViewMode("deployments-view");
  const [offset, setOffset] = useState(0);
  const { data, loading, error, reload } = useAsyncData(
    () => deployApi.listDeployments({ limit: PAGE_SIZE, offset }),
    [offset],
  );

  const allDeployments: Deployment[] = data?.deployments ?? [];
  const pagination = data?.pagination ?? { total: 0, limit: PAGE_SIZE, offset };
  const goToPage = (page: number) => setOffset((page - 1) * PAGE_SIZE);

  // Build a lightweight project lookup from deployment data for badges/display
  const projectById: Record<string, DeployListProject> = {};
  for (const d of allDeployments) {
    if (d.projectId && !projectById[d.projectId]) {
      projectById[d.projectId] = {
        id: d.projectId,
        name: d.projectName || d.repo,
        repository: d.repo,
        branch: d.branch,
        connectionId: "",
        platform: "",
      };
    }
  }

  const projectsForBadges = Object.values(projectById);
  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(projectsForBadges);

  const sortedDeployments = [...allDeployments].sort((a, b) => compareByTime(a, b, "updated"));

  const grouped = Object.entries(
    sortedDeployments.reduce<Record<string, Deployment[]>>((acc, d) => {
      const key = d.projectId || d.repo;
      (acc[key] ||= []).push(d);
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => compareByTime(a[0], b[0], "updated"));

  return {
    navigate,
    deployments: allDeployments,
    // Only the first load blanks the page; paging keeps the toolbar and list mounted.
    loading: loading && data === null,
    pagination,
    goToPage,
    error,
    reload,
    projectLangs,
    projectBadgeLoading,
    projectById,
    grouped,
    viewMode,
    changeViewMode,
  };
}
