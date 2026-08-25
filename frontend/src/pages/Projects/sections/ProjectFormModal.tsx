import { useState, useId, useEffect } from "react";
import Modal from "@/components/Modal";
import SourceControlSelect from "@/components/SourceControlSelect";
import RepoSelect from "@/components/RepoSelect";
import BranchSelect from "@/components/BranchSelect";
import { FRAMEWORK_CATEGORIES } from "@/config/frameworks";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { CheckIcon, ChevronDownIcon, LinkIcon } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useProjectForm } from "../useProjectForm";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProjectFormModal({ open, onClose, onSuccess }: Props) {
  const {
    form, setForm,
    platform, setPlatform, detectingPlatform,
    connections, selectedConnectionId, setSelectedConnectionId,
    repos, selectedRepo, setSelectedRepo,
    branches, selectedBranch, setSelectedBranch,
    loadingRepos, loadingBranches, loadingConnections,
    refreshRepos, refreshingRepos,
    searchRepos, searchingRepos, hasMoreRepos,
    error, submitting,
    openCreate, closeForm, handleSubmit,
  } = useProjectForm({ onSuccess: () => { onClose(); onSuccess(); } });

  // Trigger internal open/reset when the modal opens
  useEffect(() => {
    if (open) openCreate();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    closeForm();
    onClose();
  };

  const fid = useId();
  const isRepoReady = !!selectedRepo && !!selectedBranch;
  const canSubmit = !!platform && !!form.name && isRepoReady;

  const [frameworkOpen, setFrameworkOpen] = useState(false);
  useEscapeKey(frameworkOpen, () => setFrameworkOpen(false));
  const selectedFramework = FRAMEWORK_CATEGORIES.flatMap((c) => c.frameworks).find((fw) => fw.id === platform);

  // Auto-fill project name from repo selection
  const handleRepoChange = (val: string) => {
    setSelectedRepo(val);
    if (!form.name && val) {
      const repo = repos.find((r) => r.fullName === val);
      if (repo) setForm((f) => ({ ...f, name: repo.name }));
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="New Project" size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 space-y-4">
        <div>
          <label htmlFor="project-name" className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <Input
            id="project-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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
        <div>
          <span id={`${fid}-source-control`} className="block text-sm font-medium text-text-secondary mb-1.5">Source Control</span>
          <SourceControlSelect labelledBy={`${fid}-source-control`}
            value={selectedConnectionId}
            onChange={setSelectedConnectionId}
            connections={connections}
            loading={loadingConnections}
          />
        </div>

        {!selectedConnectionId && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LinkIcon className="size-7" />
            </div>
            <p className="text-sm font-medium text-text-secondary">Connect your source control</p>
            <p className="text-xs text-text-muted max-w-xs">Select a source control provider above to browse your repositories and pick a branch.</p>
          </div>
        )}

        {selectedConnectionId && (
          <div>
            <span id={`${fid}-repository`} className="block text-sm font-medium text-text-secondary mb-1.5">Repository</span>
            <RepoSelect labelledBy={`${fid}-repository`} value={selectedRepo} onChange={handleRepoChange} repos={repos} loading={loadingRepos} onRefresh={refreshRepos} refreshing={refreshingRepos} onSearch={searchRepos} searching={searchingRepos} hasMore={hasMoreRepos} />
          </div>
        )}

        {selectedRepo && (
          <div>
            <span id={`${fid}-branch`} className="block text-sm font-medium text-text-secondary mb-1.5">Branch</span>
            <BranchSelect labelledBy={`${fid}-branch`} value={selectedBranch} onChange={setSelectedBranch} branches={branches} loading={loadingBranches} />
          </div>
        )}

        {/* Framework/Platform selector — shown after repo+branch are chosen */}
        {selectedBranch && (
          <div className="relative">
            <span id={`${fid}-framework`} className="block text-sm font-medium text-text-secondary mb-1.5">
              Framework
              {detectingPlatform && (
                <span className="ml-2 text-xs font-normal text-text-muted">Detecting…</span>
              )}
            </span>
            <button
              type="button"
              aria-labelledby={`${fid}-framework`}
              aria-haspopup="listbox"
              aria-expanded={frameworkOpen}
              onClick={() => setFrameworkOpen(!frameworkOpen)}
              className="w-full h-9 px-3 rounded-(--radius-input) border border-border bg-card text-ui outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
            >
              {selectedFramework ? (
                <>
                  <img src={selectedFramework.icon} alt={selectedFramework.name} className="size-5 shrink-0" />
                  <span className="truncate">{selectedFramework.name}</span>
                </>
              ) : (
                <span className="text-text-muted">{detectingPlatform ? "Analyzing repository…" : "Select a framework…"}</span>
              )}
              <ChevronDownIcon className="size-4 ml-auto shrink-0 text-text-muted" />
            </button>

            {frameworkOpen && (
              <>
                <div aria-hidden="true" className="fixed inset-0 z-10" onClick={() => setFrameworkOpen(false)} />
                <div className="absolute inset-x-0 bottom-full z-20 mb-1 rounded-(--radius-input) border border-border bg-card shadow-(--shadow-overlay) max-h-64 overflow-y-auto">
                  {FRAMEWORK_CATEGORIES.map((category) => (
                    <div key={category.name}>
                      <div className="sticky top-0 bg-card/95 backdrop-blur px-3 py-1.5 border-b border-border/50">
                        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{category.name}</span>
                      </div>
                      {category.frameworks.map((fw) => (
                        <button
                          key={fw.id}
                          type="button"
                          onClick={() => { setPlatform(fw.id); setFrameworkOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                            platform === fw.id
                              ? "bg-primary-500/10 text-primary-500"
                              : "text-text hover:bg-secondary-50"
                          }`}
                        >
                          <img src={fw.icon} alt={fw.name} className="size-5 shrink-0" />
                          <span className="font-medium">{fw.name}</span>
                          {platform === fw.id && (
                            <CheckIcon className="size-4 ml-auto text-primary-500" />
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

        <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-border sticky bottom-0 bg-card">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            {submitting ? "Analyzing…" : "Create Project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
