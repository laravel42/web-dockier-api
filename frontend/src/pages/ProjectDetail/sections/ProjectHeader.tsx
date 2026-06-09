import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../types";
import { btnPrimary, typePageDesc, typePageTitle } from "../../../utils/styles";
import { usePermissions } from "../../../context/PermissionsContext";
import PencilIcon from "../../../components/icons/outlined/PencilIcon";
import FolderIcon from "../../../components/icons/outlined/FolderIcon";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import ChevronDownIcon from "../../../components/icons/outlined/ChevronDownIcon";
import DownloadIcon from "../../../components/icons/outlined/DownloadIcon";
import ShareIcon from "../../../components/icons/outlined/ShareIcon";
import TrashIcon from "../../../components/icons/outlined/TrashIcon";

interface Props {
  project: Project;
  headerMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDeploy: () => void;
  onPull: () => void;
  onSwitchBranch: () => void;
  onDelete: () => void;
  onNameSave: (name: string) => Promise<void>;
  nameSaving?: boolean;
  nameError?: string;
}

export default function ProjectHeader({
  project,
  headerMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onDeploy,
  onPull,
  onSwitchBranch,
  onDelete,
  onNameSave,
  nameSaving = false,
  nameError = "",
}: Props) {
  const isTemplate = project.sourceType === "template";
  const hasGitActions = !isTemplate && !!project.connectionId;
  const { has, isOwner } = usePermissions();
  const canDeploy = has("deploy:create");
  const canDelete = has("project:delete");
  const canEditName = isOwner || has("project:manage");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(project.name);
  }, [project.name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    if (!canEditName || nameSaving) return;
    setDraft(project.name);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(project.name);
    setEditing(false);
  };

  const commitName = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(project.name);
      setEditing(false);
      return;
    }
    if (trimmed === project.name) {
      setEditing(false);
      return;
    }
    try {
      await onNameSave(trimmed);
      setEditing(false);
    } catch {
      /* nameError shown via props */
    }
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="size-12  rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
          <FolderIcon className="size-6 " />
        </div>
        <div>
          <div className="flex items-center gap-2 min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                disabled={nameSaving}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { void commitName(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitName();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditing();
                  }
                }}
                className={`${typePageTitle} min-w-0 max-w-md bg-transparent border-b border-primary-500 outline-none pb-0.5`}
                aria-label="Project name"
              />
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 group">
                <h1 className={`${typePageTitle} truncate`}>{project.name}</h1>
                {canEditName && (
                  <button
                    type="button"
                    onClick={startEditing}
                    disabled={nameSaving}
                    className="p-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-secondary-50 transition-all shrink-0 disabled:opacity-50"
                    aria-label="Edit project name"
                  >
                    <PencilIcon className="size-4" />
                  </button>
                )}
              </div>
            )}
            {isTemplate && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 text-xs font-medium">
                Template
              </span>
            )}
          </div>
          <p className={typePageDesc}>
            Created {new Date(project.createdAt).toLocaleDateString()}
            {nameSaving && <span className="ml-2 text-primary-500">Saving…</span>}
            {nameError && <span className="ml-2 text-danger-500">{nameError}</span>}
          </p>
        </div>
      </div>
      <div className="relative flex items-center gap-4">
        {canDeploy && (
          <button type="button" onClick={onDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
            <RocketIcon className="size-4 " />
            Deploy
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMenu}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary-50 hover:bg-secondary-100 transition-colors text-sm font-medium text-text"
        >
          Actions
          <ChevronDownIcon className={`size-4  transition-transform ${headerMenuOpen ? "rotate-180" : ""}`} />
        </button>
        {headerMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={onCloseMenu} />
            <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-card shadow-lg border border-border py-1">
              {hasGitActions && (
                <>
                  <button
                    type="button"
                    onClick={() => { onCloseMenu(); onPull(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-secondary-50 transition-colors"
                  >
                    <DownloadIcon className="size-4  text-text-muted" />
                    Pull from origin
                  </button>
                  <button
                    type="button"
                    onClick={() => { onCloseMenu(); onSwitchBranch(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-secondary-50 transition-colors"
                  >
                    <ShareIcon className="size-4  text-text-muted" />
                    Switch branch
                  </button>
                </>
              )}
              {canDelete && (
                <>
                  {hasGitActions && <div className="border-t border-border my-1" />}
                  <button
                    type="button"
                    onClick={() => { onCloseMenu(); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-500 hover:bg-danger-500/5 transition-colors"
                  >
                    <TrashIcon className="size-4 " />
                    Delete project
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
