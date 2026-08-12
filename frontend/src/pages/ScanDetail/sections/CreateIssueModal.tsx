import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PMIntegration, PMTeam, PMMember } from "@/types";
import Spinner from "@/components/Spinner";
import { SearchableCombobox } from "@/components/ui/combobox";
import { CircleCheckIcon, ExternalLinkIcon } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  repoUrl?: string;
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
  gitMembers?: Array<{ id: string; username: string; name: string; avatarUrl: string }>;
  selectedGitAssignee?: string;
  onGitAssigneeChange?: (username: string) => void;
  issueCreating: boolean;
  issueSuccess: string;
  issueSuccessUrl: string;
  issueError: string;
  onDismissError: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function CreateIssueModal({
  open, onClose, repoUrl,
  pmIntegrations, issueIntegration, onIntegrationChange,
  pmProjects, pmProjectsLoading, selectedPmProject, pmTeamLabel, pmProjectLabel,
  pmSubProjects, pmSubProjectsLoading, selectedPmSubProject, onSubProjectChange, onTeamChange,
  issueTitle, onTitleChange, titleGenerating,
  issueDescription, onDescriptionChange,
  pmMembers, selectedPmAssignee, onAssigneeChange,
  gitMembers, selectedGitAssignee, onGitAssigneeChange,
  issueCreating, issueSuccess, issueSuccessUrl, issueError, onDismissError,
  onSubmit,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Create Issue from Finding">
      {issueSuccess ? (
        <div className="flex flex-col items-center py-6 gap-4">
          <div className="size-12  rounded-full bg-success-500/10 flex items-center justify-center">
            <CircleCheckIcon className="size-7 text-success-500" />
          </div>
          <p className="text-sm font-medium text-success-500">{issueSuccess}</p>
          {issueSuccessUrl && (
            <a
              href={issueSuccessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-5 inline-flex items-center gap-2 bg-primary-500 text-primary-foreground text-sm font-medium rounded hover:bg-primary-600 transition-colors"
            >
              <ExternalLinkIcon className="size-4 " />
              Open Issue
            </a>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {pmIntegrations.length > 1 && (
            <div>
              <label htmlFor="issue-integration" className="block text-sm font-medium text-text-secondary mb-1.5">Integration</label>
              <SearchableCombobox
                id="issue-integration"
                value={issueIntegration}
                onValueChange={onIntegrationChange}
                options={pmIntegrations.map((pm) => ({ value: pm.id, label: pm.name }))}
                placeholder="Select integration"
              />
            </div>
          )}
          {pmIntegrations.length === 1 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary-50 text-sm text-text-secondary">
              Creating in {pmIntegrations[0].name}
            </div>
          )}
          {pmIntegrations.length === 0 && repoUrl && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Repository</label>
              <Input type="text" value={repoUrl} readOnly className="bg-secondary-50 text-text-muted cursor-default" />
            </div>
          )}
          {pmIntegrations.length > 0 && (<>
          <div>
            <label htmlFor="issue-pm-team" className="block text-sm font-medium text-text-secondary mb-1.5">
              {pmTeamLabel}
              {pmProjectsLoading && <span className="ml-2 text-xs text-text-muted font-normal">Loading…</span>}
            </label>
            {pmProjectsLoading ? (
              <div className="flex items-center gap-2 h-11 px-3 rounded-(--radius-input) border border-border bg-secondary-50">
                <Spinner className="size-4 " />
                <span className="text-sm text-text-muted">Fetching {pmTeamLabel.toLowerCase()}s…</span>
              </div>
            ) : pmProjects.length > 0 ? (
              <SearchableCombobox
                id="issue-pm-team"
                value={selectedPmProject}
                onValueChange={onTeamChange}
                options={pmProjects.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.key ? ` (${p.key})` : ""}`,
                  keywords: [p.key ?? "", p.name],
                }))}
                placeholder={`Select ${pmTeamLabel.toLowerCase()}`}
                searchPlaceholder={`Search ${pmTeamLabel.toLowerCase()}s…`}
              />
            ) : (
              <div className="flex items-center gap-2 h-11 px-3 rounded-(--radius-input) border border-border bg-secondary-50 text-sm text-text-muted">
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
                <div className="flex items-center gap-2 h-11 px-3 rounded-(--radius-input) border border-border bg-secondary-50">
                  <Spinner className="size-4 " />
                  <span className="text-sm text-text-muted">Fetching {pmProjectLabel.toLowerCase()}s…</span>
                </div>
              ) : pmSubProjects.length > 0 ? (
                <SearchableCombobox
                  id="issue-pm-project"
                  value={selectedPmSubProject}
                  onValueChange={onSubProjectChange}
                  options={[
                    {
                      value: "",
                      label: `None (create at ${pmTeamLabel.toLowerCase()} level)`,
                    },
                    ...pmSubProjects.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.key ? ` (${p.key})` : ""}`,
                      keywords: [p.key ?? "", p.name],
                    })),
                  ]}
                  placeholder={`Select ${pmProjectLabel.toLowerCase()}`}
                  searchPlaceholder={`Search ${pmProjectLabel.toLowerCase()}s…`}
                />
              ) : (
                <p className="text-xs text-text-muted py-1">No {pmProjectLabel.toLowerCase()}s in this {pmTeamLabel.toLowerCase()}</p>
              )}
            </div>
          )}
          </>)}
          <div>
            <label htmlFor="issue-title" className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
            <Input id="issue-title" type="text" value={issueTitle} onChange={(e) => onTitleChange(e.target.value)} disabled={titleGenerating}
              className={titleGenerating ? "opacity-50 cursor-wait" : ""} required />
          </div>
          <div>
            <label htmlFor="issue-desc" className="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
            <Textarea id="issue-desc" value={issueDescription} onChange={(e) => onDescriptionChange(e.target.value)} rows={8}
              className="font-mono resize-y" />
          </div>
          {pmMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
              <SearchableCombobox
                value={selectedPmAssignee}
                onValueChange={onAssigneeChange}
                options={pmMembers.map((m) => ({
                  value: m.id,
                  label: `${m.name}${m.email ? ` (${m.email})` : ""}`,
                  keywords: [m.email ?? "", m.name],
                }))}
                placeholder="Select assignee"
                allowEmpty
                emptyLabel="Unassigned"
              />
            </div>
          )}
          {pmIntegrations.length === 0 && gitMembers && gitMembers.length > 0 && onGitAssigneeChange && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Assignee</label>
              <SearchableCombobox
                value={selectedGitAssignee || ""}
                onValueChange={onGitAssigneeChange}
                options={gitMembers.map((m) => ({
                  value: m.id,
                  label: `${m.name}${m.name !== m.username ? ` (${m.username})` : ""}`,
                  keywords: [m.username, m.name],
                }))}
                placeholder="Select assignee"
                allowEmpty
                emptyLabel="Unassigned"
              />
            </div>
          )}
          {issueError && (
            <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
              <p>{issueError}</p>
              <button type="button" onClick={onDismissError} className="text-xs text-danger-400 hover:text-danger-600 mt-1 underline">Dismiss</button>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={pmIntegrations.length > 0 && (!issueIntegration || (!selectedPmProject && pmProjects.length > 0))}
              loading={issueCreating}
            >
              {issueCreating ? "Creating..." : "Create Issue"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
