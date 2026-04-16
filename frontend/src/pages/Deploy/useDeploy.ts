import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { deployApi, projectsApi, gitApi } from "../../services/api";
import type { Deployment, Project } from "./types";
import { repoKey } from "./utils";

export function useDeploy() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectLangs, setProjectLangs] = useState<Record<string, Array<{ name: string; category: string; confidence: number }>>>({});
  const fetchedLangsRef = useRef<Set<string>>(new Set());

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

  // Fetch tech badges from analysis_cache for each project
  useEffect(() => {
    if (projects.length === 0) return;
    for (const p of projects) {
      if (!p.repository || fetchedLangsRef.current.has(p.id)) continue;
      fetchedLangsRef.current.add(p.id);
      const key = repoKey(p.repository);
      gitApi.getRepoBadges(key, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs(prev => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

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
