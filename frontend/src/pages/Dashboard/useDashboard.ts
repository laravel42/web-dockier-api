import { useNavigate } from "react-router-dom";
import { projectsApi, deployApi, codeAnalysisApi } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import type { Project, Deployment as Deploy, Scan, Provider } from "../../types";

interface DashboardData {
  projects: Project[];
  deploys: Deploy[];
  scans: Scan[];
  providers: Provider[];
}

async function fetchDashboardData(): Promise<DashboardData> {
  const [projRes, depRes, scanRes, provRes] = await Promise.all([
    projectsApi.list(),
    deployApi.listDeployments(),
    codeAnalysisApi.listScans(),
    deployApi.listProviders(),
  ]);
  return {
    projects: projRes.projects,
    deploys: depRes.deployments,
    scans: scanRes.scans,
    providers: provRes.providers,
  };
}

export function useDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(fetchDashboardData, []);

  const projects = data?.projects ?? [];
  const deploys = data?.deploys ?? [];
  const scans = data?.scans ?? [];
  const providers = data?.providers ?? [];

  const successDeploys = deploys.filter((d) => d.status === "success").length;
  const failedDeploys = deploys.filter((d) => d.status === "failed").length;
  const totalFindings = scans.reduce((sum, s) => sum + (s.summary?.totalFindings || 0), 0);
  const recentDeploys = deploys.slice(0, 5);
  const recentScans = scans.slice(0, 5);

  const projectMap: Record<string, Project> = {};
  for (const p of projects) projectMap[p.id] = p;

  return {
    navigate,
    projects,
    deploys,
    scans,
    providers,
    loading,
    error,
    reload,
    successDeploys,
    failedDeploys,
    totalFindings,
    recentDeploys,
    recentScans,
    projectMap,
  };
}
