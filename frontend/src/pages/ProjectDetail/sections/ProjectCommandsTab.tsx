import { useCallback, useEffect, useRef, useState } from "react";
import { commandsApi } from "@/services/commands";
import { deployApi } from "@/services/api";
import type { Command } from "@/types";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { usePaginatedData } from "@/hooks/usePaginatedData";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { statusBadgeColors } from "@/utils/styles";
import Spinner from "@/components/Spinner";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import { ArrowRightIcon, CopyIcon, EllipsisVerticalIcon, FileTextIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { destructiveReason } from "../destructiveCommand";
import { TabPanelHeader } from "@/components/TabPanelHeader";
import { useMenuKeyboard } from "@/hooks/useMenuKeyboard";
import DropdownPortal from "@/components/DropdownPortal";
import TabSpinner from "@/components/ui/TabSpinner";

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 3000;

// Fixed width of the portaled actions menu (matches the legacy `w-40` = 10rem).
const MENU_WIDTH = 160;
// Rough height used only to decide whether to flip the menu above the trigger.
const MENU_EST_HEIGHT = 180;
// Keep the menu this far from the viewport edges when clamping/flipping.
const VIEWPORT_MARGIN = 8;

interface Props {
  project: Project;
}


function StatusBadge({ status }: { status: Command["status"] }) {
  const labels: Record<Command["status"], string> = {
    running: "Running",
    finished: "Finished",
    failed: "Failed",
    timed_out: "Timed Out",
  };

  const colorMap: Record<Command["status"], string> = {
    running: statusBadgeColors.running || "bg-primary-500/10 text-primary-500",
    finished: statusBadgeColors.success || "bg-success-500/10 text-success-500",
    failed: statusBadgeColors.failed || "bg-danger-500/10 text-danger-500",
    timed_out: "bg-warning-surface text-warning-ink",
  };

  const dotColorMap: Record<Command["status"], string> = {
    running: "animate-pulse bg-primary-500",
    finished: "bg-success-500",
    failed: "bg-danger-500",
    timed_out: "bg-warning-ink",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${colorMap[status]}`}>
      <span className={`size-2 rounded-full ${dotColorMap[status]}`} />
      {labels[status]}
    </span>
  );
}

/**
 * Permission gate. The panel below fetches on mount, so it must not mount until
 * permissions have resolved and allow it — that keeps `usePaginatedData` on its
 * default always-enabled path instead of needing a deferred-fetch flag.
 */
export default function ProjectCommandsTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();

  if (permissionsLoading) {
    return <TabSpinner label="Loading commands…" />;
  }

  if (!has("project:view")) {
    return (
      <p className="text-sm text-text-muted pb-4 text-center">
        You don&apos;t have permission to view commands.
      </p>
    );
  }

  // Keyed on the project: react-router reuses this component across projects,
  // and the paginated fetcher's deps are its page/search, not the project id.
  return <CommandsPanel key={project.id} project={project} canManage={has("project:manage")} />;
}

function CommandsPanel({ project, canManage }: { project: Project; canManage: boolean }) {
  // Pagination, loading, error and stale-response discarding all live in the
  // shared hook — two fast page changes can no longer paint the first response.
  const { items: commands, loading, error, pagination, goToPage, reload } = usePaginatedData<Command>(
    ({ limit, offset }) =>
      commandsApi.list(project.id, { limit, offset })
        .then((res) => ({ items: res.commands, pagination: res.pagination })),
    { pageSize: PAGE_SIZE },
  );

  // Failures of a user-triggered run, which the list-load error cannot carry.
  const [actionError, setActionError] = useState("");

  const [commandInput, setCommandInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [hasDeployment, setHasDeployment] = useState(false);
  const [deployCheckDone, setDeployCheckDone] = useState(false);

  const [outputModal, setOutputModal] = useState<Command | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // The actions menu renders in a body portal (fixed position) so a parent's
  // `overflow` cannot clip it. We track the open trigger element and compute a
  // right-aligned, flip-up position for it.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Right-align the narrow menu to the trigger, clamped into the viewport.
    const left = Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH);
    // Flip above when there isn't room below the trigger before the viewport bottom.
    const flipUp = rect.bottom + MENU_EST_HEIGHT > window.innerHeight - VIEWPORT_MARGIN;
    const top = flipUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4;
    setMenuPos({ top, left, width: MENU_WIDTH });
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuPos(null);
  }, []);

  // `menuListRef` is the portaled menu container (also used for keyboard nav).
  const { menuRef: menuListRef, onKeyDown: onMenuKeyDown } = useMenuKeyboard(openMenuId !== null, closeMenu);

  const toggleMenu = useCallback((cmdId: string, el: HTMLButtonElement) => {
    if (openMenuId === cmdId) {
      closeMenu();
      return;
    }
    triggerRef.current = el;
    updateMenuPos();
    setOpenMenuId(cmdId);
  }, [openMenuId, closeMenu, updateMenuPos]);

  // Recalculate the portaled menu position on scroll/resize so it tracks the
  // trigger (the capturing scroll listener catches scrollable ancestors too).
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => updateMenuPos();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [openMenuId, updateMenuPos]);

  const canRunCommands = hasDeployment && canManage;

  // Check if the project has an active (successful) deployment
  useEffect(() => {
    deployApi.listDeployments({ projectId: project.id, limit: 5 })
      .then((res) => {
        const hasActive = res.deployments.some((d) => d.status === "success");
        setHasDeployment(hasActive);
      })
      .catch(() => setHasDeployment(false))
      .finally(() => setDeployCheckDone(true));
  }, [project.id]);

  // Close dropdown when clicking outside. The menu lives in a body portal, so
  // we must ignore clicks on BOTH the trigger button and the portaled menu.
  useEffect(() => {
    if (!openMenuId) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuListRef.current?.contains(target)) return;
      closeMenu();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId, closeMenu, menuListRef]);

  // Poll for running commands to update their status in real-time. `reload` is
  // rebuilt when the page changes, so the interval always hits the shown page.
  const hasRunning = commands.some((cmd) => cmd.status === "running");

  useEffect(() => {
    if (!hasRunning) return;

    const interval = setInterval(() => { void reload(); }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasRunning, reload]);

  /** Back to the newest page after a run, refetching even if already there. */
  const showNewestCommands = async () => {
    goToPage(1);
    await reload();
  };

  /**
   * Enter no longer executes. Arbitrary shell against production gets one
   * deliberate second step that echoes exactly what will run, and where.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || submitting || !canRunCommands) return;
    setPendingCommand(commandInput.trim());
  };

  const runPendingCommand = async () => {
    const command = pendingCommand;
    if (!command) return;
    setSubmitting(true);
    setActionError("");
    try {
      await commandsApi.run(project.id, command);
      setCommandInput("");
      setPendingCommand(null);
      await showNewestCommands();
      // Polling will start automatically via the hasRunning effect
    } catch {
      setActionError("Failed to run command");
      throw new Error("Failed to run command");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunAgain = async (cmd: Command) => {
    closeMenu();
    setSubmitting(true);
    setActionError("");
    try {
      await commandsApi.run(project.id, cmd.command);
      await showNewestCommands();
    } catch {
      setActionError("Failed to run command");
    } finally {
      setSubmitting(false);
    }
  };

  const [confirmCmd, setConfirmCmd] = useState<Command | null>(null);

  // Errors propagate to ConfirmModal rather than into a banner the closing menu
  // would have hidden.
  const handleDelete = async (cmd: Command) => {
    await commandsApi.delete(project.id, cmd.id);
    await reload();
  };

  const handleCopy = (cmd: Command) => {
    closeMenu();
    void navigator.clipboard.writeText(cmd.command);
  };

  // A reload also runs on the 3s poll, so the spinner and the load-error view
  // are only allowed to replace the list while there is no list to show.
  const showSpinner = loading && commands.length === 0;
  const showLoadError = !loading && error !== null && commands.length === 0;

  const currentPage = Math.floor(pagination.offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(pagination.total / PAGE_SIZE);
  const rangeStart = pagination.offset + 1;
  const rangeEnd = Math.min(pagination.offset + PAGE_SIZE, pagination.total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto scrollbar-hide">
      <TabPanelHeader
        title="Commands"
        description="Run arbitrary commands on your deployed server from the project root directory."
      />
      {/* Run new command section */}
      <div className="rounded-lg border border-border/50 bg-card/30 p-4">
        <h3 className="text-sm font-semibold text-text">Run new command</h3>
        <p className="mt-1 text-xs/relaxed text-text-muted ">
          Easily execute arbitrary commands on your server. All commands are executed from within
          the site&apos;s root directory. Commands will be executed as the <code className="rounded border border-border/60 bg-card/60 px-1 py-0.5 text-xs font-mono">dockier</code> user
          and may run for two minutes before timing out.
        </p>
        {deployCheckDone && !hasDeployment && (
          <p className="mt-2 text-xs text-warning-ink">
            Deploy your project first to enable command execution.
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder={hasDeployment ? "Enter command…" : "Deploy project to run commands…"}
            disabled={!canRunCommands || submitting}
            aria-label="Command to execute"
            className="h-9 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm text-text outline-none placeholder:text-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!commandInput.trim() || submitting || !canRunCommands}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? <Spinner className="size-3.5" /> : (
              <ArrowRightIcon className="size-3.5" />
            )}
            Run
          </button>
        </form>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-danger-500 text-center">{actionError}</p>
      )}

      {/* Recent commands section */}
      {showSpinner ? (
        <TabSpinner label="Loading commands…" />
      ) : showLoadError ? (
        <div className="flex flex-col items-center gap-3 pb-6 text-center">
          <p className="text-sm text-danger-500">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs font-medium text-primary hover:text-primary/80"
          >
            Retry
          </button>
        </div>
      ) : commands.length === 0 ? (
        <p className="text-sm text-text-muted pb-4 text-center">
          No commands have been run yet for this project.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-border/50 bg-card/30 p-4">
            <h3 className="mb-3 text-sm font-semibold text-text">Recent commands</h3>
            <div className="space-y-2">
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 transition-colors hover:border-border hover:bg-card/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-text" title={cmd.command}>
                      {cmd.command}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {formatCardDateTime(cmd.startedAt)}
                    </p>
                  </div>
                  <StatusBadge status={cmd.status} />
                  {/* Actions menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => toggleMenu(cmd.id, e.currentTarget)}
                      className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card/60 hover:text-text"
                      aria-label={`Actions for command: ${cmd.command.slice(0, 40)}`}
                      aria-expanded={openMenuId === cmd.id}
                      aria-haspopup="menu"
                    >
                      <EllipsisVerticalIcon className="size-4" />
                    </button>
                    {openMenuId === cmd.id && (
                      <DropdownPortal
                        open
                        pos={menuPos}
                        dropdownRef={menuListRef}
                        className="rounded-lg border border-border bg-card py-1 shadow-(--shadow-overlay)"
                      >
                        <div
                          onKeyDown={onMenuKeyDown}
                          role="menu"
                          tabIndex={-1}
                          aria-label="Command actions"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setOutputModal(cmd); closeMenu(); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text transition-colors hover:bg-card/60"
                          >
                            <FileTextIcon className="size-3.5" />
                            View output
                          </button>
                          {canManage && hasDeployment && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleRunAgain(cmd)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text transition-colors hover:bg-card/60"
                            >
                              <RefreshCwIcon className="size-3.5" />
                              Run again
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => handleCopy(cmd)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text transition-colors hover:bg-card/60"
                          >
                            <CopyIcon className="size-3.5" />
                            Copy command
                          </button>
                          {canManage && (
                            <>
                              <div className="my-1 border-t border-border/50" />
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { closeMenu(); setConfirmCmd(cmd); }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger-ink transition-colors hover:bg-danger-surface"
                              >
                                <Trash2Icon className="size-3.5" />
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </DropdownPortal>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/40 pt-3">
              <span className="text-xs text-text-muted">
                {rangeStart}–{rangeEnd} of {pagination.total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => goToPage(currentPage + 1)}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Output modal */}
      {outputModal && (
        <Modal open onClose={() => setOutputModal(null)} title="Command output">
          <p className="mb-2 font-mono text-xs text-text-muted break-all">{outputModal.command}</p>
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge status={outputModal.status} />
            <span className="text-xs text-text-muted">{formatCardDateTime(outputModal.startedAt)}</span>
          </div>
          <pre
            tabIndex={0}
            role="region"
            aria-label="Command output"
            className="max-h-64 overflow-auto rounded-lg border border-border/50 bg-background p-3 font-mono text-xs/relaxed text-text scrollbar-hide whitespace-pre-wrap break-all"
          >
            {outputModal.output || "No output available."}
          </pre>
        </Modal>
      )}

      <ConfirmModal
        open={pendingCommand !== null}
        onClose={() => setPendingCommand(null)}
        onConfirm={runPendingCommand}
        title={destructiveReason(pendingCommand ?? "") ? "Run a destructive command?" : "Run this command?"}
        confirmLabel={destructiveReason(pendingCommand ?? "") ? "Run it anyway" : "Run command"}
        destructive={Boolean(destructiveReason(pendingCommand ?? ""))}
        message={
          <>
            {destructiveReason(pendingCommand ?? "") && (
              <span className="mb-3 block rounded-md border border-danger-line bg-danger-surface px-3 py-2 text-danger-ink">
                This command {destructiveReason(pendingCommand ?? "")}. It runs against production and
                cannot be undone from here.
              </span>
            )}
            <span className="mb-3 block font-mono text-xs break-all rounded-md border border-border bg-terminal px-3 py-2 text-strong">
              {pendingCommand}
            </span>
            {/* Restated here, not only in the paragraph above the field. */}
            <span className="block text-xs text-text-muted">
              Runs on <span className="font-medium text-text">{project.name}</span> as the{" "}
              <span className="font-mono">dockier</span> user, from the site root, timing out after
              two minutes.
            </span>
          </>
        }
      />

      <ConfirmModal
        open={confirmCmd !== null}
        onClose={() => setConfirmCmd(null)}
        onConfirm={async () => { if (confirmCmd) await handleDelete(confirmCmd); }}
        title="Delete command record"
        message={`Delete the record of \`${confirmCmd?.command ?? ""}\`? The audit history for that run is lost. The command itself is not re-run or undone.`}
        confirmLabel="Delete record"
      />
    </div>
  );
}
