import { useNavigate } from "react-router-dom";
import { deployApi } from "@/services/api";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useProjectBadges } from "@/hooks/useProjectBadges";
import { useViewMode } from "@/hooks/useViewMode";
import type { Deployment, Project } from "@/types";
import { compareByTime } from "@/utils/sortByTime";

async function fetchDeployments(): Promise<Deployment[]> {
  const res = await deployApi.listDeployments();
  return res.deployments;
}

export function useDeploy() {
  const navigate = useNavigate();
  const { viewMode, changeViewMode } = useViewMode("deployments-view");
  const { data: deployments, loading, error, reload } = useAsyncData(fetchDeployments, []);

  const allDeployments = deployments ?? [];

  // Build a lightweight Project-like lookup from deployment data for badges/display
  const projectById: Record<string, Pick<Project, "id" | "name" | "repository" | "branch" | "connectionId" | "platform">> = {};
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

  const projectsForBadges = Object.values(projectById) as Project[];
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
    loading,
    error,
    reload,
    projectLangs,
    projectBadgeLoading,
    projectById: projectById as Record<string, Project>,
    grouped,
    viewMode,
    changeViewMode,
  };
}
