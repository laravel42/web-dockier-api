import { useState, useEffect, useCallback } from "react";
import { projectsApi } from "@/services/projects";
import { gitApi } from "@/services/git";
import type { Project, Connection, Repo } from "@/types";
import { parseOwnerRepo } from "@/utils/parseOwnerRepo";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import SourceControlSelect from "@/components/SourceControlSelect";
import RepoSelect from "@/components/RepoSelect";
import BranchSelect from "@/components/BranchSelect";

// ─── Branch Picker Inline ───

export default function BranchPickerInline({
  project,
  canManage: _canManage,
  onProjectUpdate,
}: {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

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
    } catch { /* silent */ }
  };

  if (!project.connectionId || !project.repository) {
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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState(project.connectionId || "");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(project.repository || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoadingConnections(true);
      try {
        const res = await gitApi.listConnections();
        setConnections(res.connections);
      } catch { /* silent */ }
      finally { setLoadingConnections(false); }
    };
    void load();
  }, [open]);

  useEffect(() => {
    if (!selectedConnectionId) { setRepos([]); return; }
    let cancelled = false;
    const load = async () => {
      setLoadingRepos(true);
      setRepos([]);
      try {
        const res = await gitApi.listRepos(selectedConnectionId, false);
        if (!cancelled) {
          setRepos(res.repos);
          if (project.repository && selectedConnectionId === project.connectionId) {
            let repoPath = project.repository;
            try {
              const url = new URL(repoPath);
              repoPath = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
            } catch { /* not a URL */ }
            const match = res.repos.find(
              (r) => r.fullName === repoPath || r.fullName === project.repository || r.url === project.repository,
            );
            if (match) setSelectedRepo(match.fullName);
          }
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoadingRepos(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedConnectionId, project.connectionId, project.repository]);

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
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Git repository">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">Configure the Git repository that should be deployed.</p>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-muted">Source control</label>
          <SourceControlSelect
            value={selectedConnectionId}
            onChange={(id) => { setSelectedConnectionId(id); setSelectedRepo(""); }}
            connections={connections}
            loading={loadingConnections}
          />
        </div>

        {selectedConnectionId && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-muted">Repository</label>
            <RepoSelect value={selectedRepo} onChange={setSelectedRepo} repos={repos} loading={loadingRepos} />
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
