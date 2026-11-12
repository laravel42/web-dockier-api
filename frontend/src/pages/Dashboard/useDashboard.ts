import { useNavigate } from "react-router-dom";
import { projectsApi, deployApi, codeAnalysisApi } from "@/services/api";
import { useAsyncData } from "@/hooks/useAsyncData";
import type { Project, Deployment as Deploy, Scan, Provider } from "@/types";

interface DashboardData {
  projects: Project[];
  deploys: Deploy[];
  scans: Scan[];
  providers: Provider[];
  /** Tenant-wide totals. The lists above are only the newest page (20 by default). */
  totals: { projects: number; deploys: number; successDeploys: number; failedDeploys: number; scans: number };
}

async function fetchDashboardData(): Promise<DashboardData> {
  const [projRes, depRes, scanRes, provRes, successRes, failedRes] = await Promise.all([
    projectsApi.list(),
    deployApi.listDeployments(),
    codeAnalysisApi.listScans(),
    deployApi.listProviders(),
    // limit 1: only `pagination.total` is read.
    deployApi.listDeployments({ status: "success", limit: 1 }),
    deployApi.listDeployments({ status: "failed", limit: 1 }),
  ]);
  return {
    projects: projRes.projects,
    deploys: depRes.deployments,
    scans: scanRes.scans,
    providers: provRes.providers,
    totals: {
      projects: projRes.pagination.total,
      deploys: depRes.pagination.total,
      successDeploys: successRes.pagination.total,
      failedDeploys: failedRes.pagination.total,
      scans: scanRes.pagination.total,
    },
  };
}

export function useDashboard() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(fetchDashboardData, []);

  const projects = data?.projects ?? [];
  const deploys = data?.deploys ?? [];
  const scans = data?.scans ?? [];
  const providers = data?.providers ?? [];

  const totals = data?.totals ?? { projects: 0, deploys: 0, successDeploys: 0, failedDeploys: 0, scans: 0 };
  // shortcut: summed over the newest page of scans only, upgrade when the API exposes a findings total.
  const totalFindings = scans.reduce((sum, s) => sum + (s.summary?.totalFindings || 0), 0);
  const recentDeploys = deploys.slice(0, 5);
  const recentScans = scans.slice(0, 5);

  const projectMap: Record<string, Project> = {};
  for (const p of projects) projectMap[p.id] = p;

  // Most recent known commit per project, derived from loaded deploys/scans.
  // Used as a fallback for records that have no commit of their own (e.g. queued/failed).
  const commitByProject: Record<string, { commit: string; ts: number }> = {};
  const considerCommit = (projectId: string, commit: string, when: string) => {
    if (!projectId || !commit) return;
    const ts = Date.parse(when) || 0;
    const existing = commitByProject[projectId];
    if (!existing || ts > existing.ts) commitByProject[projectId] = { commit, ts };
  };
  for (const d of deploys) considerCommit(d.projectId, d.commitHash, d.updatedAt || d.createdAt);
  for (const s of scans) considerCommit(s.projectId, s.commitSha, s.updatedAt || s.createdAt);
  const fallbackCommitByProject: Record<string, string> = {};
  for (const [pid, v] of Object.entries(commitByProject)) fallbackCommitByProject[pid] = v.commit;

  return {
    navigate,
    projects,
    providers,
    loading,
    error,
    reload,
    totals,
    totalFindings,
    recentDeploys,
    recentScans,
    projectMap,
    fallbackCommitByProject,
  };
}
