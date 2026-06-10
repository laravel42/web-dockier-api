import { useState, useEffect } from "react";
import { integrationsApi, gitApi } from "../../services/api";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import type { Finding, Project, PMIntegration, PMTeam, PMMember } from "../../types";

export function useIssueModal(project: Project | null) {
  const [pmIntegrations, setPmIntegrations] = useState<PMIntegration[]>([]);
  const [issueModal, setIssueModal] = useState<{ open: boolean; finding: Finding | null }>({ open: false, finding: null });
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueIntegration, setIssueIntegration] = useState("");
  const [issueCreating, setIssueCreating] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState("");
  const [issueSuccessUrl, setIssueSuccessUrl] = useState("");
  const [aiEstimate, setAiEstimate] = useState(0);
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [pmProjects, setPmProjects] = useState<PMTeam[]>([]);
  const [pmProjectsLoading, setPmProjectsLoading] = useState(false);
  const [selectedPmProject, setSelectedPmProject] = useState("");
  const [pmTeamLabel, setPmTeamLabel] = useState("Project");
  const [pmProjectLabel, setPmProjectLabel] = useState("");
  const [pmSubProjects, setPmSubProjects] = useState<PMTeam[]>([]);
  const [pmSubProjectsLoading, setPmSubProjectsLoading] = useState(false);
  const [selectedPmSubProject, setSelectedPmSubProject] = useState("");
  const [pmMembers, setPmMembers] = useState<PMMember[]>([]);
  const [selectedPmAssignee, setSelectedPmAssignee] = useState("");

  // Git repo members (for assignee when no PM integration)
  const [gitMembers, setGitMembers] = useState<Array<{ id: string; username: string; name: string; avatarUrl: string }>>([]);
  const [selectedGitAssignee, setSelectedGitAssignee] = useState("");

  useEffect(() => {
    integrationsApi.listPMIntegrations()
      .then((res) => setPmIntegrations(res.integrations.filter((i) => i.enabled)))
      .catch(() => setPmIntegrations([]));
  }, []);

  // ── PM team/project/member cascading fetches ───────────────────

  const fetchPmTeams = async (pm: PMIntegration) => {
    setPmProjectsLoading(true);
    setPmProjects([]); setSelectedPmProject(""); setPmSubProjects([]); setSelectedPmSubProject("");
    setPmMembers([]); setSelectedPmAssignee("");
    try {
      const res = await integrationsApi.listPMTeams(pm.id);
      setPmProjects(res.teams); setPmTeamLabel(res.teamLabel); setPmProjectLabel(res.projectLabel);
      if (res.teams.length > 0) {
        setSelectedPmProject(res.teams[0].id);
        if (res.projectLabel) fetchPmSubProjects(pm, res.teams[0].id);
        fetchPmMembers(pm, res.teams[0].id);
      }
    } catch {}
    finally { setPmProjectsLoading(false); }
  };

  const fetchPmMembers = async (pm: PMIntegration, teamId: string) => {
    setPmMembers([]); setSelectedPmAssignee("");
    try {
      const res = await integrationsApi.listPMTeamMembers(pm.id, teamId);
      setPmMembers(res.members);
    } catch {}
  };

  const fetchPmSubProjects = async (pm: PMIntegration, teamId: string) => {
    setPmSubProjectsLoading(true); setPmSubProjects([]); setSelectedPmSubProject("");
    try {
      const res = await integrationsApi.listPMTeamProjects(pm.id, teamId);
      setPmSubProjects(res.projects);
      if (res.projects.length > 0) setSelectedPmSubProject(res.projects[0].id);
    } catch {}
    finally { setPmSubProjectsLoading(false); }
  };

  // ── Actions ────────────────────────────────────────────────────

  const openIssueModal = (f: Finding) => {
    const repoUrl = project?.repository?.replace(/\.git$/, "") || "";
    const branch = project?.branch || "main";
    const blameUrl = `${repoUrl}/-/blame/${branch}/${f.filePath}#L${f.startLine}`;
    const cleanMsg = f.message.replace(/\s+/g, " ").trim();
    const desc = [cleanMsg, ``, `**Source:** ${blameUrl}`].filter(Boolean).join("\n");
    setIssueTitle("Generating title…");
    setTitleGenerating(true);
    setIssueDescription(desc);
    const firstPm = pmIntegrations[0];
    setIssueIntegration(firstPm?.id || "");
    setIssueCreating(false); setIssueSuccess(""); setIssueSuccessUrl(""); setIssueError("");
    setPmProjects([]); setSelectedPmProject(""); setPmSubProjects([]); setSelectedPmSubProject("");
    setPmTeamLabel("Project"); setPmProjectLabel("");
    setIssueModal({ open: true, finding: f });
    if (firstPm) fetchPmTeams(firstPm);
    // Fetch git repo members for assignee when no PM integration
    setGitMembers([]); setSelectedGitAssignee("");
    if (!firstPm && project?.connectionId && project?.repository) {
      const parsed = parseOwnerRepo(project.repository);
      if (parsed) {
        gitApi.listRepoMembers(project.connectionId, parsed.owner, parsed.repo)
          .then(res => setGitMembers(res.members))
          .catch(() => {});
      }
    }
    setAiEstimate(0);
    gitApi.summarizeFinding(f.severity, f.message, f.filePath, f.snippet || "")
      .then(res => { setIssueTitle(res.title); setAiEstimate(res.estimateMinutes); setTitleGenerating(false); })
      .catch(() => { setIssueTitle(f.message.slice(0, 60)); setTitleGenerating(false); });
  };

  const handleIntegrationChange = (integrationId: string) => {
    setIssueIntegration(integrationId);
    const pm = pmIntegrations.find(i => i.id === integrationId);
    if (pm) fetchPmTeams(pm);
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedPmProject(teamId); setPmSubProjects([]); setSelectedPmSubProject("");
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    if (pmProjectLabel && pm) fetchPmSubProjects(pm, teamId);
    if (pm) fetchPmMembers(pm, teamId);
  };

  const closeIssueModal = () => setIssueModal({ open: false, finding: null });

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    const pm = pmIntegrations.find(i => i.id === issueIntegration);
    setIssueCreating(true); setIssueSuccess(""); setIssueSuccessUrl(""); setIssueError("");
    try {
      if (pm) {
        const severityToPriority: Record<string, number> = { error: 2, warning: 3, info: 4 };
        const priority = issueModal.finding ? severityToPriority[issueModal.finding.severity] : undefined;
        const estimateMinutes = aiEstimate || undefined;
        const result = await integrationsApi.createPMIssue({
          integrationId: pm.id,
          teamId: selectedPmProject,
          projectId: selectedPmSubProject,
          title: issueTitle,
          description: issueDescription,
          priority,
          estimateMinutes,
          assigneeId: selectedPmAssignee || undefined,
        });
        const label = result.issueKey || result.issueId;
        setIssueSuccess(result.issueUrl ? `Issue ${label} created` : `Issue created`);
        setIssueSuccessUrl(result.issueUrl || "");
      } else if (project?.connectionId && project?.repository) {
        const parsed = parseOwnerRepo(project.repository);
        if (!parsed) throw new Error("Could not parse repository URL");
        const result = await gitApi.createGitIssue(
          project.connectionId, parsed.owner, parsed.repo,
          issueTitle, issueDescription, selectedGitAssignee || undefined,
        );
        setIssueSuccess(`Issue #${result.issueNumber} created`);
        setIssueSuccessUrl(result.issueUrl || "");
      } else {
        throw new Error("No integration or git connection available");
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || "Unknown error";
      let friendly = "Failed to create issue";
      if (msg.includes("Timeout") || msg.includes("timeout")) friendly = "Connection timed out — the server may be unreachable. Check your network and try again.";
      else if (msg.includes("fetch failed")) friendly = "Could not connect to the integration server. Check that the service is running and accessible.";
      else if (msg.includes("401") || msg.includes("Unauthorized")) friendly = "Authentication failed — check your API key or token in the integration settings.";
      else if (msg.includes("403") || msg.includes("Forbidden")) friendly = "Permission denied — your token may not have permission to create issues.";
      else if (msg.includes("404") || msg.includes("Not Found")) friendly = "Project or resource not found — check the selected team/project exists.";
      else if (msg.includes("429")) friendly = "Rate limited — too many requests. Wait a moment and try again.";
      else friendly = msg;
      setIssueError(friendly);
    } finally { setIssueCreating(false); }
  };

  return {
    pmIntegrations,
    issueModal, openIssueModal, closeIssueModal,
    issueTitle, setIssueTitle, issueDescription, setIssueDescription,
    issueIntegration, handleIntegrationChange,
    issueCreating, issueSuccess, issueSuccessUrl,
    titleGenerating, issueError, setIssueError,
    pmProjects, pmProjectsLoading, selectedPmProject,
    pmTeamLabel, pmProjectLabel,
    pmSubProjects, pmSubProjectsLoading, selectedPmSubProject, setSelectedPmSubProject,
    pmMembers, selectedPmAssignee, setSelectedPmAssignee,
    gitMembers, selectedGitAssignee, setSelectedGitAssignee,
    handleTeamChange, handleCreateIssue,
  };
}
