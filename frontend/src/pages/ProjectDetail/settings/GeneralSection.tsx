import { useState, useId } from "react";
import { projectsApi } from "@/services/projects";
import type { Project } from "@/types";
import { useSaveAction } from "@/hooks/useSaveAction";
import { ServerOffIcon, Trash2Icon } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TagPicker from "./TagPicker";
import { GitRepositoryModal } from "./GitSettings";
import BranchPickerInline from "./GitSettings";
import { SectionTitle, SettingsRow } from "./shared";
import SettingsCard from "./SettingsCard";
import PlatformBadge from "@/components/PlatformBadge";
import type { RepoAnalysis } from "@/components/DeployWizard";
import { resolveFrameworkVersion } from "../utils/frameworkVersion";
import { useProjectDelete } from "../hooks/useProjectDelete";
import { useInfraTeardown } from "../hooks/useInfraTeardown";

interface Props {
  project: Project;
  analysis?: RepoAnalysis | null;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}

export default function GeneralSection({ project, analysis, canManage, onProjectUpdate }: Props) {
  const fid = useId();
  const [name] = useState(project.name);
  const [noteValue, setNoteValue] = useState(project.settings?.notes ?? "");
  const [showGitModal, setShowGitModal] = useState(false);

  const {
    showDeleteModal, confirmName, setConfirmName, deleting,
    handleDelete, openDeleteModal, closeDeleteModal,
  } = useProjectDelete(project.id, project.name);

  const {
    infraState, showTeardownModal, tearingDown,
    handleTeardown, openTeardownModal, closeTeardownModal,
  } = useInfraTeardown(project.id, project.infraState ?? "none");

  const { saving, saved, save: handleSave } = useSaveAction(
    async () => {
      const updated = await projectsApi.update(project.id, { name });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to save project" },
  );

  const { saving: savingNote, save: handleSaveNote } = useSaveAction(
    async () => {
      const updated = await projectsApi.update(project.id, { settings: { notes: noteValue } });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to save note" },
  );

  const frameworkVersion = resolveFrameworkVersion(project, analysis);

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="General"
        description="Configure your project's basic settings."
      />

      {/* Main settings card */}
      <SettingsCard>
        {/* Framework */}
        <SettingsRow label="Framework" description="The framework used by the installed application.">
          {project.platform ? (
            <PlatformBadge slug={project.platform} version={frameworkVersion} />
          ) : (
            <span className="text-xs text-text-muted">Auto-detect</span>
          )}
        </SettingsRow>

        {/* Tags */}
        <SettingsRow label="Tags" description="Tags are used to help you organize and find your projects.">
          <TagPicker projectId={project.id} disabled={!canManage} />
        </SettingsRow>

        {/* Notes */}
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-text mb-1">Notes</p>
          <p className="text-xs text-text-muted mb-2">You may add notes to your project to help you remember important information about it.</p>

          <div className="flex flex-col gap-2">
            <Textarea
              name="notes"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              disabled={!canManage}
              rows={3}
              className="text-xs resize-none"
              placeholder="Write a note…"
            />
            {noteValue !== (project.settings?.notes ?? "") && (
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" size="sm" onClick={() => setNoteValue(project.settings?.notes ?? "")}>
                  Reset
                </Button>
                <Button variant="primary" size="sm" onClick={() => void handleSaveNote()} loading={savingNote}>
                    Save
                  </Button>
                </div>
              )}
            </div>
        </div>
      </SettingsCard>

      {/* Directories card */}
      <SettingsCard padded>
        <div className="mb-4">
          <p className="text-sm font-semibold text-text">Directories</p>
          <p className="text-xs text-text-muted mt-0.5">
            Configure your project's directory settings. If you have queue workers, background processes or scheduled jobs configured, you will need to re-create them after updating.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor={`${fid}-root-directory`}>Root directory</label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-secondary-50/50 px-3 text-xs text-text-muted font-mono text-nowrap">
                /home/dockier/{project.name}/
              </span>
              <Input id={`${fid}-root-directory`}
                type="text"
                defaultValue=""
                disabled={!canManage}
                className="grow rounded-l-none w-20 h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor={`${fid}-web-directory`}>Web directory</label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-secondary-50/50 px-3 text-xs text-text-muted font-mono text-nowrap">
                /home/dockier/{project.name}/
              </span>
              <Input id={`${fid}-web-directory`}
                type="text"
                defaultValue="current/public"
                disabled={!canManage}
                className="grow rounded-l-none w-36 h-9 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Git card */}
      <SettingsCard>
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-text">Git</p>
          <p className="text-xs text-text-muted mt-0.5">Configure your site's Git settings.</p>
        </div>

        <SettingsRow label="Repository" description="Configure the Git repository that should be deployed.">
          <div className="inline-flex items-center rounded-md border border-border bg-background overflow-clip">
            <span className="px-3 py-2 text-xs font-mono text-text">
              {project.repository || "Not connected"}
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowGitModal(true)}
                className="border-l border-border px-2.5 py-2 text-xs font-medium text-text-muted hover:bg-muted hover:text-text transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </SettingsRow>

        <SettingsRow label="Branch" description="Configure the Git branch that should be deployed." border={false}>
          <BranchPickerInline project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        </SettingsRow>
      </SettingsCard>

      {/* Git repository modal */}
      <GitRepositoryModal
        open={showGitModal}
        onClose={() => setShowGitModal(false)}
        project={project}
        onProjectUpdate={onProjectUpdate}
      />

      {/* Warning zone */}
      <div className="rounded-lg border border-warning-500/30 bg-warning-500/5 p-4">
        <p className="text-sm font-semibold text-warning-500 mb-1">Warning</p>
        <p className="text-xs text-text-muted mb-4">These actions are reversible but may cause temporary downtime.</p>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text">Tear down infrastructure</p>
            <p className="text-xs text-text-muted mt-0.5">
              Destroys all cloud resources for this project (servers, containers, load balancers, etc).
              The project and its deployment history are kept — re-deploying recreates the resources.
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline-warning"
              size="sm"
              loading={tearingDown}
              disabled={infraState !== "live"}
              title={infraState !== "live" ? "No provisioned infrastructure to tear down" : undefined}
              iconLeft={<ServerOffIcon className="size-3.5" />}
              onClick={openTeardownModal}
            >
              <span className="text-nowrap">Tear down infrastructure</span>
            </Button>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-4">
        <p className="text-sm font-semibold text-danger-500 mb-1">Danger</p>
        <p className="text-xs text-text-muted mb-4">Destructive actions. Review carefully before proceeding.</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Delete project</p>
            <p className="text-xs text-text-muted mt-0.5">
              Deleting a project will remove all installed application code and untracked files.
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline-danger"
              size="sm"
              iconLeft={<Trash2Icon className="size-3.5" />}
              onClick={openDeleteModal}
            >
              Delete project
            </Button>
          )}
        </div>
      </div>

      {/* Teardown confirmation */}
      <ConfirmModal
        open={showTeardownModal}
        onClose={closeTeardownModal}
        onConfirm={handleTeardown}
        title="Tear down infrastructure"
        message="This destroys all cloud resources for this project. Your project and deployment history are kept, and re-deploying will recreate the infrastructure. Continue?"
        confirmLabel="Tear down"
      />

      {/* Save floating */}
      {canManage && name !== project.name && (
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save changes
          </Button>
          {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
        </div>
      )}

      {/* Delete modal */}
      <Modal open={showDeleteModal} onClose={closeDeleteModal} title="Delete project">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            This action is permanent. All deployments, environment files, domains, and configuration for{" "}
            <span className="font-semibold text-text">{project.name}</span> will be permanently deleted.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor={`${fid}-type-to-confirm`}>
              Type <span className="font-mono text-text">{project.name}</span> to confirm
            </label>
            <Input id={`${fid}-type-to-confirm`}
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={project.name}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={confirmName !== project.name}
              loading={deleting}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
