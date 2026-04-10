import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { projectsApi, gitApi, deployApi } from "../../services/api";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import type { Project, RepoStats, DeployInfo, ProviderInfo } from "./types";
import type { RepoAnalysis } from "../../components/DeployWizard";

export function useProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Header actions
  const [showDelete, setShowDelete] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  // Pull from origin
  const [pullLog, setPullLog] = useState<string[] | null>(null);
  const [pullLoading, setPullLoading] = useState(false);

  // Branch modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchList, setBranchList] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  // Stats & analysis
  const [stats, setStats] = useState<RepoStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Providers
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);

  // Deploy wizard
  const [showDeployWizard, setShowDeployWizard] = useState(false);

  // Destroy
  const [destroying, setDestroying] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);

  // Last deploy
  const [lastDeploy, setLastDeploy] = useState<DeployInfo | null>(null);

  // Auto-open deploy wizard from navigation state
  useEffect(() => {
    if ((location.state as { openDeploy?: boolean })?.openDeploy) {
      setShowDeployWizard(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Fetch project, stats, analysis, providers
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    deployApi.listProviders()
      .then((res) => {
        setAllProviders(res.providers.map((p: any) => ({ id: p.id, provider: p.provider, label: p.label })));
      })
      .catch(() => {});
    projectsApi.get(projectId)
      .then((p) => {
        setProject(p);
        if (p.connectionId && p.repository) {
          const parsed = parseOwnerRepo(p.repository);
          if (parsed) {
            setStatsLoading(true);
            setStatsError("");
            gitApi.getRepoStats(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined)
              .then(setStats)
              .catch((err: any) => setStatsError(err.message || "Failed to load stats"))
              .finally(() => setStatsLoading(false));

            setAnalysisLoading(true);
            setAnalysisError("");
            let aiType: string | undefined;
            let aiApiKey: string | undefined;
            const bedrockModel = localStorage.getItem("bedrock_default_model");
            if (bedrockModel) { aiType = "bedrock"; aiApiKey = bedrockModel; }
            gitApi.analyzeRepo(p.connectionId, parsed.owner, parsed.repo, p.branch || undefined, aiType, aiApiKey)
              .then(setAnalysis)
              .catch((err: any) => setAnalysisError(err.message || "Failed to analyze repo"))
              .finally(() => setAnalysisLoading(false));
          }
        }
      })
      .catch((err: any) => setError(err.message || "Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Fetch last deploy
  const fetchLastDeploy = () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    const repoKey = `${parsed.owner}/${parsed.repo}`;
    deployApi.listDeployments()
      .then((res) => {
        const match = res.deployments.filter((d: DeployInfo) => d.repo === repoKey);
        setLastDeploy(match.length > 0 ? match[0] : null);
      })
      .catch(() => {});
  };

  useEffect(() => { fetchLastDeploy(); }, [project]);

  // Actions
  const handleDelete = async () => {
    if (!projectId) return;
    await projectsApi.delete(projectId);
    navigate("/projects");
  };

  const handlePullOrigin = async () => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;
    setPullLoading(true);
    setPullLog(["$ git pull origin " + (project.branch || "main"), "Connecting to remote…"]);
    try {
      const res = await gitApi.pullOrigin(project.connectionId, parsed.owner, parsed.repo, project.branch || "main", stats?.lastCommitHash);
      setPullLog(res.log);
    } catch (err: any) {
      setPullLog((prev) => [...(prev || []), `error: ${err.message || "Pull failed"}`]);
    } finally {
      setPullLoading(false);
    }
  };

  const handleOpenBranchModal = async () => {
    if (!project) return;
    setShowBranchModal(true);
    setBranchSearch("");
    setBranchLoading(true);
    try {
      const parsed = parseOwnerRepo(project.repository);
      if (parsed) {
        const res = await gitApi.listBranches(project.connectionId, parsed.owner, parsed.repo);
        setBranchList(res.branches);
      }
    } catch {
      setBranchList([]);
    } finally {
      setBranchLoading(false);
    }
  };

  const handleSwitchBranch = async (branch: string) => {
    if (!project || !projectId) return;
    await projectsApi.update(projectId, { branch });
    setShowBranchModal(false);
    window.location.reload();
  };

  const handleDestroy = async () => {
    if (!lastDeploy) return;
    setDestroying(true);
    try {
      const res = await deployApi.destroyDeployment(lastDeploy.id);
      if (res.success) {
        setLastDeploy({ ...lastDeploy, status: "destroyed", appUrl: "" });
        fetchLastDeploy();
      } else {
        setError(res.message);
      }
    } catch (e: any) {
      setError(e.message || "Failed to destroy deployment");
    }
    setDestroying(false);
  };

  return {
    project, loading, error,
    navigate,
    // Header
    showDelete, setShowDelete, headerMenuOpen, setHeaderMenuOpen,
    handleDelete, handlePullOrigin, handleOpenBranchModal,
    // Deploy wizard
    showDeployWizard, setShowDeployWizard,
    allProviders,
    analysis, analysisLoading, analysisError,
    fetchLastDeploy,
    // Stats
    stats, statsLoading, statsError,
    // Branch modal
    showBranchModal, setShowBranchModal,
    branchList, branchLoading, branchSearch, setBranchSearch,
    handleSwitchBranch,
    // Pull log
    pullLog, setPullLog, pullLoading,
    // Last deploy
    lastDeploy,
    destroying, showDestroyConfirm, setShowDestroyConfirm, handleDestroy,
  };
}
