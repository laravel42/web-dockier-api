import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useProjectBadges } from "../../hooks/useProjectBadges";
import type { Scan, Project } from "../../types";
import { compareByTime } from "../../utils/sortByTime";

interface SecurityScansData {
  scans: Scan[];
  projects: Record<string, Project>;
}

async function fetchSecurityScansData(): Promise<SecurityScansData> {
  const [scanRes, projRes] = await Promise.all([
    codeAnalysisApi.listScans(),
    projectsApi.list(),
  ]);
  const projects: Record<string, Project> = {};
  for (const p of projRes.projects) projects[p.id] = p;
  return { scans: scanRes.scans, projects };
}

export function useSecurityScans() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"cards" | "table">(
    () => (localStorage.getItem("security-scans-view") as "cards" | "table") || "cards",
  );
  const { data, loading, error, reload } = useAsyncData(fetchSecurityScansData, []);

  const scans = data?.scans ?? [];
  const projects = data?.projects ?? {};

  const grouped = scans.reduce<Record<string, Scan[]>>((acc, s) => {
    (acc[s.projectId] ||= []).push(s);
    return acc;
  }, {});

  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(Object.values(projects));

  const sortedProjectIds = Object.keys(projects).sort((a, b) => {
    const aScans = grouped[a];
    const bScans = grouped[b];
    if (aScans && bScans) {
      return compareByTime(aScans[0], bScans[0], "updated");
    }
    if (aScans) return -1;
    if (bScans) return 1;
    return (projects[a]?.name || "").localeCompare(projects[b]?.name || "");
  });

  const changeViewMode = (mode: "cards" | "table") => {
    setViewMode(mode);
    localStorage.setItem("security-scans-view", mode);
  };

  return {
    navigate,
    loading,
    error,
    reload,
    projects,
    grouped,
    projectLangs,
    projectBadgeLoading,
    sortedProjectIds,
    viewMode,
    changeViewMode,
  };
}
