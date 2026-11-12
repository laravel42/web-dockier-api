import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deployApi, gitApi, projectsApi } from "@/services/api";
import { getErrorMessage } from "@/utils/errors";
import { getRepoKey, parseOwnerRepo } from "@/utils/parseOwnerRepo";
import type { RepoAnalysis } from "@/components/DeployWizard";
import type { Deployment, Provider, Project } from "@/types";
import { compareByTime } from "@/utils/sortByTime";

/**
 * First project matching `match`, across every page of the project list. Reading
 * only the first page (50) left a deploy of any later project with no project
 * at all: no name, no infra state, no fallback commit.
 */
export async function findProject(match: (p: Project) => boolean): Promise<Project | undefined> {
  const PAGE = 100; // the API max
  for (let offset = 0; ; offset += PAGE) {
    const res = await projectsApi.list({ limit: PAGE, offset });
    const hit = res.projects.find(match);
    if (hit) return hit;
    if (res.projects.length === 0 || offset + res.projects.length >= res.pagination.total) return undefined;
  }
}

const IN_PROGRESS_STATUSES = new Set(["pending", "building", "deploying"]);
const POLL_INTERVAL_MS = 2_000;

export function useDeployDetail() {
  const { deployId } = useParams<{ deployId: string }>();
  const navigate = useNavigate();

  const [deploy, setDeploy] = useState<Deployment | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [allDeploys, setAllDeploys] = useState<Deployment[]>([]);
  const [allDeploysLoading, setAllDeploysLoading] = useState(false);
  const [allDeploysError, setAllDeploysError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const refreshAllDeploys = useCallback((current: Deployment) => {
    setAllDeploysLoading(true);
    setAllDeploysError("");
    // Scoped server-side: unfiltered returns only the tenant's newest 20, which dropped
    // older projects' history. shortcut: no-projectId deploys still filter the newest
    // 100 by repo, upgrade when the API gains a repo filter.
    deployApi.listDeployments({ projectId: current.projectId ?? undefined, limit: 100 })
      .then((res) => {
        const repoDeploys = current.projectId
          ? (res.deployments as Deployment[])
          : (res.deployments as Deployment[]).filter((dep) => dep.repo === current.repo);
        setAllDeploys(repoDeploys.sort((a, b) => compareByTime(a, b, "updated")));
      })
      // An empty history otherwise reads as "No deploys yet" and re-enables New deploy.
      .catch((err: unknown) => setAllDeploysError(getErrorMessage(err, "Failed to load deploy history")))
      .finally(() => setAllDeploysLoading(false));
  }, []);

  useEffect(() => {
    if (!deployId) return;
    let cancelled = false;

    Promise.all([
      deployApi.getDeployment(deployId),
      deployApi.listProviders(),
    ])
      .then(async ([d, pRes]) => {
        if (cancelled) return;
        setDeploy(d);
        setProviders(pRes.providers);
        if (d.projectId) {
          try {
            const proj = await projectsApi.get(d.projectId);
            if (!cancelled) setProject(proj);
          } catch {
            try {
              // Same preference as before: the project itself, else one on the same repo.
              const match = (await findProject((p) => p.id === d.projectId))
                ?? (await findProject((p) => getRepoKey(p.repository) === d.repo));
              if (cancelled) return;
              if (match) setProject(match);
            } catch { /* ignore */ }
          }
        } else {
          try {
            const match = await findProject((p) => getRepoKey(p.repository) === d.repo);
            if (cancelled) return;
            if (match) setProject(match);
          } catch { /* ignore */ }
        }
        if (cancelled) return;
        refreshAllDeploys(d);
      })
      .catch((err: unknown) => { if (!cancelled) setError(getErrorMessage(err, "Failed to load deployment")); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [deployId, refreshAllDeploys]);

  // ─── Live log polling while deployment is in progress ────────────
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!deploy || !deployId || !IN_PROGRESS_STATUSES.has(deploy.status)) {
      return;
    }

    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const d = await deployApi.getDeployment(deployId);
        if (!active) return;
        setDeploy(d);

        // When it reaches a terminal state, refresh the history sidebar too.
        if (!IN_PROGRESS_STATUSES.has(d.status)) {
          refreshAllDeploys(d);
          return;
        }
      } catch {
        // Transient error — keep polling.
      }
      if (active) {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
    // Only `deploy.status` may restart the poll loop: each poll calls setDeploy
    // with a fresh object, so depending on `deploy` would tear down and restart
    // the loop on every response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploy?.status, deployId, refreshAllDeploys]);

  const openDeployWizard = useCallback(() => {
    if (!project?.connectionId || project.sourceType === "template") {
      setShowDeployWizard(true);
      return;
    }

    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) {
      setShowDeployWizard(true);
      return;
    }

    setShowDeployWizard(true);
    setAnalysisLoading(true);
    setAnalysisError("");
    gitApi.analyzeRepo(
      project.connectionId,
      parsed.owner,
      parsed.repo,
      project.branch || undefined,
      "openai",
      project.id,
    )
      .then(setAnalysis)
      .catch((err: unknown) => setAnalysisError(getErrorMessage(err, "Failed to analyze repo")))
      .finally(() => setAnalysisLoading(false));
  }, [project]);

  const handleDeployComplete = useCallback(() => {
    if (deploy) refreshAllDeploys(deploy);
  }, [deploy, refreshAllDeploys]);

  const handleCancel = useCallback(async () => {
    if (!deploy) return { success: false as const, message: "Deployment not found" };
    setCancelling(true);
    try {
      const updated = await deployApi.cancelDeployment(deploy.id);
      setDeploy(updated);
      refreshAllDeploys(updated);
      return { success: true as const, message: "Deployment cancelled" };
    } catch (err) {
      return { success: false as const, message: getErrorMessage(err, "Failed to cancel deployment") };
    } finally {
      setCancelling(false);
    }
  }, [deploy, refreshAllDeploys]);

  const [redeploying, setRedeploying] = useState(false);

  const handleRollback = useCallback(async (deploymentId: string) => {
    setRedeploying(true);
    try {
      const newDeploy = await deployApi.rollbackToDeployment(deploymentId);
      navigate(`/deploy/${newDeploy.id}`);
    } catch {
      // Error handled by global toast or silently
    } finally {
      setRedeploying(false);
    }
  }, [navigate]);

  const prov = deploy ? providers.find(p => p.id === deploy.providerId) : undefined;
  const provKey = prov?.provider || "";
  const canLaunchDeploy = Boolean(project?.connectionId || project?.sourceType === "template");
  /**
   * A deploy for this project is in flight. `deploy` is checked as well as the
   * history: it loads first and is polled every 2s, while `allDeploys` only
   * refreshes when a status changes, so the history alone leaves a window in
   * which the New deploy button is wrongly enabled.
   */
  const hasLiveDeploy = (deploy ? IN_PROGRESS_STATUSES.has(deploy.status) : false)
    || allDeploys.some((d) => IN_PROGRESS_STATUSES.has(d.status));

  return {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading, allDeploysError,
    cancelling,
    redeploying,
    prov, provKey,
    showDeployWizard, setShowDeployWizard,
    openDeployWizard, canLaunchDeploy, hasLiveDeploy,
    analysis, analysisLoading, analysisError,
    handleDeployComplete,
    handleCancel,
    handleRollback,
  };
}
