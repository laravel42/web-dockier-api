import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi } from "../../services/api";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import type { Scan, Project } from "./types";

export function useSecurityScans() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [scanRes, projRes] = await Promise.all([
          codeAnalysisApi.listScans(),
          projectsApi.list(),
        ]);
        setScans(scanRes.scans);
        const map: Record<string, Project> = {};
        for (const p of projRes.projects) map[p.id] = p;
        setProjects(map);
      } catch { /* silently handle load failure */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Group scans by project
  const grouped = scans.reduce<Record<string, Scan[]>>((acc, s) => {
    (acc[s.projectId] ||= []).push(s);
    return acc;
  }, {});

  const projectLangs = useProjectBadges(Object.values(projects));

  // All project IDs, sorted: projects with scans first (by latest scan date), then without scans (by name)
  const sortedProjectIds = Object.keys(projects).sort((a, b) => {
    const aScans = grouped[a];
    const bScans = grouped[b];
    if (aScans && bScans) return new Date(bScans[0].createdAt).getTime() - new Date(aScans[0].createdAt).getTime();
    if (aScans) return -1;
    if (bScans) return 1;
    return (projects[a]?.name || "").localeCompare(projects[b]?.name || "");
  });

  return {
    navigate,
    loading,
    projects,
    grouped,
    projectLangs,
    sortedProjectIds,
  };
}
