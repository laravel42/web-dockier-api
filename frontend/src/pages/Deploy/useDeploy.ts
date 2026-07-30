import { useNavigate } from "react-router-dom";
import { deployApi, projectsApi } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import { useViewMode } from "../../hooks/useViewMode";
import type { Deployment, Project } from "../../types";
import { compareByTime } from "../../utils/sortByTime";

interface DeployPageData {
  deployments: Deployment[];
  projects: Project[];
}

async function fetchDeployPageData(): Promise<DeployPageData> {
  const [dRes, projRes] = await Promise.all([
    deployApi.listDeployments(),
    projectsApi.list(),
  ]);
  return {
    deployments: dRes.deployments,
    projects: projRes.projects,
  };
}

export function useDeploy() {
  const navigate = useNavigate();
  const { viewMode, changeViewMode } = useViewMode("deployments-view");
  const { data, loading, error, reload } = useAsyncData(fetchDeployPageData, []);

  const deployments = data?.deployments ?? [];
  const projects = data?.projects ?? [];
  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(projects);

  const projectById: Record<string, Project> = {};
  for (const p of projects) {
    projectById[p.id] = p;
  }

  const sortedDeployments = [...deployments].sort((a, b) => compareByTime(a, b, "updated"));

  const grouped = Object.entries(
    sortedDeployments.reduce<Record<string, Deployment[]>>((acc, d) => {
      const key = d.projectId || d.repo;
      (acc[key] ||= []).push(d);
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => compareByTime(a[0], b[0], "updated"));

  return {
    navigate,
    deployments,
    loading,
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
