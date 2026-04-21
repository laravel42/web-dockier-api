import type { Project } from "../types";
import { btnPrimary } from "../constants";
import { usePermissions } from "../../../context/PermissionsContext";
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
}

export default function ProjectHeader({ project, headerMenuOpen, onToggleMenu, onCloseMenu, onDeploy, onPull, onSwitchBranch, onDelete }: Props) {
  const isTemplate = project.sourceType === "template";
  const hasGitActions = !isTemplate && !!project.connectionId;
  const { has } = usePermissions();
  const canDeploy = has("deploy:create");
  const canDelete = has("project:delete");

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
          <FolderIcon className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-text">{project.name}</h1>
            {isTemplate && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 text-xs font-medium">
                Template
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted">Created {new Date(project.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="relative flex items-center gap-4">
        {canDeploy && (
          <button type="button" onClick={onDeploy} className={btnPrimary + " flex items-center gap-1.5"}>
            <RocketIcon className="w-4 h-4" />
            Deploy
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMenu}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary-50 hover:bg-secondary-100 transition-colors text-sm font-medium text-text"
        >
          Actions
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${headerMenuOpen ? "rotate-180" : ""}`} />
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
                    <DownloadIcon className="w-4 h-4 text-text-muted" />
                    Pull from origin
                  </button>
                  <button
                    type="button"
                    onClick={() => { onCloseMenu(); onSwitchBranch(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text hover:bg-secondary-50 transition-colors"
                  >
                    <ShareIcon className="w-4 h-4 text-text-muted" />
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
                    <TrashIcon className="w-4 h-4" />
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
