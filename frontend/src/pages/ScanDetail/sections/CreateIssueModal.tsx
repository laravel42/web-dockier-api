import CheckCircleIcon from "../../../components/icons/outlined/CheckCircleIcon";
import ExternalLinkIcon from "../../../components/icons/outlined/ExternalLinkIcon";
import Modal from "../../../components/Modal";
import type { PMIntegration, PMTeam, PMMember } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  // form state
  pmIntegrations: PMIntegration[];
  issueIntegration: string;
  onIntegrationChange: (id: string) => void;
  pmProjects: PMTeam[];
  pmProjectsLoading: boolean;
  selectedPmProject: string;
  pmTeamLabel: string;
  pmProjectLabel: string;
  pmSubProjects: PMTeam[];
  pmSubProjectsLoading: boolean;
  selectedPmSubProject: string;
  onSubProjectChange: (id: string) => void;
  onTeamChange: (id: string) => void;
  issueTitle: string;
  onTitleChange: (val: string) => void;
  titleGenerating: boolean;
  issueDescription: string;
  onDescriptionChange: (val: string) => void;
  pmMembers: PMMember[];
  selectedPmAssignee: string;
  onAssigneeChange: (id: string) => void;
  issueCreating: boolean;
  issueSuccess: string;
  issueSuccessUrl: string;
  issueError: string;
  onDismissError: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function CreateIssueModal({
  open, onClose,
  pmIntegrations, issueIntegration, onIntegrationChange,
  pmProjects, pmProjectsLoading, selectedPmProject, pmTeamLabel, pmProjectLabel,
  pmSubProjects, pmSubProjectsLoading, selectedPmSubProject, onSubProjectChange, onTeamChange,
  issueTitle, onTitleChange, titleGenerating,
  issueDescription, onDescriptionChange,
  pmMembers, selectedPmAssignee, onAssigneeChange,
  issueCreating, issueSuccess, issueSuccessUrl, issueError, onDismissError,
  onSubmit,
}: Props) {
  const selectCls = "w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors";
  const inputCls = `w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors`;

  return (
    <Modal open={open} onClose={onClose} title="Create Issue from Finding">
      {issueSuccess ? (
        <div className="flex flex-col items-center py-6 gap-4">
          <div className="w-12 h-12 rounded-full bg-success-500/10 flex items-center justify-center">
            <CheckCircleIcon className="w-7 h-7 text-success-500" />
          </div>
          <p className="text-sm font-medium text-success-500">{issueSuccess}</p>
          {issueSuccessUrl && (
            <a
              href={issueSuccessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-5 inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition-colors"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              Open Issue
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {pmIntegrations.length > 1 && (
            <div>
              <label htmlFor="issue-integration" className="block text-sm font-medium text-text-secondary mb-1.5">Integration</label>
              <select id="issue-integration" value={issueIntegration} onChange={(e) => onIntegrationChange(e.target.value)} className={selectCls}>
                {pmIntegrations.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
              </select>
            </div>
          )}
          {pmIntegrations.length === 1 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 text-sm text-text-secondary">
              Creating in {pmIntegrations[0].name}
            </div>
          )}
          <div>
            <label htmlFor="issue-pm-team" className="block text-sm font-medium text-text-secondary mb-1.5">
              {pmTeamLabel}
              {pmProjectsLoading && <span className="ml-2 text-xs text-text-muted font-normal">Loading…</span>}
            </label>
            {pmProjectsLoading ? (
              <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-text-muted">Fetching {pmTeamLabel.toLowerCase()}s…</span>
              </div>
            ) : pmProjects.length > 0 ? (
              <select id="issue-pm-team" value={selectedPmProject} onChange={(e) => onTeamChange(e.target.value)} className={selectCls}>
                {pmProjects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50 text-sm text-text-muted">
                No {pmTeamLabel.toLowerCase()}s found
              </div>
            )}
          </div>
          {pmProjectLabel && (
            <div>
              <label htmlFor="issue-pm-project" className="block text-sm font-medium text-text-secondary mb-1.5">
                {pmProjectLabel}
                {pmSubProjectsLoading && <span className="ml-2 text-xs text-text-muted font-normal">Loading…</span>}
              </label>
              {pmSubProjectsLoading ? (
                <div className="flex items-center gap-2 h-11 px-3 rounded-[var(--radius-input)] border border-border bg-secondary-50">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-text-muted">Fetching {pmProjectLabel.toLowerCase()}s…</span>
                </div>
              ) : pmSubProjects.length > 0 ? (
                <select id="issue-pm-project" value={selectedPmSubProject} onChange={(e) => onSubProjectChange(e.target.value)} className={selectCls}>
                  <option value="">None (create at {pmTeamLabel.toLowerCase()} level)</option>
                  {pmSubProjects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.key ? ` (${p.key})` : ""}</option>)}
                </select>
              ) : (
                <p className="text-xs text-text-muted py-1">No {pmProjectLabel.toLowerCase()}s in this {pmTeamLabel.toLowerCase()}</p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="issue-title" className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
            <input id="issue-title" type="text" value={issueTitle} onChange={(e) => onTitleChange(e.target.value)} disabled={titleGenerating}
              className={`${inputCls} ${titleGenerating ? "opacity-50 cursor-wait" : ""}`} required />
          </div>
          <div>
            <label htmlFor="issue-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <textarea id="issue-desc" value={issueDescription} onChange={(e) => onDescriptionChange(e.target.value)} rows={8}
              className="w-full px-3 py-2 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors font-mono resize-y" />
          </div>
          {pmMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
              <select value={selectedPmAssignee} onChange={(e) => onAssigneeChange(e.target.value)} className={selectCls}>
                <option value="">Unassigned</option>
                {pmMembers.map(m => <option key={m.id} value={m.id}>{m.name}{m.email ? ` (${m.email})` : ""}</option>)}
              </select>
            </div>
          )}
          {issueError && (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
              <p>{issueError}</p>
              <button type="button" onClick={onDismissError} className="text-xs text-danger-400 hover:text-danger-600 mt-1 underline">Dismiss</button>
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={issueCreating || !issueIntegration || (!selectedPmProject && pmProjects.length > 0)}
              className="h-9 px-4 bg-primary-500 text-white text-sm font-medium rounded-[var(--radius-btn)] hover:bg-primary-600 disabled:opacity-50 transition-colors">
              {issueCreating ? "Creating..." : "Create Issue"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
