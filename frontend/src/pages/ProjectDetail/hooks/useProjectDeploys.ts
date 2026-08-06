import { useState, useEffect } from "react";
import { deployApi, codeAnalysisApi } from "@/services/api";
import { parseApiTimestamp } from "@/utils/timeAgo";
import type { Project, Deployment as DeployInfo, Provider as ProviderInfo, Scan } from "@/types";

/**
 * Providers, recent deploys, recent scans, and deploy wizard visibility.
 */
export function useProjectDeploys(project: Project | null, projectId: string | undefined) {
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [recentDeploys, setRecentDeploys] = useState<DeployInfo[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);

  // Fetch providers once
  useEffect(() => {
    deployApi.listProviders()
      .then((res) => {
        setAllProviders(res.providers.map((p: { id: string; provider: string; label: string }) => ({
          id: p.id,
          provider: p.provider,
          label: p.label,
        })));
      })
      .catch(() => {});
  }, []);

  // Fetch recent deploys
  const fetchLastDeploy = () => {
    if (!project) return;
    deployApi.listDeployments()
      .then((res) => {
        const match = res.deployments
          .filter((d: DeployInfo) => d.projectId === project.id)
          .sort((a, b) => parseApiTimestamp(b.createdAt).getTime() - parseApiTimestamp(a.createdAt).getTime());
        setRecentDeploys(match.slice(0, 5));
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (project?.id) fetchLastDeploy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Fetch recent scans
  useEffect(() => {
    if (!projectId) return;
    codeAnalysisApi.listScans(projectId)
      .then((res) => setRecentScans(res.scans.slice(0, 5)))
      .catch(() => setRecentScans([]));
  }, [projectId]);

  return {
    allProviders,
    showDeployWizard,
    setShowDeployWizard,
    recentDeploys,
    recentScans,
    fetchLastDeploy,
  };
}
