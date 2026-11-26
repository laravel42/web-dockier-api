import { useAsyncData } from "@/hooks/useAsyncData";
import { deployApi, codeAnalysisApi } from "@/services/api";
import type { Deployment, Project, Scan } from "@/types";

/** Per-project security snapshot from `codeAnalysisApi.latestScans`. */
export interface ScanActivity {
  scanCount: number;
  /** Newest scan of any status (for running / failed / pending states). */
  latest: Scan | null;
  /** Newest *completed* scan — the one whose severity counts are meaningful. */
  latestCompleted: Scan | null;
}

export interface ProjectActivity {
  deployByProject: Record<string, Deployment>;
  scanByProject: Record<string, ScanActivity>;
  activityLoading: boolean;
}

const ts = (d: Deployment) => Date.parse(d.updatedAt || d.createdAt) || 0;

/**
 * Loads the deploy + security signal for the projects currently on screen, so
 * the Projects list can be the home dashboard (no per-card round-trips).
 *
 * Deploy: one `listDeployments` page reduced to the newest deploy per project.
 * Security: the purpose-built `latestScans` batch endpoint (count + newest +
 * newest-completed per project). Re-fetches when the visible project set changes.
 */
export function useProjectActivity(projects: Project[]): ProjectActivity {
  const ids = projects.map((p) => p.id);
  const key = ids.join(",");

  const { data, loading } = useAsyncData(async () => {
    if (ids.length === 0) {
      return { deployByProject: {}, scanByProject: {} } as Omit<ProjectActivity, "activityLoading">;
    }

    const [depRes, scanRes] = await Promise.all([
      // 100 is the API's max page size. Deploys come back newest-first, so this
      // page holds the newest deploy of every project with any recent activity,
      // which is all the reduce below needs for the per-project signal.
      deployApi.listDeployments({ limit: 100 }),
      codeAnalysisApi.latestScans(ids),
    ]);

    const deployByProject: Record<string, Deployment> = {};
    for (const d of depRes.deployments) {
      const prev = deployByProject[d.projectId];
      if (!prev || ts(d) > ts(prev)) deployByProject[d.projectId] = d;
    }

    const scanByProject: Record<string, ScanActivity> = {};
    for (const r of scanRes.projects) {
      scanByProject[r.projectId] = {
        scanCount: r.scanCount,
        latest: r.latest,
        latestCompleted: r.latestCompleted,
      };
    }

    return { deployByProject, scanByProject };
  }, [key]);

  return {
    deployByProject: data?.deployByProject ?? {},
    scanByProject: data?.scanByProject ?? {},
    activityLoading: loading,
  };
}
