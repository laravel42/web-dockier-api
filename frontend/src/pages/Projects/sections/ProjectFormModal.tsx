import Modal from "../../../components/Modal";
import SourceControlSelect from "../../../components/SourceControlSelect";
import RepoSelect from "../../../components/RepoSelect";
import BranchSelect from "../../../components/BranchSelect";
import {
  btnPrimary,
  btnSecondary,
  choiceCardIconIdleCls,
  choiceCardIconSelectedCls,
  choiceCardIdleCls,
  choiceCardSelectedCls,
  inputCls,
} from "../../../utils/styles";
import type { Connection, Repo, ProjectSourceType } from "../../../types";
import { PROJECT_TEMPLATES } from "../templates";
import LinkIcon from "../../../components/icons/outlined/LinkIcon";
import CodeIcon from "../../../components/icons/outlined/CodeIcon";

interface Props {
  open: boolean;
  editing: boolean;
  form: { name: string; repository: string; branch: string };
  onFormChange: (form: { name: string; repository: string; branch: string }) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  // source type
  sourceType: ProjectSourceType;
  onSourceTypeChange: (type: ProjectSourceType) => void;
  selectedTemplate: string;
  onTemplateChange: (id: string) => void;
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

const templateIcons: Record<string, React.ReactNode> = {
  wordpress: (
    <svg viewBox="0 0 24 24" className="size-8 " fill="currentColor">
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.508 14.59L7.36 8.592c.486-.024.924-.072.924-.072.434-.048.386-.69-.05-.666 0 0-1.308.102-2.15.102-.152 0-.33-.004-.518-.012A8.01 8.01 0 0 1 12 4c2.357 0 4.506.958 6.053 2.508-.038-.002-.076-.008-.116-.008-.77 0-1.316.67-1.316 1.39 0 .646.372 1.192.77 1.838.298.522.646 1.192.646 2.16 0 .67-.258 1.448-.596 2.53l-.782 2.612-2.832-8.438c.486-.024.924-.072.924-.072.434-.048.386-.69-.05-.666 0 0-1.308.102-2.15.102-.15 0-.328-.004-.514-.01l-.004.002zM16.4 17.2l-2.546-7.31c.476-1.41.634-2.538.634-3.542 0-.364-.024-.702-.066-1.014A7.97 7.97 0 0 1 20 12c0 2.14-.84 4.082-2.208 5.516l-.002.002-1.39-4.318zm-12.4-5.2c0-1.4.36-2.714.992-3.858l3.462 9.486A8.013 8.013 0 0 1 4 12zm8 8c-.876 0-1.716-.14-2.504-.4l2.66-7.726 2.724 7.462c.018.044.04.084.062.124A7.96 7.96 0 0 1 12 20z" />
    </svg>
  ),
};

export default function ProjectFormModal({
  open, editing, form, onFormChange, onClose, onSubmit,
  sourceType, onSourceTypeChange, selectedTemplate, onTemplateChange,
  connections, selectedConnectionId, onConnectionChange, loadingConnections,
  repos, selectedRepo, onRepoChange, loadingRepos,
  onRefreshRepos, refreshingRepos, submitting,
  branches, selectedBranch, onBranchChange, loadingBranches,
  error,
}: Props) {
  const isTemplateReady = sourceType === "template" && !!selectedTemplate && !!form.name;
  const isRepoReady = !!form.name && !!selectedRepo && !!selectedBranch;
  const canSubmit = editing || (sourceType === "template" ? isTemplateReady : isRepoReady);

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

        {/* Source type toggle — only show when creating */}
        {!editing && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Project Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSourceTypeChange("repository")}
                className={`flex items-center gap-3 rounded-(--radius-input) border p-3 text-left transition-all ${
                  sourceType === "repository" ? choiceCardSelectedCls : choiceCardIdleCls
                }`}
              >
                <div className={`flex size-9 items-center justify-center rounded-lg ${
                  sourceType === "repository" ? choiceCardIconSelectedCls : choiceCardIconIdleCls
                }`}>
                  <CodeIcon className="size-5 " />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Source Control</p>
                  <p className="text-xs text-muted-foreground">Connect a Git repository</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSourceTypeChange("template")}
                className={`flex items-center gap-3 rounded-(--radius-input) border p-3 text-left transition-all ${
                  sourceType === "template" ? choiceCardSelectedCls : choiceCardIdleCls
                }`}
              >
                <div className={`flex size-9 items-center justify-center rounded-lg ${
                  sourceType === "template" ? choiceCardIconSelectedCls : choiceCardIconIdleCls
                }`}>
                  <svg className="size-5 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Template</p>
                  <p className="text-xs text-muted-foreground">Start from a pre-built template</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-(--radius-input) bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        {/* ── Source Control flow ── */}
        {(sourceType === "repository" || editing) && (
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

        {/* ── Template flow ── */}
        {sourceType === "template" && !editing && (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Choose a Template</label>
            <div className="grid grid-cols-1 gap-2">
              {PROJECT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onTemplateChange(tpl.id);
                    if (!form.name) onFormChange({ ...form, name: tpl.name });
                  }}
                  className={`flex items-center gap-4 rounded-(--radius-input) border p-4 text-left transition-all ${
                    selectedTemplate === tpl.id ? choiceCardSelectedCls : choiceCardIdleCls
                  }`}
                >
                  <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                    selectedTemplate === tpl.id ? choiceCardIconSelectedCls : choiceCardIconIdleCls
                  }`}>
                    {templateIcons[tpl.icon] || (
                      <svg className="size-6 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tpl.description}</p>
                  </div>
                  {selectedTemplate === tpl.id && (
                    <div className="ml-auto shrink-0">
                      <svg className="size-5  text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            {PROJECT_TEMPLATES.length === 1 && (
              <p className="text-xs text-text-muted mt-2">More templates coming soon.</p>
            )}
          </div>
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
