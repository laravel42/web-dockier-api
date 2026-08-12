import { useEffect, useRef, useState } from "react";
import type { Project } from "@/types";
import { typePageDesc, typePageTitle } from "@/utils/styles";
import { usePermissions } from "@/context/PermissionsContext";
import Button from "@/components/ui/Button";
import RocketIcon from "@/components/icons/outlined/RocketIcon";
import ProjectAvatar from "@/components/ProjectAvatar";
import { ShieldCheckIcon, SquarePenIcon } from "lucide-react";

interface Props {
  project: Project;
  siteUrl?: string;
  repoFaviconUrl?: string;
  onDeploy: () => void;
  /** Opens the scan launcher for this project. */
  onScan?: () => void;
  onNameSave: (name: string) => Promise<void>;
  nameSaving?: boolean;
  nameError?: string;
  /** A deploy is running right now. */
  liveDeploy?: boolean;
}

export default function ProjectHeader({
  project,
  siteUrl,
  repoFaviconUrl,
  onDeploy,
  onScan,
  onNameSave,
  nameSaving = false,
  nameError = "",
  liveDeploy = false,
}: Props) {
  const { has, isOwner } = usePermissions();
  const canDeploy = has("deploy:create");
  const canScan = has("scan:run");
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
    <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3 min-w-0">
        <ProjectAvatar project={project} size="lg" siteUrl={siteUrl} repoFaviconUrl={repoFaviconUrl} />
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
                {liveDeploy && (
                  /*
                    Beside the name, not inside the deploy panel: the point is that
                    it is visible from any tab. aria-live announces the transition
                    once; the dot alone would be colour-only.
                  */
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary-500/40 bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-500"
                    aria-live="polite"
                  >
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-500 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-primary-500" />
                    </span>
                    Deploying
                  </span>
                )}
                {canEditName && (
                  <button
                    type="button"
                    onClick={startEditing}
                    disabled={nameSaving}
                    className="p-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text hover:bg-secondary-50 transition-all shrink-0 disabled:opacity-50"
                    aria-label="Edit project name"
                  >
                    <SquarePenIcon className="size-4" />
                  </button>
                )}
              </div>
            )}
            {isTemplate && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-primary-500/30 text-primary-600 text-xs font-medium">
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
      <div className="relative flex shrink-0 items-center gap-2">
        {canScan && onScan && (
          <Button variant="outline" onClick={onScan} iconLeft={<ShieldCheckIcon className="size-4" />}>
            Scan
          </Button>
        )}
        {canDeploy && (
          <Button variant="primary" onClick={onDeploy} iconLeft={<RocketIcon className="size-4" />}>
            Deploy
          </Button>
        )}
      </div>
    </div>
  );
}
