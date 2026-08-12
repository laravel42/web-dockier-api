import { useCallback, useEffect, useRef, useState } from "react";
import { commandsApi } from "@/services/commands";
import { deployApi } from "@/services/api";
import type { Command } from "@/types";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { formatCardDateTime } from "@/utils/formatCardDate";
import { statusBadgeColors } from "@/utils/styles";
import Spinner from "@/components/Spinner";
import ConfirmModal from "@/components/ConfirmModal";
import Modal from "@/components/Modal";
import { ArrowRightIcon, CopyIcon, EllipsisVerticalIcon, FileTextIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { destructiveReason } from "../destructiveCommand";
import { useMenuKeyboard } from "@/hooks/useMenuKeyboard";

const PAGE_SIZE = 10;
const POLL_INTERVAL_MS = 3000;

interface Props {
  project: Project;
}

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
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

export default function ProjectCommandsTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const canView = has("project:view");

  const [commands, setCommands] = useState<Command[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [commandInput, setCommandInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [hasDeployment, setHasDeployment] = useState(false);
  const [deployCheckDone, setDeployCheckDone] = useState(false);

  const [outputModal, setOutputModal] = useState<Command | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const closeMenu = useCallback(() => setOpenMenuId(null), []);
  // `menuRef` wraps trigger + menu for outside-click; `menuListRef` is the menu itself.
  const menuRef = useRef<HTMLDivElement>(null);
  const { menuRef: menuListRef, onKeyDown: onMenuKeyDown } = useMenuKeyboard(openMenuId !== null, closeMenu);

  const canRunCommands = hasDeployment && canManage;

  const fetchCommands = useCallback(async (pageNum: number, silent = false) => {
    if (!project.id || !canView) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await commandsApi.list(project.id, {
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      });
      setCommands(res.commands);
      setTotal(res.pagination.total);
    } catch {
      if (!silent) {
        setError("Failed to load commands");
        setCommands([]);
        setTotal(0);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [project.id, canView]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canView) {
      setLoading(false);
      return;
    }
    void fetchCommands(page);
  }, [permissionsLoading, canView, fetchCommands, page]);

  // Check if the project has an active (successful) deployment
  useEffect(() => {
    if (!project.id || !canView) return;
    deployApi.listDeployments({ projectId: project.id, limit: 5 })
      .then((res) => {
        const hasActive = res.deployments.some((d) => d.status === "success");
        setHasDeployment(hasActive);
      })
      .catch(() => setHasDeployment(false))
      .finally(() => setDeployCheckDone(true));
  }, [project.id, canView]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  // Poll for running commands to update their status in real-time.
  // The pageRef ensures the interval always fetches the current page
  // without needing to re-create the interval on page changes.
  const pageRef = useRef(page);
  pageRef.current = page;

  const hasRunning = commands.some((cmd) => cmd.status === "running");

  useEffect(() => {
    if (!hasRunning) return;

    const interval = setInterval(() => {
      void fetchCommands(pageRef.current, true);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasRunning, fetchCommands]);

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
    try {
      await commandsApi.run(project.id, command);
      setCommandInput("");
      setPendingCommand(null);
      setPage(0);
      // Fetch page 0 explicitly to avoid stale closure on `page`
      await fetchCommands(0);
      // Polling will start automatically via the hasRunning effect
    } catch {
      setError("Failed to run command");
      throw new Error("Failed to run command");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunAgain = async (cmd: Command) => {
    setOpenMenuId(null);
    setSubmitting(true);
    try {
      await commandsApi.run(project.id, cmd.command);
      setPage(0);
      await fetchCommands(0);
    } catch {
      setError("Failed to run command");
    } finally {
      setSubmitting(false);
    }
  };

  const [confirmCmd, setConfirmCmd] = useState<Command | null>(null);

  // Errors propagate to ConfirmModal rather than into a banner the closing menu
  // would have hidden.
  const handleDelete = async (cmd: Command) => {
    await commandsApi.delete(project.id, cmd.id);
    await fetchCommands(page);
  };

  const handleCopy = (cmd: Command) => {
    setOpenMenuId(null);
    void navigator.clipboard.writeText(cmd.command);
  };

  if (permissionsLoading) {
    return <TabSpinner label="Loading commands…" />;
  }

  if (!canView) {
    return (
      <p className="text-sm text-text-muted pb-4 text-center">
        You don&apos;t have permission to view commands.
      </p>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scrollbar-hide">
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

      {/* Recent commands section */}
      {loading ? (
        <TabSpinner label="Loading commands…" />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 pb-6 text-center">
          <p className="text-sm text-danger-500">{error}</p>
          <button
            type="button"
            onClick={() => { setError(""); void fetchCommands(page); }}
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
                  <div className="relative" ref={openMenuId === cmd.id ? menuRef : undefined}>
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === cmd.id ? null : cmd.id)}
                      className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card/60 hover:text-text"
                      aria-label={`Actions for command: ${cmd.command.slice(0, 40)}`}
                      aria-expanded={openMenuId === cmd.id}
                      aria-haspopup="menu"
                    >
                      <EllipsisVerticalIcon className="size-4" />
                    </button>
                    {openMenuId === cmd.id && (
                      <div
                        ref={menuListRef}
                        onKeyDown={onMenuKeyDown}
                        role="menu"
                        tabIndex={-1}
                        aria-label="Command actions"
                        className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-(--shadow-overlay)"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOutputModal(cmd); setOpenMenuId(null); }}
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
                              onClick={() => { setOpenMenuId(null); setConfirmCmd(cmd); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger-ink transition-colors hover:bg-danger-surface"
                            >
                              <Trash2Icon className="size-3.5" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
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
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="h-7 rounded-md border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
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
