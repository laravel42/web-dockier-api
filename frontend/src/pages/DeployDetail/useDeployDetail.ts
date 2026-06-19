import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deployApi, gitApi, projectsApi } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { getRepoKey, parseOwnerRepo } from "../../utils/parseOwnerRepo";
import type { RepoAnalysis } from "../../components/DeployWizard";
import type { Deployment, Provider, Project } from "../../types";
import { compareByTime } from "../../utils/sortByTime";

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
  const [destroying, setDestroying] = useState(false);

  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const refreshAllDeploys = useCallback((current: Deployment) => {
    setAllDeploysLoading(true);
    deployApi.listDeployments()
      .then((res) => {
        const repoDeploys = current.projectId
          ? (res.deployments as Deployment[]).filter((dep) => dep.projectId === current.projectId)
          : (res.deployments as Deployment[]).filter((dep) => dep.repo === current.repo);
        setAllDeploys(repoDeploys.sort((a, b) => compareByTime(a, b, "updated")));
      })
      .catch(() => {})
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
              const projRes = await projectsApi.list();
              if (cancelled) return;
              const match = projRes.projects.find((p: Project) => p.id === d.projectId)
                ?? projRes.projects.find((p: Project) => getRepoKey(p.repository) === d.repo);
              if (match) setProject(match);
            } catch { /* ignore */ }
          }
        } else {
          try {
            const projRes = await projectsApi.list();
            if (cancelled) return;
            const match = projRes.projects.find((p: Project) => getRepoKey(p.repository) === d.repo);
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

  const handleDestroy = useCallback(async () => {
    if (!deploy) return { success: false as const, message: "Deployment not found" };
    setDestroying(true);
    try {
      const res = await deployApi.destroyDeployment(deploy.id);
      if (res.success) {
        const updated: Deployment = { ...deploy, status: "destroyed", appUrl: "" };
        setDeploy(updated);
        refreshAllDeploys(updated);
      }
      return res;
    } catch (err: unknown) {
      return { success: false as const, message: getErrorMessage(err, "Failed to destroy deployment") };
    } finally {
      setDestroying(false);
    }
  }, [deploy, refreshAllDeploys]);

  const prov = deploy ? providers.find(p => p.id === deploy.providerId) : undefined;
  const provKey = prov?.provider || "";
  const canLaunchDeploy = Boolean(project?.connectionId || project?.sourceType === "template");

  return {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    destroying,
    prov, provKey,
    showDeployWizard, setShowDeployWizard,
    openDeployWizard, canLaunchDeploy,
    analysis, analysisLoading, analysisError,
    handleDeployComplete,
    handleDestroy,
  };
}
