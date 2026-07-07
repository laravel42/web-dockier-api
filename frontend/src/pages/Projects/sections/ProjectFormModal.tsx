import { useState } from "react";
import Modal from "../../../components/Modal";
import SourceControlSelect from "../../../components/SourceControlSelect";
import RepoSelect from "../../../components/RepoSelect";
import BranchSelect from "../../../components/BranchSelect";
import { FRAMEWORK_CATEGORIES } from "../../../config/frameworks";
import {
  btnPrimary,
  btnSecondary,
  inputCls,
} from "../../../utils/styles";
import type { Connection, Repo } from "../../../types";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";

interface Props {
  open: boolean;
  editing: boolean;
  form: { name: string; repository: string; branch: string };
  onFormChange: (form: { name: string; repository: string; branch: string }) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  // platform/framework
  platform: string;
  onPlatformChange: (id: string) => void;
  // selection state
  connections: Connection[];
  selectedConnectionId: string;
  onConnectionChange: (id: string) => void;
  loadingConnections: boolean;
  repos: Repo[];
  selectedRepo: string;
  onRepoChange: (val: string) => void;
  loadingRepos: boolean;
  onRefreshRepos?: () => void;
  refreshingRepos?: boolean;
  submitting?: boolean;
  branches: string[];
  selectedBranch: string;
  onBranchChange: (val: string) => void;
  loadingBranches: boolean;
  error: string;
}

export default function ProjectFormModal({
  open, editing, form, onFormChange, onClose, onSubmit,
  platform, onPlatformChange,
  connections, selectedConnectionId, onConnectionChange, loadingConnections,
  repos, selectedRepo, onRepoChange, loadingRepos,
  onRefreshRepos, refreshingRepos, submitting,
  branches, selectedBranch, onBranchChange, loadingBranches,
  error,
}: Props) {
  const needsSourceControl = platform !== "wordpress";
  const isRepoReady = !needsSourceControl || (!!selectedRepo && !!selectedBranch);
  const canSubmit = editing || (!!platform && !!form.name && isRepoReady);

  const [frameworkOpen, setFrameworkOpen] = useState(false);
  const selectedFramework = FRAMEWORK_CATEGORIES.flatMap((c) => c.frameworks).find((fw) => fw.id === platform);

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Project" : "New Project"} size="xl">
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0 space-y-4">
        {/* Framework/Platform selector — first step */}
        {!editing && (
          <div className="relative">
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Framework</label>
            <button
              type="button"
              onClick={() => setFrameworkOpen(!frameworkOpen)}
              className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
            >
              {selectedFramework ? (
                <>
                  <img src={selectedFramework.icon} alt={selectedFramework.name} className="size-5 shrink-0" />
                  <span className="truncate">{selectedFramework.name}</span>
                </>
              ) : (
                <span className="text-text-muted">Select a framework…</span>
              )}
              <svg className="size-4 ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {frameworkOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFrameworkOpen(false)} />
                <div className="absolute inset-x-0  top-full z-20 mt-1 rounded-(--radius-input) border border-border bg-card shadow-lg max-h-64 overflow-y-auto">
                  {FRAMEWORK_CATEGORIES.map((category) => (
                    <div key={category.name}>
                      <div className="sticky top-0 bg-card/95 backdrop-blur px-3 py-1.5 border-b border-border/50">
                        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{category.name}</span>
                      </div>
                      {category.frameworks.map((fw) => (
                        <button
                          key={fw.id}
                          type="button"
                          onClick={() => { onPlatformChange(fw.id); setFrameworkOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                            platform === fw.id
                              ? "bg-primary-500/10 text-primary-500"
                              : "text-text hover:bg-secondary-50"
                          }`}
                        >
                          <img src={fw.icon} alt={fw.name} className="size-5 shrink-0" />
                          <span className="font-medium">{fw.name}</span>
                          {platform === fw.id && (
                            <svg className="size-4 ml-auto text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

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

        {error && (
          <div className="rounded-(--radius-input) bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        {/* ── Source Control flow ── */}
        {needsSourceControl && !editing && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Source Control</label>
              <SourceControlSelect
                value={selectedConnectionId}
                onChange={onConnectionChange}
                connections={connections}
                loading={loadingConnections}
              />
            </div>

            {!selectedConnectionId && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LinkIcon className="size-7 " />
                </div>
                <p className="text-sm font-medium text-text-secondary">Connect your source control</p>
                <p className="text-xs text-text-muted max-w-xs">Select a source control provider above to browse your repositories and pick a branch.</p>
              </div>
            )}

            {selectedConnectionId && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Repository</label>
                <RepoSelect value={selectedRepo} onChange={onRepoChange} repos={repos} loading={loadingRepos} onRefresh={onRefreshRepos} refreshing={refreshingRepos} />
              </div>
            )}

            {selectedRepo && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Branch</label>
                <BranchSelect value={selectedBranch} onChange={onBranchChange} branches={branches} loading={loadingBranches} />
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-border sticky bottom-0 bg-card">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button
            type="submit"
            className={btnPrimary}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="size-4  border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : editing ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
