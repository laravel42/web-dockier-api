import { useNavigate } from "react-router-dom";
import { codeAnalysisApi, projectsApi } from "@/services/api";
import { usePaginatedData } from "@/hooks/usePaginatedData";
import { useProjectBadges } from "@/hooks/useProjectBadges";
import { useViewMode } from "@/hooks/useViewMode";
import type { Scan, Project } from "@/types";
import { compareByTime } from "@/utils/sortByTime";

const PAGE_SIZE = 20;

interface ProjectScans {
  project: Project;
  /** The newest scan and, when different, the newest completed one: all the cards read. */
  scans: Scan[];
  /** All of this project's scans. */
  scanCount: number;
}

/**
 * Paged by project, two requests per page. The page used to be built from the
 * tenant's newest 20 projects and newest 20 scans, so a 21st project vanished and a
 * project scanned long ago looked never scanned.
 */
async function fetchPage(params: { limit: number; offset: number; search: string }) {
  const projRes = await projectsApi.list({ ...params, search: params.search || undefined });
  if (projRes.projects.length === 0) return { items: [], pagination: projRes.pagination };
  const { projects: latest } = await codeAnalysisApi.latestScans(projRes.projects.map((p) => p.id));
  const byProject = new Map(latest.map((l) => [l.projectId, l]));
  const items: ProjectScans[] = projRes.projects.map((project) => {
    const l = byProject.get(project.id);
    const scans = [l?.latest, l?.latestCompleted].filter((s): s is Scan => !!s);
    return { project, scans: [...new Map(scans.map((s) => [s.id, s])).values()], scanCount: l?.scanCount ?? 0 };
  });
  return { items, pagination: projRes.pagination };
}

export function useSecurityScans() {
  const navigate = useNavigate();
  const { viewMode, changeViewMode } = useViewMode("security-scans-view");
  const { items, loading, error, reload, pagination, search, goToPage, handleSearch } =
    usePaginatedData(fetchPage, { pageSize: PAGE_SIZE });

  const projects: Record<string, Project> = {};
  const grouped: Record<string, Scan[]> = {};
  const scanCounts: Record<string, number> = {};
  for (const { project, scans, scanCount } of items) {
    projects[project.id] = project;
    scanCounts[project.id] = scanCount;
    // Sort here, once: the project ordering below and the cards/table all treat
    // index 0 as the newest scan.
    if (scans.length > 0) grouped[project.id] = [...scans].sort((a, b) => compareByTime(a, b, "updated"));
  }

  const { badges: projectLangs, loadingIds: projectBadgeLoading } = useProjectBadges(Object.values(projects));

  // Within the current page only: the page itself is in the projects API's order.
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

  return {
    navigate,
    loading,
    error,
    reload,
    projects,
    grouped,
    scanCounts,
    pagination,
    goToPage,
    search,
    handleSearch,
    projectLangs,
    projectBadgeLoading,
    sortedProjectIds,
    viewMode,
    changeViewMode,
  };
}
