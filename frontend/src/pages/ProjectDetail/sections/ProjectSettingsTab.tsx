import { useState, useEffect, useCallback } from "react";
import { projectsApi } from "../../../services/projects";
import { notificationsApi } from "../../../services/notifications";
import type { Project } from "../../../types";
import { usePermissions } from "../../../context/PermissionsContext";
import Modal from "../../../components/Modal";
import Spinner from "../../../components/Spinner";
import SourceControlSelect from "../../../components/SourceControlSelect";
import RepoSelect from "../../../components/RepoSelect";
import BranchSelect from "../../../components/BranchSelect";
import EnvEditor from "../../../components/EnvEditor";
import TrashIcon from "../../../components/icons/outlined/TrashIcon";
import CheckIcon from "../../../components/icons/outlined/CheckIcon";
import SearchIcon from "../../../components/icons/outlined/SearchIcon";
import ChevronDownIcon from "../../../components/icons/outlined/ChevronDownIcon";
import EyeIcon from "../../../components/icons/outlined/EyeIcon";
import XIcon from "../../../components/icons/outlined/XIcon";
import DotsVerticalIcon from "../../../components/icons/outlined/DotsVerticalIcon";
import { tagsApi, type Tag, type TagWithCount } from "../../../services/tags";
import { envApi } from "../../../services/env";
import { gitApi } from "../../../services/git";
import { getDefaultDeployScript } from "../../../config/frameworks";
import type { Connection, Repo } from "../../../types";
import { btnPrimary, btnOutline, inputCls, textareaCls } from "../../../utils/styles";

interface Props {
  project: Project;
  onProjectUpdate?: (project: Project) => void;
}

type SettingsSection =
  | "general"
  | "deployments"
  | "environment"
  | "composer"
  | "npm"
  | "notifications";

// ─── Helpers ───

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

function SectionTitle({
  title,
  description,
  linkText,
  linkHref,
}: {
  title: string;
  description?: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && (
        <p className="mt-1 text-xs/relaxed text-text-muted">
          {description}
          {linkText && linkHref && (
            <>
              {" "}
              <a href={linkHref} className="text-primary-500 hover:text-primary-400 transition-colors">
                {linkText}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
  border = true,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${border ? "border-b border-border/50" : ""}`}>
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-text">{label}</p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary-500" : "bg-secondary-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function CopyableField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <code className="flex-1 truncate text-xs font-mono text-text-muted">{value}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 text-text-muted hover:text-text transition-colors"
        title="Copy"
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
        )}
      </button>
    </div>
  );
}

const PROJECT_COLORS = [
  "#d9af7f", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];


function TagPicker({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManage, setShowManage] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [orgTags, projectTags] = await Promise.all([
        tagsApi.list(),
        tagsApi.getProjectTags(projectId),
      ]);
      setAllTags(orgTags.tags);
      setSelectedIds(projectTags.tags.map((t) => t.id));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredTags = allTags.filter(
    (tag) => tag.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));

  const toggleTag = async (tagId: string) => {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId];
    setSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch { /* silent */ }
  };

  const removeTag = async (tagId: string) => {
    const next = selectedIds.filter((id) => id !== tagId);
    setSelectedIds(next);
    try {
      await tagsApi.setProjectTags(projectId, next);
    } catch { /* silent */ }
  };

  const handleCreateTag = async () => {
    if (!inputValue.trim()) return;
    try {
      const newTag = await tagsApi.create({ name: inputValue.trim() });
      setAllTags([...allTags, newTag]);
      const next = [...selectedIds, newTag.id];
      setSelectedIds(next);
      await tagsApi.setProjectTags(projectId, next);
      setInputValue("");
    } catch { /* silent */ }
  };

  const handleManageDone = () => {
    setShowManage(false);
    void fetchData();
  };

  if (loading) return <span className="text-xs text-text-muted">Loading…</span>;

  return (
    <div className="relative">
      {/* Input area with selected tags */}
      <div
        onClick={() => !disabled && setOpen(true)}
        className={`flex min-h-[34px] w-52 flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs cursor-text transition-colors ${
          open ? "border-primary-500 ring-1 ring-primary-500/30" : "border-border"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded border border-primary-500/40 bg-primary-500/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-400"
          >
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void removeTag(tag.id); }}
                className="text-primary-400 hover:text-primary-300"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          className="flex-1 min-w-[60px] bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
          placeholder={selectedTags.length === 0 ? "Select tags…" : ""}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setInputValue(""); }} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            <div className="max-h-48 overflow-y-auto py-1">
              {filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => void toggleTag(tag.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-text hover:bg-card/80 transition-colors"
                >
                  <span>{tag.name}</span>
                  {selectedIds.includes(tag.id) && (
                    <CheckIcon className="size-4 text-primary-500" />
                  )}
                </button>
              ))}
              {filteredTags.length === 0 && inputValue && (
                <button
                  type="button"
                  onClick={() => void handleCreateTag()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary-500 hover:bg-card/80 transition-colors"
                >
                  Create &ldquo;{inputValue}&rdquo;
                </button>
              )}
              {filteredTags.length === 0 && !inputValue && (
                <p className="px-3 py-2 text-xs text-text-muted">No tags yet</p>
              )}
            </div>
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => { setOpen(false); setShowManage(true); }}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-400 transition-colors"
              >
                <span className="inline-flex items-center justify-center size-4 rounded border border-primary-500/40 text-[10px]">+</span>
                Manage tags
              </button>
            </div>
          </div>
        </>
      )}

      {/* Manage Tags Modal */}
      <ManageTagsModal open={showManage} onClose={handleManageDone} />
    </div>
  );
}

// ─── Manage Tags Modal ───

function ManageTagsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTagName, setNewTagName] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchTags = useCallback(async () => {
    try {
      const res = await tagsApi.listWithCounts();
      setTags(res.tags);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) { setLoading(true); void fetchTags(); }
  }, [open, fetchTags]);

  const handleAdd = async () => {
    if (!newTagName.trim()) return;
    try {
      await tagsApi.create({ name: newTagName.trim() });
      setNewTagName("");
      void fetchTags();
    } catch { /* silent */ }
  };

  const handleDelete = async (tagId: string) => {
    setDeleting(tagId);
    try {
      await tagsApi.delete(tagId);
      setTags(tags.filter((t) => t.id !== tagId));
    } catch { /* silent */ }
    finally { setDeleting(null); setMenuOpenId(null); }
  };

  const handleStartRename = (tag: TagWithCount) => {
    setRenamingId(tag.id);
    setRenameValue(tag.name);
    setMenuOpenId(null);
  };

  const handleRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    try {
      await tagsApi.update(renamingId, { name: renameValue.trim() });
      setTags(tags.map((t) => t.id === renamingId ? { ...t, name: renameValue.trim() } : t));
    } catch { /* silent */ }
    finally { setRenamingId(null); setRenameValue(""); }
  };

  const filteredTags = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose} title="Manage tags">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-text-muted">Manage tags used across your organization.</p>

        {/* Add tag */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Add tag</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
              className={`${inputCls} flex-1`}
              placeholder=""
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!newTagName.trim()}
              className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-md border border-border bg-background text-text hover:bg-card/60 transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
            >
              Add tag
            </button>
          </div>
        </div>

        {/* Tags list */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Tags</label>
          <div className="rounded-lg border border-border">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
              <SearchIcon className="size-4 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                placeholder="Search"
              />
            </div>

            {/* Tag rows */}
            <div>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="size-4" />
                </div>
              ) : filteredTags.length === 0 ? (
                <p className="px-3 py-4 text-xs text-text-muted text-center">No tags found</p>
              ) : (
                filteredTags.map((tag) => (
                  <div key={tag.id} className="flex items-center justify-between p-3 border-b border-border/50 last:border-b-0">
                    <div className="flex items-baseline gap-2 flex-1 min-w-0">
                      {renamingId === tag.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename();
                              if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                            }}
                            className={`${inputCls} h-7 text-xs flex-1`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void handleRename()}
                            disabled={!renameValue.trim()}
                            className="text-xs text-primary-500 hover:text-primary-400 font-medium transition-colors disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(null); setRenameValue(""); }}
                            className="text-xs text-text-muted hover:text-text font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-text">{tag.name}</span>
                          {tag.projectCount > 0 && (
                            <span className="text-xs text-text-muted">
                              {tag.projectCount} {tag.projectCount === 1 ? "project" : "projects"}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions menu */}
                    {renamingId !== tag.id && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuOpenId(menuOpenId === tag.id ? null : tag.id)}
                          className="flex size-7 items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-secondary-50/50 transition-colors"
                        >
                          <DotsVerticalIcon className="size-4" />
                        </button>
                        {menuOpenId === tag.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                            <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-border bg-card shadow-lg py-1">
                              <button
                                type="button"
                                onClick={() => handleStartRename(tag)}
                                className="flex w-full items-center px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                              >
                                Rename
                              </button>
                              <div className="my-0.5 border-t border-border/50" />
                              <button
                                type="button"
                                onClick={() => void handleDelete(tag.id)}
                                disabled={deleting === tag.id}
                                className="flex w-full items-center px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors disabled:opacity-50"
                              >
                                {deleting === tag.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Done button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 h-10 rounded-md bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-colors"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ─── General Section ───

function GeneralSection({
  project,
  canManage,
  onProjectUpdate,
}: {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [name] = useState(project.name);
  const [selectedColor, setSelectedColor] = useState(project.settings?.color ?? PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showNotes, setShowNotes] = useState(!!project.settings?.notes);
  const [noteValue, setNoteValue] = useState(project.settings?.notes ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await projectsApi.update(project.id, { name });
      onProjectUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleColorChange = async (color: string) => {
    setSelectedColor(color);
    try {
      const updated = await projectsApi.update(project.id, { settings: { color } });
      onProjectUpdate?.(updated);
    } catch { /* silent */ }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const updated = await projectsApi.update(project.id, { settings: { notes: noteValue } });
      onProjectUpdate?.(updated);
    } catch { /* silent */ }
    finally { setSavingNote(false); }
  };

  const handleDelete = async () => {
    if (confirmName !== project.name) return;
    setDeleting(true);
    try {
      await projectsApi.delete(project.id);
      window.location.href = "/projects";
    } catch { /* silent */ }
    finally { setDeleting(false); }
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
          <TagPicker
            projectId={project.id}
            disabled={!canManage}
          />
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
              <button type="button" className={btnOutline + " text-xs h-7"}>
                Upload image
              </button>
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
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="text-xs text-primary-500 hover:text-primary-400 font-medium transition-colors"
              >
                Add note
              </button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-2">You may add notes to your project to help you remember important information about it.</p>

          {(showNotes || !!noteValue) && (
            <div className="flex flex-col gap-2">
              <textarea
                name="notes"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                disabled={!canManage}
                rows={3}
                className={`${textareaCls} text-xs`}
                placeholder="Write a note…"
                autoFocus={showNotes && !noteValue}
              />
              {noteValue !== (project.settings?.notes ?? "") && (
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setNoteValue(project.settings?.notes ?? ""); setShowNotes(false); }}
                    className="text-xs text-text-muted hover:text-text font-medium transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveNote()}
                    disabled={savingNote}
                    className="inline-flex items-center justify-center h-7 px-3 text-xs font-medium rounded-md bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {savingNote ? "Saving…" : "Save"}
                  </button>
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
              <input
                type="text"
                defaultValue="/"
                disabled={!canManage}
                className={`${inputCls} rounded-l-none w-20 h-9 text-xs font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Web directory</label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-border bg-secondary-50/50 px-3 text-xs text-text-muted font-mono text-nowrap">
                /home/dockier/{project.name}
              </span>
              <input
                type="text"
                defaultValue="/current/public"
                disabled={!canManage}
                className={`${inputCls} rounded-l-none w-36 h-9 text-xs font-mono`}
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
        <p className="text-xs text-text-muted mb-4">Destructive actions that cannot be undone.</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">Delete project</p>
            <p className="text-xs text-text-muted mt-0.5">
              Deleting a project will remove all installed application code and untracked files.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-danger-500/40 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20 transition-colors"
            >
              <TrashIcon className="size-3.5" />
              Delete project
            </button>
          )}
        </div>
      </div>

      {/* Save floating */}
      {canManage && name !== project.name && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
        </div>
      )}

      {/* Delete modal */}
      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete project">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            This action is permanent. All deployments, environment files, domains, and configuration for{" "}
            <span className="font-semibold text-text">{project.name}</span> will be permanently deleted.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              Type <span className="font-mono text-text">{project.name}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className={inputCls}
              placeholder={project.name}
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowDeleteModal(false)} className={btnOutline}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={confirmName !== project.name || deleting}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md bg-danger-500 text-white hover:bg-danger-600 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Deployments Section ───

function DeploymentsSection({
  project,
  canManage,
  onProjectUpdate,
}: {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}) {
  const [pushToDeploy, setPushToDeploy] = useState(true);
  const [healthChecks, setHealthChecks] = useState(false);
  const [envInScript, setEnvInScript] = useState(false);
  const [deployScript, setDeployScript] = useState(
    project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other"),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const originalScript = project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other");
  const hasScriptChanges = deployScript !== originalScript;

  const handleSaveScript = async () => {
    setSaving(true);
    try {
      const updated = await projectsApi.update(project.id, { settings: { deployScript } });
      onProjectUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const deployHookUrl = `https://dockier.dev/api/projects/${project.id}/deploy/hook?token=${project.id.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Deployments"
        description="Manage build and deployment settings."
      />

      {/* Push to deploy */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow label="Push to deploy" description="Automatically trigger a new deployment when changes are pushed to the environment's Git branch.">
          <ToggleSwitch checked={pushToDeploy} onChange={setPushToDeploy} disabled={!canManage} />
        </SettingsRow>
      </div>

      {/* Deploy script */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy script</p>
          <p className="text-xs text-text-muted mt-0.5">
            Commands that run inside the container after deployment. These execute after the container starts and is healthy.
          </p>
        </div>

        {/* Code editor area with line numbers */}
        <div className="relative rounded-md border border-border bg-background overflow-hidden">
          <div className="flex">
            {/* Line numbers */}
            <div className="flex flex-col items-end p-2 select-none border-r border-border/50 bg-card/60">
              {deployScript.split("\n").map((_, i) => (
                <span key={i} className="text-[11px]/5 text-text-muted/50 font-mono">
                  {i + 1}
                </span>
              ))}
            </div>
            {/* Editor */}
            <textarea
              value={deployScript}
              onChange={(e) => setDeployScript(e.target.value)}
              disabled={!canManage}
              rows={deployScript.split("\n").length}
              className="flex-1 bg-transparent px-3 py-2 font-mono text-[12px]/5 text-text outline-none resize-none placeholder:text-text-muted"
              spellCheck={false}
            />
          </div>
        </div>

        {/* .env checkbox and save */}
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={envInScript}
              onChange={(e) => setEnvInScript(e.target.checked)}
              disabled={!canManage}
              className="size-3.5 rounded border-border accent-primary-500"
            />
            <span className="text-xs text-text-muted">
              Make <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-[10px] font-mono">.env</code> variables available to deployment script
            </span>
          </label>
          {canManage && hasScriptChanges && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeployScript(originalScript)}
                className="text-xs text-text-muted hover:text-text font-medium transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => void handleSaveScript()}
                disabled={saving}
                className={btnPrimary}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
            </div>
          )}
        </div>
      </div>

      {/* Deploy hook */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy hook</p>
          <p className="text-xs text-text-muted mt-0.5">
            To deploy your app using a CI service, simply configure it to make a GET or POST request to the URL below after code commits or successful tests.
          </p>
        </div>
        <CopyableField value={deployHookUrl} />
      </div>

      {/* Health checks */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow
          label="Health checks"
          description="After deploying, Dockier will ping a URL in your application to ensure it is still available."
          border={false}
        >
          <ToggleSwitch checked={healthChecks} onChange={setHealthChecks} disabled={!canManage} />
        </SettingsRow>
      </div>

      {/* Keys */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Keys</p>
          <p className="text-xs text-text-muted mt-0.5">Your project's public SSH keys.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Site public key</label>
          <p className="text-xs text-text-muted mb-2">
            Typically, this key will automatically be added to GitHub, GitLab. However, if you need to add it to a source control service manually, you may copy it from here.
          </p>
          <CopyableField value={`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... dockier@${project.name}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Environment Section ───

function EnvironmentSection({
  project,
  canManage,
}: {
  project: Project;
  canManage: boolean;
}) {
  const [envContent, setEnvContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [queuesEnabled, setQueuesEnabled] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState("");

  // Fetch masked env on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await envApi.getMasked(project.id);
        setEnvContent(res.content);
        setOriginalContent(res.content);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    void load();
  }, [project.id]);

  const handleReveal = async () => {
    try {
      const res = await envApi.reveal(project.id);
      setEnvContent(res.content);
      setOriginalContent(res.content);
      setRevealed(true);
    } catch { /* silent */ }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await envApi.save(project.id, envContent);
      setOriginalContent(envContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const hasChanges = revealed && envContent !== originalContent;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Environment"
        description="Below you may edit the .env file for your application, which is a standard default environment file typically loaded by applications. If the application is uninstalled, the environment file will also be removed."
      />

      {/* Environment variables */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Environment variables</p>
          <p className="text-xs text-text-muted mt-0.5">Your application's environment variables.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : (
          <div className="relative">
            <div className={!revealed ? "blur-sm select-none pointer-events-none" : ""}>
              <EnvEditor
                value={envContent}
                onChange={revealed ? setEnvContent : () => {}}
                height="280px"
                placeholder="# Add your environment variables here&#10;APP_ENV=production&#10;DB_HOST=127.0.0.1"
              />
            </div>
            {!revealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                <p className="text-sm text-text-muted font-medium">
                  Environment variables should not be shared publicly.
                </p>
                <button type="button" onClick={() => void handleReveal()} className={btnOutline}>
                  <EyeIcon className="size-3.5" />
                  Reveal
                </button>
              </div>
            )}
          </div>
        )}

        {revealed && canManage && hasChanges && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={btnPrimary}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEnvContent(originalContent)}
              className="text-xs text-text-muted hover:text-text font-medium transition-colors"
            >
              Reset
            </button>
            {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
          </div>
        )}
      </div>

      {/* Cache toggle */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow
          label="Cache"
          description="Run cache clearing commands after updating environment variables."
          border={false}
        >
          <ToggleSwitch checked={cacheEnabled} onChange={setCacheEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>

      {/* Queues toggle */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow
          label="Queues"
          description="Restart queue workers (and Horizon, if running) after updating environment variables."
          border={false}
        >
          <ToggleSwitch checked={queuesEnabled} onChange={setQueuesEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>

      {/* Encrypted environment files */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Encrypted environment files</p>
          <p className="text-xs/relaxed text-text-muted mt-0.5">
            If you wish to decrypt an environment file during deployment, you may set the value of the{" "}
            <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-[10px] font-mono text-primary-500">
              APP_ENV_ENCRYPTION_KEY
            </code>{" "}
            environment variable by providing your encryption key below.{" "}
            <a href="#" className="text-primary-500 hover:text-primary-400 transition-colors">Learn more</a>
          </p>
        </div>
        <input
          type="text"
          value={encryptionKey}
          onChange={(e) => setEncryptionKey(e.target.value)}
          disabled={!canManage}
          className={inputCls}
          placeholder="Enter encryption key"
        />
      </div>
    </div>
  );
}

// ─── Composer Section ───

function ComposerSection({ canManage }: { canManage: boolean }) {
  const [credentials, setCredentials] = useState<Array<{ id: string; repository: string; username: string }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRepo, setNewRepo] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleAdd = () => {
    if (!newRepo || !newUsername || !newPassword) return;
    setCredentials([...credentials, { id: crypto.randomUUID(), repository: newRepo, username: newUsername }]);
    setNewRepo("");
    setNewUsername("");
    setNewPassword("");
    setShowPassword(false);
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Composer package authentication"
        description={`Dockier allows you to manage the http-basic portion of your site's auth.json Composer configuration file. The file is loaded on-demand from the server and no credential data is stored by Dockier.`}
        linkText="Learn more"
        linkHref="#"
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-text">No Composer credentials yet</p>
            <p className="text-xs text-text-muted">Get started and add your first Composer credentials.</p>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className={`${btnOutline} mt-3`}
              >
                + Add credential
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text">{cred.repository}</p>
                  <p className="text-xs text-text-muted mt-0.5">{cred.username}</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setCredentials(credentials.filter((c) => c.id !== cred.id))}
                    className="text-xs text-danger-500 hover:text-danger-400 font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className={`${btnOutline} self-start mt-1`}
              >
                + Add credential
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Composer credential modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="New Composer credential">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Repository</label>
              <input
                type="text"
                value={newRepo}
                onChange={(e) => setNewRepo(e.target.value)}
                className={inputCls}
                placeholder="repo.packagist.com"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className={inputCls}
                placeholder=""
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${inputCls} pr-10`}
                  placeholder=""
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                >
                  <EyeIcon className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!newRepo || !newUsername || !newPassword}
            className="w-full h-10 rounded-md bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Add credential
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── npm Section ───

function NpmSection({ canManage }: { canManage: boolean }) {
  const [credentials, setCredentials] = useState<Array<{ id: string; registry: string; scopes?: string }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRegistry, setNewRegistry] = useState("npm.pkg.github.com");
  const [newToken, setNewToken] = useState("");
  const [newScopes, setNewScopes] = useState("");
  const [showToken, setShowToken] = useState(false);

  const handleAdd = () => {
    if (!newRegistry || !newToken) return;
    setCredentials([...credentials, { id: crypto.randomUUID(), registry: newRegistry, scopes: newScopes || undefined }]);
    setNewRegistry("npm.pkg.github.com");
    setNewToken("");
    setNewScopes("");
    setShowToken(false);
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="npm package authentication"
        description={`Dockier allows you to manage the auth tokens in your project's .npmrc configuration file. The file is loaded on-demand from the server and no credential data is stored by Dockier.`}
        linkText="Learn more"
        linkHref="#"
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-text">No npm credentials yet</p>
            <p className="text-xs text-text-muted">Get started and add your first npm credentials.</p>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className={`${btnOutline} mt-3`}
              >
                + Add credential
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text">{cred.registry}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {cred.scopes ? `Scopes: ${cred.scopes}` : "All packages"}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setCredentials(credentials.filter((c) => c.id !== cred.id))}
                    className="text-xs text-danger-500 hover:text-danger-400 font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className={`${btnOutline} self-start mt-1`}
              >
                + Add credential
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add npm credential modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="New npm credential">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Registry</label>
              <input
                type="text"
                value={newRegistry}
                onChange={(e) => setNewRegistry(e.target.value)}
                className={inputCls}
                placeholder="npm.pkg.github.com"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-text-muted">The hostname of your private npm registry.</p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className={`${inputCls} pr-10`}
                  placeholder=""
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                >
                  <EyeIcon className="size-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">
                Scopes{" "}
                <span className="inline-flex items-center rounded border border-border/60 bg-card/40 px-1.5 py-0.5 text-[10px] font-medium text-text-muted ml-1">Optional</span>
              </label>
              <input
                type="text"
                value={newScopes}
                onChange={(e) => setNewScopes(e.target.value)}
                className={inputCls}
                placeholder="@my-org"
              />
              <p className="mt-1.5 text-xs text-text-muted">Packages under these scopes will be installed from this registry.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={!newRegistry || !newToken}
            className="w-full h-10 rounded-md bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Add credential
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Notifications Section ───

function NotificationsSection({ canManage }: { canManage: boolean }) {
  const [loading, setLoading] = useState(true);
  const [deployHook, setDeployHook] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [failureEmail, setFailureEmail] = useState("");

  const fetchChannels = useCallback(async () => {
    try {
      const res = await notificationsApi.listChannels();
      setSlackEnabled(res.channels.some((c) => c.type === "slack" && c.enabled));
      setDiscordEnabled(res.channels.some((c) => c.type === "discord" && c.enabled));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  if (loading) return <TabSpinner label="Loading notifications…" />;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Notifications"
        description="Manage your site's notification settings."
      />

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        {/* Deployment failure emails */}
        <SettingsRow label="Deployment failure emails" description="Dockier can notify you by email whenever your site fails to deploy.">
          <input
            type="email"
            value={failureEmail}
            onChange={(e) => setFailureEmail(e.target.value)}
            disabled={!canManage}
            className={`${inputCls} w-48 h-8 text-xs`}
            placeholder="you@example.com"
          />
        </SettingsRow>

        {/* Deploy hook */}
        <SettingsRow label="Deploy hook" description="A custom URL that we will ping when your site is deployed.">
          <ToggleSwitch checked={deployHook} onChange={setDeployHook} disabled={!canManage} />
        </SettingsRow>

        {/* Slack */}
        <SettingsRow label="Slack deployment notifications" description="Enable and configure Slack deployment notifications.">
          <ToggleSwitch checked={slackEnabled} onChange={setSlackEnabled} disabled={!canManage} />
        </SettingsRow>

        {/* Discord */}
        <SettingsRow label="Discord deployment notifications" description="Enable and configure Discord deployment notifications.">
          <ToggleSwitch checked={discordEnabled} onChange={setDiscordEnabled} disabled={!canManage} />
        </SettingsRow>

        {/* Telegram */}
        <SettingsRow label="Telegram deployment notifications" description="Enable and configure Telegram deployment notifications." border={false}>
          <ToggleSwitch checked={telegramEnabled} onChange={setTelegramEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>
    </div>
  );
}

// ─── Branch Picker Inline ───

function BranchPickerInline({
  project,
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

    // Strip URL prefix if repository is stored as a full URL
    let repoPath = project.repository;
    try {
      const url = new URL(repoPath);
      repoPath = url.pathname.replace(/^\//, "").replace(/\.git$/, "");
    } catch {
      // Not a URL, use as-is (already in owner/repo format)
    }

    const parts = repoPath.split("/");
    if (parts.length < 2) { setLoading(false); return; }
    const repoName = parts.pop()!;
    const owner = parts.join("/");
    try {
      const res = await gitApi.listBranches(project.connectionId, owner, repoName);
      setBranches(res.branches);
    } catch {
      // If fetch fails, at least show the current branch as an option
      if (project.branch) setBranches([project.branch]);
    }
    finally { setLoading(false); }
  }, [project.connectionId, project.repository, project.branch]);

  // Fetch branches immediately on mount
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

function GitRepositoryModal({
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

  // Fetch connections on open
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

  // Fetch repos when connection changes
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
          // Try to match the stored repository to pre-select it
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

        {/* Source control */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-muted">Source control</label>
          <SourceControlSelect
            value={selectedConnectionId}
            onChange={(id) => { setSelectedConnectionId(id); setSelectedRepo(""); }}
            connections={connections}
            loading={loadingConnections}
          />
        </div>

        {/* Repository */}
        {selectedConnectionId && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-muted">Repository</label>
            <RepoSelect
              value={selectedRepo}
              onChange={setSelectedRepo}
              repos={repos}
              loading={loadingRepos}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className={btnOutline}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!selectedRepo || saving}
            className="inline-flex items-center justify-center h-9 px-4 text-sm font-semibold rounded-md bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? "Saving…" : "Set repository"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ───

export default function ProjectSettingsTab({ project, onProjectUpdate }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  if (permissionsLoading) return <TabSpinner label="Loading…" />;

  const sections: { key: SettingsSection; label: string }[] = [
    { key: "general", label: "General" },
    { key: "deployments", label: "Deployments" },
    { key: "environment", label: "Environment" },
    { key: "composer", label: "Composer" },
    { key: "npm", label: "npm" },
    { key: "notifications", label: "Notifications" },
  ];

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left sidebar */}
      <nav className="flex shrink-0 flex-col gap-1 w-36">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={`text-left px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeSection === section.key
                ? "bg-primary-500/10 text-text border-l-2 border-primary-500"
                : "text-text-muted hover:text-text hover:bg-card/60"
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0 min-h-0 overflow-auto pr-1">
        {activeSection === "general" && (
          <GeneralSection project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        )}
        {activeSection === "deployments" && (
          <DeploymentsSection project={project} canManage={canManage} onProjectUpdate={onProjectUpdate} />
        )}
        {activeSection === "environment" && (
          <EnvironmentSection project={project} canManage={canManage} />
        )}
        {activeSection === "composer" && (
          <ComposerSection canManage={canManage} />
        )}
        {activeSection === "npm" && (
          <NpmSection canManage={canManage} />
        )}
        {activeSection === "notifications" && (
          <NotificationsSection canManage={canManage} />
        )}
      </div>
    </div>
  );
}
