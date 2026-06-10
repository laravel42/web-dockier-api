import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi, projectsApi } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import type { Deployment, Project } from "../../types";

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
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    () => (localStorage.getItem("deployments-view") as "cards" | "table") || "cards",
  );
  const { data, loading, error, reload } = useAsyncData(fetchDeployPageData, []);

  const deployments = data?.deployments ?? [];
  const projects = data?.projects ?? [];
  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(projects);

  const projectById: Record<string, Project> = {};
  for (const p of projects) {
    projectById[p.id] = p;
  }

  const grouped = Object.entries(
    deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
      const key = d.projectId || d.repo;
      (acc[key] ||= []).push(d);
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime());

  const changeViewMode = (mode: "cards" | "table") => {
    setViewMode(mode);
    localStorage.setItem("deployments-view", mode);
  };

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
