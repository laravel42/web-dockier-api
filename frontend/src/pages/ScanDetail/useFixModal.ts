import { useState } from "react";
import { gitApi } from "../../services/api";
import { parseOwnerRepo } from "../../utils/parseOwnerRepo";
import type { Finding, Project, RepoMember, FixResult } from "../../types";

export function useFixModal(project: Project | null) {
  const [fixModal, setFixModal] = useState<{ open: boolean; finding: Finding | null }>({ open: false, finding: null });
  const [fixLoading, setFixLoading] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixError, setFixError] = useState("");

  const [repoMembers, setRepoMembers] = useState<RepoMember[]>([]);
  const [mrAssignee, setMrAssignee] = useState("");
  const [mrReviewer, setMrReviewer] = useState("");
  const [mrTitle, setMrTitle] = useState("");
  const [mrDescription, setMrDescription] = useState("");
  const [titleGenerating, setTitleGenerating] = useState(false);
  const [mrCreating, setMrCreating] = useState<string | null>(null);

  const openFixModal = (f: Finding) => {
    if (!project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    setFixModal({ open: true, finding: f });
    setFixLoading(false);
    setFixResult(null);
    setFixError("");
    setMrAssignee("");
    setMrReviewer("");
    setMrTitle("Generating title…");
    setTitleGenerating(true);

    const repoUrl = project.repository?.replace(/\.git$/, "") || "";
    const branch = project.branch || "main";
    const blameUrl = `${repoUrl}/-/blame/${branch}/${f.filePath}#L${f.startLine}`;
    const cleanMsg = f.message.replace(/\s+/g, " ").trim();
    setMrDescription([cleanMsg, ``, `**Source:** ${blameUrl}`].join("\n"));

    gitApi.listRepoMembers(project.connectionId, parsed.owner, parsed.repo)
      .then(res => setRepoMembers(res.members))
      .catch(() => setRepoMembers([]));

    gitApi.summarizeFinding(f.severity, f.message, f.filePath, f.snippet || "")
      .then(res => { setMrTitle(res.title || f.message.slice(0, 60)); setTitleGenerating(false); })
      .catch(() => { setMrTitle(f.message.slice(0, 60)); setTitleGenerating(false); });
  };

  const closeFixModal = () => setFixModal({ open: false, finding: null });

  const handleSubmitMR = async () => {
    const f = fixModal.finding;
    if (!f || !project) return;
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) return;

    setFixLoading(true);
    setFixError("");
    setMrCreating(f.id);
    try {
      const result = await gitApi.createFixMR(project.connectionId, {
        owner: parsed.owner, repo: parsed.repo, branch: project.branch || "main",
        filePath: f.filePath, startLine: f.startLine, endLine: f.endLine,
        ruleId: f.ruleId, severity: f.severity, message: f.message, snippet: f.snippet || "",
        aiType: "openai",
        assignee: mrAssignee || undefined, reviewer: mrReviewer || undefined,
      });
      setFixResult(result);
    } catch (err: unknown) {
      setFixError((err as Error).message || "Failed to create MR");
    } finally {
      setFixLoading(false);
      setMrCreating(null);
    }
  };

  return {
    fixModal, openFixModal, closeFixModal,
    fixLoading, fixResult, fixError, setFixError,
    repoMembers,
    mrAssignee, setMrAssignee,
    mrReviewer, setMrReviewer,
    mrTitle, setMrTitle,
    mrDescription, setMrDescription,
    titleGenerating, mrCreating,
    handleSubmitMR,
  };
}
