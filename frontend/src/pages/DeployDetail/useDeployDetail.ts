import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { deployApi, projectsApi } from "../../services/api";
import { getProviderStyle } from "../../data/providers";
import { getRepoKey } from "../../utils/parseOwnerRepo";
import type { Deployment, Provider, Project } from "./types";

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
        try {
          const projRes = await projectsApi.list();
          if (cancelled) return;
          const match = d.projectId
            ? projRes.projects.find((p: Project) => p.id === d.projectId)
            : projRes.projects.find((p: Project) => getRepoKey(p.repository) === d.repo);
          if (match) setProject(match);
        } catch {}
        if (cancelled) return;
        setAllDeploysLoading(true);
        deployApi.listDeployments()
          .then((res) => {
            if (cancelled) return;
            const repoDeploys = d.projectId
              ? (res.deployments as Deployment[]).filter((dep) => dep.projectId === d.projectId)
              : (res.deployments as Deployment[]).filter((dep) => dep.repo === d.repo);
            setAllDeploys(repoDeploys.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setAllDeploysLoading(false); });
      })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Failed to load deployment"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [deployId]);

  const prov = deploy ? providers.find(p => p.id === deploy.providerId) : undefined;
  const provKey = prov?.provider || "";
  const providerStyle = getProviderStyle(provKey);

  return {
    deployId, navigate,
    deploy, project, providers,
    loading, error,
    allDeploys, allDeploysLoading,
    prov, provKey, providerStyle,
  };
}
