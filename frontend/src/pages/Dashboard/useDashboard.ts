import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { projectsApi, deployApi, codeAnalysisApi } from "../../services/api";
import type { Project, Deploy, Scan, Provider } from "./types";

export function useDashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [projRes, depRes, scanRes, provRes] = await Promise.all([
          projectsApi.list(),
          deployApi.listDeployments(),
          codeAnalysisApi.listScans(),
          deployApi.listProviders(),
        ]);
        setProjects(projRes.projects);
        setDeploys(depRes.deployments);
        setScans(scanRes.scans);
        setProviders(provRes.providers);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  const successDeploys = deploys.filter(d => d.status === "success").length;
  const failedDeploys = deploys.filter(d => d.status === "failed").length;
  const totalFindings = scans.reduce((sum, s) => sum + (s.summary?.totalFindings || 0), 0);
  const recentDeploys = deploys.slice(0, 5);
  const recentScans = scans.slice(0, 5);

  const projectMap: Record<string, Project> = {};
  for (const p of projects) projectMap[p.id] = p;

  return {
    navigate,
    projects, deploys, scans, providers,
    loading,
    successDeploys, failedDeploys, totalFindings,
    recentDeploys, recentScans,
    projectMap,
  };
}
