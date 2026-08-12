import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { deployApi, codeAnalysisApi } from "@/services/api";
import { parseApiTimestamp } from "@/utils/timeAgo";
import { getErrorMessage } from "@/utils/errors";
import type { Project, Deployment as DeployInfo, Provider as ProviderInfo, Scan } from "@/types";

/** Deploy states from which nothing further happens on its own. */
const TERMINAL_DEPLOY = new Set(["success", "failed", "destroyed", "cancelled"]);
/** Scan states from which nothing further happens on its own. */
const TERMINAL_SCAN = new Set(["completed", "failed"]);

/**
 * How often to re-read a job the user is actively watching.
 *
 * Deliberately the same 4s the scan progress controller already uses
 * (`scanProgressState.ts`), because this is the same kind of observation: a
 * long-running server job whose phases are minutes apart, watched by someone who
 * wants to know when it lands. The Commands tab polls at 3s, but that is a
 * different problem — a command returns in seconds and the user is staring at a
 * terminal waiting for output.
 *
 * Reusing the existing number rather than inventing a third one is the point.
 */
const WATCH_INTERVAL_MS = 4_000;

const isDeployLive = (d: DeployInfo) => !TERMINAL_DEPLOY.has(d.status);
const isScanLive = (s: Scan) => !TERMINAL_SCAN.has(s.status);

/**
 * Providers, recent deploys, recent scans, and deploy wizard visibility.
 *
 * Fetches carry an error state rather than swallowing failures: a rejected request
 * used to leave `recentDeploys` empty, which the panel then reported as "this
 * project hasn't been deployed yet". Saying a project has never shipped because a
 * request timed out is worse than saying nothing.
 */
export function useProjectDeploys(project: Project | null, projectId: string | undefined) {
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [recentDeploys, setRecentDeploys] = useState<DeployInfo[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [deploysError, setDeploysError] = useState("");
  const [scansError, setScansError] = useState("");
  /** False until the first response settles, so panels can tell "loading" from "none". */
  const [deploysLoaded, setDeploysLoaded] = useState(false);
  const [scansLoaded, setScansLoaded] = useState(false);

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

  const projectIdForDeploys = project?.id;

  const fetchLastDeploy = useCallback(() => {
    if (!projectIdForDeploys) return;
    return deployApi.listDeployments()
      .then((res) => {
        const match = res.deployments
          .filter((d: DeployInfo) => d.projectId === projectIdForDeploys)
          .sort((a, b) => parseApiTimestamp(b.createdAt).getTime() - parseApiTimestamp(a.createdAt).getTime());
        setRecentDeploys(match.slice(0, 5));
        setDeploysError("");
      })
      .catch((err: unknown) => setDeploysError(getErrorMessage(err)))
      .finally(() => setDeploysLoaded(true));
  }, [projectIdForDeploys]);

  const fetchScans = useCallback(() => {
    if (!projectId) return;
    return codeAnalysisApi.listScans(projectId)
      .then((res) => {
        setRecentScans(res.scans.slice(0, 5));
        setScansError("");
      })
      .catch((err: unknown) => setScansError(getErrorMessage(err)))
      .finally(() => setScansLoaded(true));
  }, [projectId]);

  useEffect(() => { void fetchLastDeploy(); }, [fetchLastDeploy]);
  useEffect(() => { void fetchScans(); }, [fetchScans]);

  const hasLiveDeploy = useMemo(() => recentDeploys.some(isDeployLive), [recentDeploys]);
  const hasLiveScan = useMemo(() => recentScans.some(isScanLive), [recentScans]);

  // Keep the latest fetchers in a ref so the interval never restarts on re-render —
  // restarting would reset the countdown and, with a fast render loop, could poll
  // far more often than intended.
  const fetchersRef = useRef({ fetchLastDeploy, fetchScans });
  useEffect(() => { fetchersRef.current = { fetchLastDeploy, fetchScans }; });

  /**
   * Poll only while something is genuinely in flight, and stop the moment
   * everything settles. A page showing only finished deploys makes no requests.
   */
  useEffect(() => {
    if (!hasLiveDeploy && !hasLiveScan) return;
    const id = setInterval(() => {
      if (hasLiveDeploy) void fetchersRef.current.fetchLastDeploy();
      if (hasLiveScan) void fetchersRef.current.fetchScans();
    }, WATCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasLiveDeploy, hasLiveScan]);

  return {
    allProviders,
    showDeployWizard,
    setShowDeployWizard,
    recentDeploys,
    recentScans,
    fetchLastDeploy,
    fetchScans,
    deploysError,
    scansError,
    deploysLoaded,
    scansLoaded,
    /** A deploy is running right now — drives the live indicator in the header. */
    hasLiveDeploy,
    hasLiveScan,
  };
}

export { TERMINAL_DEPLOY, TERMINAL_SCAN, WATCH_INTERVAL_MS, isDeployLive, isScanLive };
