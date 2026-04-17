import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi, projectsApi } from "../../services/api";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import type { Deployment, Project } from "../../types";

export function useDeploy() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [dRes, projRes] = await Promise.all([
          deployApi.listDeployments(),
          projectsApi.list(),
        ]);
        setDeployments(dRes.deployments);
        setProjects(projRes.projects);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  const projectLangs = useProjectBadges(projects);

  // Match projects by id
  const projectById: Record<string, Project> = {};
  for (const p of projects) {
    projectById[p.id] = p;
  }

  // Group deployments by projectId (fall back to repo for legacy deployments without projectId)
  const grouped = Object.entries(
    deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
      const key = d.projectId || d.repo;
      (acc[key] ||= []).push(d);
      return acc;
    }, {})
  ).sort(([, a], [, b]) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime());

  return {
    navigate,
    deployments,
    loading,
    projectLangs,
    projectById,
    grouped,
  };
}
