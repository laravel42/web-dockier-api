import { useState } from "react";
import { projectsApi } from "@/services/projects";
import type { Project } from "@/types";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { ChevronDownIcon, ServerOffIcon, Trash2Icon } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TagPicker from "./TagPicker";
import { GitRepositoryModal } from "./GitSettings";
import BranchPickerInline from "./GitSettings";
import { SectionTitle, SettingsRow, PROJECT_COLORS } from "./shared";
import { useProjectDelete } from "../hooks/useProjectDelete";
import { useInfraTeardown } from "../hooks/useInfraTeardown";

interface Props {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}

export default function GeneralSection({ project, canManage, onProjectUpdate }: Props) {
  const [name] = useState(project.name);
  const [selectedColor, setSelectedColor] = useState(project.settings?.color ?? PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showNotes, setShowNotes] = useState(!!project.settings?.notes);
  const [noteValue, setNoteValue] = useState(project.settings?.notes ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const toast = useToast();

  const {
    showDeleteModal, confirmName, setConfirmName, deleting,
    handleDelete, openDeleteModal, closeDeleteModal,
  } = useProjectDelete(project.id, project.name);

  const {
    infraState, showTeardownModal, tearingDown,
    handleTeardown, openTeardownModal, closeTeardownModal,
  } = useInfraTeardown(project.id, project.infraState ?? "none");

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await projectsApi.update(project.id, { name });
      onProjectUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save project"));
    } finally { setSaving(false); }
  };

  const handleColorChange = async (color: string) => {
    setSelectedColor(color);
    try {
      const updated = await projectsApi.update(project.id, { settings: { color } });
      onProjectUpdate?.(updated);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update color"));
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const updated = await projectsApi.update(project.id, { settings: { notes: noteValue } });
      onProjectUpdate?.(updated);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save note"));
    } finally { setSavingNote(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Settings"
        description="Configure your project's basic settings."
      />

      {/* Main settings card */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        {/* Framework */}
        <SettingsRow label="Framework" description="The framework used by the installed application.">
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text capitalize">
            {project.platform || "Auto-detect"}
          </span>
        </SettingsRow>

        {/* Tags */}
        <SettingsRow label="Tags" description="Tags are used to help you organize and find your projects.">
          <TagPicker projectId={project.id} disabled={!canManage} />
        </SettingsRow>

        {/* Avatar */}
        <SettingsRow label="Avatar" description="Click on the avatar to upload a custom one.">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 items-center justify-center rounded-md text-sm font-semibold"
              style={{ backgroundColor: `${selectedColor}33`, color: selectedColor }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            {canManage && (
              <Button variant="outline" size="sm">
                Upload image
              </Button>
            )}
          </div>
        </SettingsRow>

        {/* Color */}
        <SettingsRow label="Color" description="Select a color to identify your project in Dockier.">
          <div className="flex items-center gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => void handleColorChange(color)}
                disabled={!canManage}
                className={`size-5 rounded-full transition-all ${
                  selectedColor === color ? "ring-2 ring-offset-1 ring-offset-background ring-primary-500 scale-110" : "hover:scale-110"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </SettingsRow>

        {/* Notes */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-text">Notes</p>
            {canManage && !showNotes && !noteValue && (
              <Button
                variant="link"
                onClick={() => setShowNotes(true)}
              >
                Add note
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">You may add notes to your project to help you remember important information about it.</p>

          {(showNotes || !!noteValue) && (
            <div className="flex flex-col gap-2">
              <Textarea
                name="notes"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                disabled={!canManage}
                rows={3}
                className="text-xs"
                placeholder="Write a note…"
                autoFocus={showNotes && !noteValue}
              />
              {noteValue !== (project.settings?.notes ?? "") && (
                <div className="flex items-center justify-end gap-3">
                  <Button variant="ghost" size="sm" onClick={() => { setNoteValue(project.settings?.notes ?? ""); setShowNotes(false); }}>
                    Reset
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => void handleSaveNote()} loading={savingNote}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Directories card */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-text">Directories</p>
          <p className="text-xs text-text-muted mt-0.5">
            Configure your project's directory settings. If you have queue workers, background processes or scheduled jobs configured, you will need to re-create them after updating.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Root directory</label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-secondary-50/50 px-3 text-xs text-text-muted font-mono text-nowrap">
                /home/dockier/{project.name}
              </span>
              <Input
                type="text"
                defaultValue="/"
                disabled={!canManage}
                className="grow rounded-l-none w-20 h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Web directory</label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-secondary-50/50 px-3 text-xs text-text-muted font-mono text-nowrap">
                /home/dockier/{project.name}
              </span>
              <Input
                type="text"
                defaultValue="/current/public"
                disabled={!canManage}
                className="grow rounded-l-none w-36 h-9 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Git card */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-text">Git</p>
          <p className="text-xs text-text-muted mt-0.5">Configure your site's Git settings.</p>
        </div>

        <SettingsRow label="Repository" description="Configure the Git repository that should be deployed.">
          <button
            type="button"
            onClick={() => canManage && setShowGitModal(true)}
            disabled={!canManage}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-text font-mono max-w-3xs truncate hover:border-primary-500/30 transition-colors disabled:hover:border-border"
          >
            {project.repository || "Select repository…"}
            <ChevronDownIcon className="size-3 text-text-muted shrink-0" />
          </button>
        </SettingsRow>

        <SettingsRow label="Branch" description="Configure the Git branch that should be deployed." border={false}>
          <BranchPickerInline project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        </SettingsRow>
      </div>

      {/* Git repository modal */}
      <GitRepositoryModal
        open={showGitModal}
        onClose={() => setShowGitModal(false)}
        project={project}
        onProjectUpdate={onProjectUpdate}
      />

      {/* Danger zone */}
      <div className="rounded-lg border border-danger-500/30 bg-danger-500/5 p-4">
        <p className="text-sm font-semibold text-danger-500 mb-1">Danger</p>
        <p className="text-xs text-text-muted mb-4">Destructive actions. Review carefully before proceeding.</p>

        <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-danger-500/20">
          <div>
            <p className="text-sm font-medium text-text">Tear down infrastructure</p>
            <p className="text-xs text-text-muted mt-0.5">
              Destroys all cloud resources for this project (servers, containers, load balancers, etc).
              The project and its deployment history are kept — re-deploying recreates the resources.
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline-danger"
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
            <label className="mb-1 block text-xs font-medium text-text-muted">
              Type <span className="font-mono text-text">{project.name}</span> to confirm
            </label>
            <Input
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
