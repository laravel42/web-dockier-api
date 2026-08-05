import { useEffect, useRef, useState } from "react";
import type { Project } from "../../../types";
import { btnPrimary, typePageDesc, typePageTitle } from "../../../utils/styles";
import { usePermissions } from "../../../context/PermissionsContext";
import RocketIcon from "../../../components/icons/outlined/RocketIcon";
import ProjectAvatar from "../../../components/ProjectAvatar";
import { SquarePenIcon } from "lucide-react";

interface Props {
  project: Project;
  onDeploy: () => void;
  onNameSave: (name: string) => Promise<void>;
  nameSaving?: boolean;
  nameError?: string;
}

export default function ProjectHeader({
  project,
  onDeploy,
  onNameSave,
  nameSaving = false,
  nameError = "",
}: Props) {
  const { has, isOwner } = usePermissions();
  const canDeploy = has("deploy:create");
  const canEditName = isOwner || has("project:manage");
  const isTemplate = project.sourceType === "template";

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
    <div className="flex items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-3 min-w-0">
        <ProjectAvatar project={project} size="lg" />
        <div className="min-w-0">
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
                    <SquarePenIcon className="size-4" />
                  </button>
                )}
              </div>
            )}
            {isTemplate && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-500/30 text-primary-600 text-xs font-medium">
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
      <div className="relative flex shrink-0 items-center gap-4">
        {canDeploy && (
          <button type="button" onClick={onDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
            <RocketIcon className="size-4 " />
            Deploy
          </button>
        )}
      </div>
    </div>
  );
}
