import { useState, useEffect, useCallback, useId } from "react";
import { projectsApi } from "@/services/projects";
import { gitApi } from "@/services/git";
import type { Project, Connection, Repo } from "@/types";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import SourceControlSelect from "@/components/SourceControlSelect";
import RepoSelect from "@/components/RepoSelect";
import BranchSelect from "@/components/BranchSelect";

// ─── Branch Picker Inline ───

export default function BranchPickerInline({
  project,
  canManage,
  onProjectUpdate,
}: {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toast = useToast();

  const fetchBranches = useCallback(async () => {
    if (!project.connectionId || !project.repository) return;
    setLoading(true);
    const parsed = parseOwnerRepo(project.repository);
    if (!parsed) { setLoading(false); return; }
    try {
      const res = await gitApi.listBranches(project.connectionId, parsed.owner, parsed.repo);
      setBranches(res.branches);
    } catch {
      if (project.branch) setBranches([project.branch]);
    } finally {
      setLoading(false);
    }
  }, [project.connectionId, project.repository, project.branch]);

  useEffect(() => { void fetchBranches(); }, [fetchBranches]);

  const handleChange = async (branch: string) => {
    if (branch === project.branch) return;
    try {
      const updated = await projectsApi.update(project.id, { branch });
      onProjectUpdate?.(updated);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update branch"));
    }
  };

  if (!project.connectionId || !project.repository || !canManage) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-muted">
        {project.branch || "main"}
      </span>
    );
  }

  return (
    <div className="w-3xs">
      <BranchSelect
        value={project.branch || ""}
        onChange={(b) => void handleChange(b)}
        branches={branches}
        loading={loading}
        onReload={fetchBranches}
      />
    </div>
  );
}

// ─── Git Repository Modal ───

export function GitRepositoryModal({
  open,
  onClose,
  project,
  onProjectUpdate,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onProjectUpdate?: (project: Project) => void;
}) {
  const fid = useId();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState(project.connectionId || "");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [searchingRepos, setSearchingRepos] = useState(false);
  const [refreshingRepos, setRefreshingRepos] = useState(false);
  const [hasMoreRepos, setHasMoreRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(project.repository || "");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingConnections(true);
      try {
        const res = await gitApi.listConnections();
        setConnections(res.connections);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to load connections"));
      } finally { setLoadingConnections(false); }
    };
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
  }, [open]);

  useEffect(() => {
    if (!selectedConnectionId) { setRepos([]); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingRepos(true);
      setRepos([]);
      try {
        const res = await gitApi.listRepos(selectedConnectionId);
        if (!cancelled) {
          setRepos(res.repos);
          setHasMoreRepos(res.hasMore);
          if (project.repository && selectedConnectionId === project.connectionId) {
            let repoPath = project.repository;
            try {
              const url = new URL(repoPath);
              repoPath = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
            } catch { /* not a URL */ }
            const findMatch = (list: Repo[]) => list.find(
              (r) => r.fullName === repoPath || r.fullName === project.repository || r.url === project.repository,
            );
            let match = findMatch(res.repos);
            // Only the first page is loaded, so the project's repo may not be in
            // it — look it up directly and merge it into the list.
            if (!match && repoPath) {
              const term = repoPath.split("/").pop() || repoPath;
              const found = await gitApi.listRepos(selectedConnectionId, { search: term }).catch(() => null);
              match = found ? findMatch(found.repos) : undefined;
              if (match && !cancelled) {
                const resolved = match;
                setRepos((prev) => (prev.some((r) => r.fullName === resolved.fullName) ? prev : [resolved, ...prev]));
              }
            }
            if (match && !cancelled) setSelectedRepo(match.fullName);
          }
        }
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err, "Failed to load repositories"));
      } finally { if (!cancelled) setLoadingRepos(false); }
    };
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
  }, [selectedConnectionId, project.connectionId, project.repository]);

  /** Server-side repo search (debounced by RepoSelect). Empty term restores the default page. */
  const searchRepos = useCallback(async (term: string) => {
    if (!selectedConnectionId) return;
    setSearchingRepos(true);
    try {
      const res = await gitApi.listRepos(selectedConnectionId, { search: term || undefined });
      setRepos(res.repos);
      setHasMoreRepos(res.hasMore);
    } catch { /* non-fatal: keep the current list */ } finally {
      setSearchingRepos(false);
    }
  }, [selectedConnectionId]);

  /** Bypass the repo cache — picks up renames, deletions, and brand-new repos. */
  const refreshRepos = useCallback(async () => {
    if (!selectedConnectionId) return;
    setRefreshingRepos(true);
    try {
      const res = await gitApi.listRepos(selectedConnectionId, { refresh: true });
      setRepos(res.repos);
      setHasMoreRepos(res.hasMore);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to refresh repositories"));
    } finally {
      setRefreshingRepos(false);
    }
  }, [selectedConnectionId, toast]);

  const handleSubmit = async () => {
    if (!selectedRepo) return;
    setSaving(true);
    try {
      const updated = await projectsApi.update(project.id, {
        repository: selectedRepo,
        connectionId: selectedConnectionId,
      });
      onProjectUpdate?.(updated);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update repository"));
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Git repository">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">Configure the Git repository that should be deployed.</p>

        <div>
          <span id={`${fid}-source-control`} className="mb-1.5 block text-sm font-medium text-text-muted">Source control</span>
          <SourceControlSelect labelledBy={`${fid}-source-control`}
            value={selectedConnectionId}
            onChange={(id) => { setSelectedConnectionId(id); setSelectedRepo(""); }}
            connections={connections}
            loading={loadingConnections}
          />
        </div>

        {selectedConnectionId && (
          <div>
            <span id={`${fid}-repository`} className="mb-1.5 block text-sm font-medium text-text-muted">Repository</span>
            <RepoSelect labelledBy={`${fid}-repository`} value={selectedRepo} onChange={setSelectedRepo} repos={repos} loading={loadingRepos} onRefresh={refreshRepos} refreshing={refreshingRepos} onSearch={searchRepos} searching={searchingRepos} hasMore={hasMoreRepos} />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!selectedRepo} loading={saving}>
            Set repository
          </Button>
        </div>
      </div>
    </Modal>
  );
}
