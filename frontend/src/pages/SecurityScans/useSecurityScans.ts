import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi, gitApi } from "../../services/api";
import { getRepoKey } from "../Projects/utils";
import type { Scan, Project, TechBadgeInfo } from "./types";

export function useSecurityScans() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [projectLangs, setProjectLangs] = useState<Record<string, TechBadgeInfo[]>>({});
  const fetchedLangsRef = useRef<Set<string>>(new Set());

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

  // Fetch language badges for each project
  useEffect(() => {
    const projList = Object.values(projects);
    if (projList.length === 0) return;
    for (const p of projList) {
      if (!p.repository || fetchedLangsRef.current.has(p.id)) continue;
      fetchedLangsRef.current.add(p.id);
      const parsed = getRepoKey(p.repository);
      if (!parsed) continue;
      gitApi.getRepoBadges(parsed, p.branch || undefined)
        .then((res) => {
          if (res.badges && res.badges.length > 0) {
            setProjectLangs((prev) => ({ ...prev, [p.id]: res.badges }));
          }
        })
        .catch(() => {});
    }
  }, [projects]);

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
