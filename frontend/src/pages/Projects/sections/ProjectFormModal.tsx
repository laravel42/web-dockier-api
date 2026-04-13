import Modal from "../../../components/Modal";
import SourceControlSelect from "../../../components/SourceControlSelect";
import RepoSelect from "../../../components/RepoSelect";
import BranchSelect from "../../../components/BranchSelect";
import { btnSecondary } from "../../../utils/styles";
import { btnPrimary, inputCls } from "../constants";
import type { Connection, Repo } from "../types";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  open: boolean;
  editing: boolean;
  form: { name: string; repository: string; branch: string };
  onFormChange: (form: { name: string; repository: string; branch: string }) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  // selection state
  connections: Connection[];
  selectedConnectionId: string;
  onConnectionChange: (id: string) => void;
  loadingConnections: boolean;
  repos: Repo[];
  selectedRepo: string;
  onRepoChange: (val: string) => void;
  loadingRepos: boolean;
  branches: string[];
  selectedBranch: string;
  onBranchChange: (val: string) => void;
  loadingBranches: boolean;
  error: string;
}

export default function ProjectFormModal({
  open, editing, form, onFormChange, onClose, onSubmit,
  connections, selectedConnectionId, onConnectionChange, loadingConnections,
  repos, selectedRepo, onRepoChange, loadingRepos,
  branches, selectedBranch, onBranchChange, loadingBranches,
  error,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Project" : "New Project"} size="xl">
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0 space-y-4">
        <div>
          <label htmlFor="project-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input
            id="project-name"
            type="text"
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            className={inputCls}
            placeholder="My App"
            required
          />
        </div>

        {/* Step 1: Source Control */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Source Control</label>
          <SourceControlSelect
            value={selectedConnectionId}
            onChange={onConnectionChange}
            connections={connections}
            loading={loadingConnections}
          />
        </div>

        {error && (
          <div className="rounded-[var(--radius-input)] bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        {!selectedConnectionId && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center text-primary-400">
              <LinkIcon className="w-7 h-7" />
            </div>
            <p className="text-sm font-medium text-text-secondary">Connect your source control</p>
            <p className="text-xs text-text-muted max-w-xs">Select a source control provider above to browse your repositories and pick a branch.</p>
          </div>
        )}

        {/* Step 2: Repository */}
        {selectedConnectionId && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Repository</label>
            <RepoSelect value={selectedRepo} onChange={onRepoChange} repos={repos} loading={loadingRepos} />
          </div>
        )}

        {/* Step 3: Branch */}
        {selectedRepo && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Branch</label>
            <BranchSelect value={selectedBranch} onChange={onBranchChange} branches={branches} loading={loadingBranches} />
          </div>
        )}

        <div className="absolute bottom-4 right-6 flex items-center gap-3">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button
            type="submit"
            className={btnPrimary}
            disabled={!editing && (!form.name || !selectedRepo || !selectedBranch)}
          >
            {editing ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
