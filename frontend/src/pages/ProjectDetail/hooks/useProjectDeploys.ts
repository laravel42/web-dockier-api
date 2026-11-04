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
 * Slower than its two neighbours on purpose: the scan progress controller polls
 * at 2s (`scanProgressState.POLL_INTERVAL_MS`) and the Commands tab at 3s, but
 * both watch something that changes by the second — scan progress streams per
 * file, and a command returns while the user stares at a terminal. A deploy's
 * phases are minutes apart, so a 4s re-read of two list endpoints is already
 * finer-grained than the thing it observes.
 */
const WATCH_INTERVAL_MS = 4_000;

/** Rows the deploy and scan panels show. Also the deploy page size. */
const RECENT_ROW_COUNT = 5;

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
    // Scoped server-side. Unfiltered, this endpoint returns the TENANT's newest
    // 20 deployments (`paginationQuerySchema` defaults to limit 20), so filtering
    // client-side made a busy tenant's older project look like it had never
    // shipped — which also hides the whole Runtime cluster from the nav.
    return deployApi.listDeployments({ projectId: projectIdForDeploys, limit: RECENT_ROW_COUNT })
      .then((res) => {
        const match = [...res.deployments]
          .sort((a, b) => parseApiTimestamp(b.createdAt).getTime() - parseApiTimestamp(a.createdAt).getTime());
        setRecentDeploys(match);
        setDeploysError("");
      })
      .catch((err: unknown) => setDeploysError(getErrorMessage(err)))
      .finally(() => setDeploysLoaded(true));
  }, [projectIdForDeploys]);

  const fetchScans = useCallback(() => {
    if (!projectId) return;
    return codeAnalysisApi.listScans(projectId)
      .then((res) => {
        setRecentScans(res.scans.slice(0, RECENT_ROW_COUNT));
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
