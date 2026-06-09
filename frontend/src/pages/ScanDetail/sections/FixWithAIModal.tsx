import Modal from "../../../components/Modal";
import { SearchableCombobox } from "../../../components/ui/combobox";
import type { Finding, RepoMember, FixResult } from "../../../types";

interface Props {
  open: boolean;
  finding: Finding | null;
  onClose: () => void;
  fixLoading: boolean;
  fixResult: FixResult | null;
  fixError: string;
  onDismissError: () => void;
  repoMembers: RepoMember[];
  mrTitle: string;
  onTitleChange: (val: string) => void;
  titleGenerating: boolean;
  mrDescription: string;
  onDescriptionChange: (val: string) => void;
  mrAssignee: string;
  onAssigneeChange: (val: string) => void;
  mrReviewer: string;
  onReviewerChange: (val: string) => void;
  onSubmit: () => void;
}

export default function FixWithAIModal({
  open, finding, onClose,
  fixLoading, fixResult, fixError, onDismissError,
  repoMembers,
  mrTitle, onTitleChange, titleGenerating,
  mrDescription, onDescriptionChange,
  mrAssignee, onAssigneeChange,
  mrReviewer, onReviewerChange,
  onSubmit,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Fix with AI">
      {fixResult ? (
        <div className="flex flex-col items-center py-8 gap-4">
          <div className="size-12  rounded-full bg-success-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="size-7  text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-success-500">Merge request created</p>
          {fixResult.mrUrl && (
            <a href={fixResult.mrUrl} target="_blank" rel="noopener noreferrer"
              className="h-9 px-5 inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="size-4 " fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open Merge Request
            </a>
          )}
        </div>
      ) : fixLoading ? (
        <div className="flex flex-col items-center py-10 gap-4">
          <div className="relative">
            <div className="size-12  border-[3px] border-violet-200 rounded-full" />
            <div className="absolute inset-0 size-12  border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-text">AI is analyzing the vulnerability…</p>
            <p className="text-xs text-text-muted mt-1">Generating fix and creating merge request</p>
          </div>
        </div>
      ) : finding ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
            <input type="text" value={mrTitle} onChange={(e) => onTitleChange(e.target.value)} disabled={titleGenerating}
              className={`w-full h-11 px-3 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors ${titleGenerating ? "opacity-50 cursor-wait" : ""}`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <textarea value={mrDescription} onChange={(e) => onDescriptionChange(e.target.value)} rows={5}
              className="w-full px-3 py-2 rounded border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors font-mono resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
            <SearchableCombobox
              value={mrAssignee}
              onValueChange={onAssigneeChange}
              options={repoMembers.map((m) => ({
                value: m.id,
                label: `${m.name} (${m.username})`,
                keywords: [m.username, m.name],
              }))}
              placeholder="Select assignee"
              allowEmpty
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Reviewer</label>
            <SearchableCombobox
              value={mrReviewer}
              onValueChange={onReviewerChange}
              options={repoMembers.map((m) => ({
                value: m.id,
                label: `${m.name} (${m.username})`,
                keywords: [m.username, m.name],
              }))}
              placeholder="Select reviewer"
              allowEmpty
            />
          </div>
          {fixError && (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
              <p>{fixError}</p>
              <button type="button" onClick={onDismissError} className="text-xs text-danger-400 hover:text-danger-600 mt-1 underline">Dismiss</button>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={onSubmit} disabled={fixLoading || !mrTitle}
              className="h-9 px-4 bg-violet-500 text-white text-sm font-medium rounded-(--radius-btn) hover:bg-violet-600 disabled:opacity-50 transition-colors">
              Create Merge Request
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
