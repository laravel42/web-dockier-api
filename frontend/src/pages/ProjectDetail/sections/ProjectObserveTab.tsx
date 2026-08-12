import { useState, useEffect, useCallback } from "react";
import { observeApi } from "@/services/observe";
import type {
  Heartbeat,
  HeartbeatFrequency,
  HeartbeatGracePeriod,
  LogType,
  LogEntry,
  ActivityEntry,
  Project,
} from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { ArchiveXIcon, ClockIcon, DownloadIcon, RefreshCwIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react";

interface Props {
  project: Project;
}

type ObserveSection = "heartbeats" | "logs" | "activity";

// ─── Constants ───

const FREQUENCY_OPTIONS: { value: HeartbeatFrequency; label: string }[] = [
  { value: "every_minute", label: "Every minute" },
  { value: "every_5_minutes", label: "Every 5 minutes" },
  { value: "every_10_minutes", label: "Every 10 minutes" },
  { value: "every_15_minutes", label: "Every 15 minutes" },
  { value: "every_30_minutes", label: "Every 30 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const GRACE_PERIOD_OPTIONS: { value: HeartbeatGracePeriod; label: string }[] = [
  { value: "after_1_minute", label: "After 1 minute" },
  { value: "after_5_minutes", label: "After 5 minutes" },
  { value: "after_10_minutes", label: "After 10 minutes" },
  { value: "after_15_minutes", label: "After 15 minutes" },
  { value: "after_30_minutes", label: "After 30 minutes" },
  { value: "after_1_hour", label: "After 1 hour" },
];

const LOG_TYPES: { value: LogType; label: string }[] = [
  { value: "site", label: "Site Log" },
  { value: "nginx_access", label: "Nginx Access Log" },
  { value: "nginx_error", label: "Nginx Error Log" },
];

// ─── Helpers ───

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

// ─── Heartbeats Section ───

function HeartbeatsSection({ project, canManage }: { project: Project; canManage: boolean }) {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHeartbeats = useCallback(async () => {
    try {
      const res = await observeApi.listHeartbeats(project.id);
      setHeartbeats(res.heartbeats);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchHeartbeats();
  }, [fetchHeartbeats]);

  const [confirmHeartbeat, setConfirmHeartbeat] = useState<Heartbeat | null>(null);

  const handleDelete = async (id: string) => {
    await observeApi.deleteHeartbeat(project.id, id);
    fetchHeartbeats();
  };

  const handleCopyUrl = (heartbeat: Heartbeat) => {
    navigator.clipboard.writeText(heartbeat.pingUrl);
    setCopiedId(heartbeat.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <TabSpinner label="Loading heartbeats…" />;

  return (
    <div className="flex flex-col gap-4">
      {/* Description */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold text-text">Heartbeats</h3>
        <p className="mt-1 text-xs text-text-muted">
          Create heartbeat URLs to ping at the end of your scheduled tasks. If a ping isn't received
          within the expected time, Dockier will notify you.{" "}
        </p>
      </div>

      {/* List or empty state */}
      {heartbeats.length === 0 ? (
        <div className="rounded-lg border border-border flex flex-col items-center justify-center py-10 gap-3">
          <p className="text-sm font-medium text-text">No heartbeats yet</p>
          <p className="text-xs text-text-muted">Get started and create your first heartbeat.</p>
          {canManage && (
            <Button variant="outline" onClick={() => setShowCreateModal(true)}>
              + Add heartbeat
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {heartbeats.map((hb) => (
            <div key={hb.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <HeartbeatStatusDot status={hb.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{hb.name}</p>
                  <p className="text-xs text-text-muted">
                    {FREQUENCY_OPTIONS.find((f) => f.value === hb.frequency)?.label ?? hb.frequency}
                    {hb.lastPingedAt && ` · Last ping ${formatRelativeTime(hb.lastPingedAt)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(hb)}
                  className="text-xs text-primary-500 hover:text-primary-400 transition-colors"
                >
                  {copiedId === hb.id ? "Copied!" : "Copy URL"}
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setConfirmHeartbeat(hb)}

                    className="text-xs text-danger-500 hover:text-danger-400 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {canManage && (
            <div className="px-4 py-3">
              <Button variant="outline" onClick={() => setShowCreateModal(true)}>
                + Add heartbeat
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <CreateHeartbeatModal
          projectId={project.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchHeartbeats();
          }}
        />
      )}

      <ConfirmModal
        open={confirmHeartbeat !== null}
        onClose={() => setConfirmHeartbeat(null)}
        onConfirm={async () => { if (confirmHeartbeat) await handleDelete(confirmHeartbeat.id); }}
        title="Delete heartbeat"
        message={`Delete the ${confirmHeartbeat?.name ?? "this"} heartbeat? Monitoring stops immediately and failures will go unnoticed.`}
        confirmLabel="Delete heartbeat"
      />
    </div>
  );
}

function HeartbeatStatusDot({ status }: { status: Heartbeat["status"] }) {
  const colors: Record<Heartbeat["status"], string> = {
    healthy: "bg-success-500",
    missed: "bg-danger-500",
    waiting: "bg-secondary-400",
  };
  return <span className={`size-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

function CreateHeartbeatModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HeartbeatFrequency>("every_minute");
  const [gracePeriod, setGracePeriod] = useState<HeartbeatGracePeriod>("after_5_minutes");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError("");
    try {
      await observeApi.createHeartbeat(projectId, { name: name.trim(), frequency, gracePeriod });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create heartbeat");
    } finally {
      setSubmitting(false);
    }
  };

  const selectCls = "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-ui transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 appearance-none";

  return (
    <Modal open onClose={onClose} title="New heartbeat">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Name</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Backup job"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text">Frequency</label>
          <p className="mb-1.5 text-xs text-text-muted">How frequently the scheduled task runs.</p>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as HeartbeatFrequency)} className={selectCls}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text">Notify me after</label>
          <p className="mb-1.5 text-xs text-text-muted">
            The amount of time to wait after a scheduled job's expected run time before sending a notification.
          </p>
          <select value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value as HeartbeatGracePeriod)} className={selectCls}>
            {GRACE_PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <Button type="submit" disabled={submitting || !name.trim()} loading={submitting}>
          {submitting ? "Creating…" : "Create heartbeat"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Logs Section ───

function LogsSection({ project, canManage }: { project: Project; canManage: boolean }) {
  const [activeLogType, setActiveLogType] = useState<LogType>("site");
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async (logType: LogType) => {
    setLoading(true);
    try {
      const res = await observeApi.getLog(project.id, logType);
      setLogEntry(res);
    } catch {
      setLogEntry(null);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchLog(activeLogType);
  }, [activeLogType, fetchLog]);

  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = async () => {
    await observeApi.clearLog(project.id, activeLogType);
    await fetchLog(activeLogType);
  };

  const handleDownload = () => {
    if (!logEntry) return;
    const blob = new Blob([logEntry.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeLogType}-${project.id}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header with log type selector and actions */}
      <div className="flex items-center justify-between">
        <select
          value={activeLogType}
          onChange={(e) => setActiveLogType(e.target.value as LogType)}
          className="h-8 w-auto max-w-48 min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-ui transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 appearance-none"
        >
          {LOG_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>{lt.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-xs text-text-muted hover:text-danger-500 transition-colors disabled:opacity-50"
              title="Delete contents"
            >
              <Trash2Icon className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!logEntry}
            className="text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
            title="Download"
          >
            <DownloadIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => fetchLog(activeLogType)}
            className="text-xs text-text-muted hover:text-text transition-colors"
            title="Refresh"
          >
            <RefreshCwIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div className="flex-1 min-h-0 max-h-[60vh] rounded-lg border border-border bg-terminal overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-4" />
          </div>
        ) : (
          <pre className="p-4 text-xs/relaxed font-mono text-strong whitespace-pre-wrap wrap-break-word">
            {logEntry?.content || "No log data available."}
          </pre>
        )}
      </div>

      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClear}
        title="Clear this log"
        message={`Permanently delete the ${activeLogType} log? This is the record you would use to explain a failed deploy, and it cannot be recovered.`}
        confirmLabel="Clear log permanently"
      />
    </div>
  );
}

// ─── Activity Section ───

function ActivitySection({ project }: { project: Project }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);
  const [detailOutput, setDetailOutput] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await observeApi.listActivity(project.id, {
        limit: 50,
        search: debouncedSearch || undefined,
      });
      setActivity(res.activity);
      setTotal(res.pagination.total);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [project.id, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    fetchActivity();
  }, [fetchActivity]);

  const handleEntryClick = async (entry: ActivityEntry) => {
    setSelectedEntry(entry);
    setDetailOutput(null);

    // If this is a command_run event, fetch the command output
    if (entry.eventType === "command_run" && entry.metadata?.commandId) {
      setDetailLoading(true);
      try {
        const { commandsApi } = await import("../../../services/commands");
        const cmd = await commandsApi.get(
          project.id,
          entry.metadata.commandId as string,
        );
        setDetailOutput(cmd.output || "No output available.");
      } catch {
        setDetailOutput("Failed to load command output.");
      } finally {
        setDetailLoading(false);
      }
    }
  };

  if (loading) return <TabSpinner label="Loading activity…" />;

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="pl-9"
        />
      </div>

      {/* Activity list */}
      {activity.length === 0 ? (
        <div className="rounded-lg border border-border flex flex-col items-center justify-center py-14 gap-3">
          <ArchiveXIcon className="size-12 text-text-muted/40" />
          <p className="text-sm font-medium text-text">No recent events</p>
          <p className="text-xs text-text-muted">Dockier retains 14 days of events.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-auto">
          {activity.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => void handleEntryClick(entry)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card/50"
            >
              <ActivityEventIcon eventType={entry.eventType} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{entry.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-text-muted">
                  {formatRelativeTime(entry.createdAt)}
                  {entry.actorName && (
                    <> by <span className="font-medium text-text">{entry.actorName}</span></>
                  )}
                </p>
              </div>
            </button>
          ))}
          {total > activity.length && (
            <div className="px-4 py-3 text-center">
              <p className="text-xs text-text-muted">Showing {activity.length} of {total} events</p>
            </div>
          )}
        </div>
      )}

      {/* Event detail modal */}
      {selectedEntry && (
        <ActivityDetailModal
          entry={selectedEntry}
          output={detailOutput}
          loading={detailLoading}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}

function ActivityDetailModal({
  entry,
  output,
  loading,
  onClose,
}: {
  entry: ActivityEntry;
  output: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const EVENT_DESCRIPTIONS: Record<string, string> = {
    deploy_started: "Deploying pushed code",
    deploy_completed: "Deploying pushed code",
    deploy_failed: "Deploying pushed code",
    command_run: "Running custom command",
    config_changed: "Configuration changed",
    heartbeat_missed: "Heartbeat missed",
    heartbeat_recovered: "Heartbeat recovered",
    log_cleared: "Log cleared",
    project_updated: "Project updated",
    domain_added: "Domain added",
    domain_removed: "Domain removed",
    security_rule_added: "Security rule added",
    security_rule_removed: "Security rule removed",
  };

  const subtitle = EVENT_DESCRIPTIONS[entry.eventType] ?? entry.description;
  const timestamp = new Date(entry.createdAt).toLocaleString();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Event details"
      tabIndex={-1}
    >
      <div
        className="mx-4 flex w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-(--shadow-overlay)"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-text">Event details</h3>
            <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card/60 hover:text-text"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="size-4" />
            </div>
          ) : output ? (
            <pre className="max-h-80 overflow-auto rounded-lg border border-border/50 bg-terminal p-4 font-mono text-xs/relaxed text-strong whitespace-pre-wrap break-all">
              {output}
            </pre>
          ) : entry.metadata && Object.keys(entry.metadata).length > 0 ? (
            <pre className="max-h-80 overflow-auto rounded-lg border border-border/50 bg-terminal p-4 font-mono text-xs/relaxed text-strong whitespace-pre-wrap break-all">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-text-muted text-center py-6">No additional details available for this event.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded border border-border bg-background px-2 py-0.5 font-mono text-xs text-text">
              {timestamp}
            </span>
            <span className="text-xs text-text-muted">
              {formatRelativeTime(entry.createdAt)}
              {entry.actorName && <> by {entry.actorName}</>}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-card"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityEventIcon({ eventType }: { eventType: string }) {
  const isSuccess = eventType.includes("completed") || eventType.includes("recovered") || eventType.includes("added");
  const isDanger = eventType.includes("failed") || eventType.includes("missed") || eventType.includes("removed");

  const color = isSuccess
    ? "text-success-500"
    : isDanger
      ? "text-danger-500"
      : "text-primary-500";

  return (
    <div className={`mt-0.5 shrink-0 ${color}`}>
      <ClockIcon className="size-4" />
    </div>
  );
}

// ─── Main Component ───

export default function ProjectObserveTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const [activeSection, setActiveSection] = useState<ObserveSection>("heartbeats");

  if (permissionsLoading) return <TabSpinner label="Loading…" />;

  const sections: { key: ObserveSection; label: string }[] = [
    { key: "heartbeats", label: "Heartbeats" },
    { key: "logs", label: "Logs" },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Section nav as a topbar */}
      <nav className="-mx-1 flex shrink-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border px-1 pb-2 scrollbar-hide" aria-label="Observe sections">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSection === section.key
                ? "bg-primary/10 text-text"
                : "text-text-muted hover:bg-card/60 hover:text-text"
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
        {activeSection === "heartbeats" && <HeartbeatsSection project={project} canManage={canManage} />}
        {activeSection === "logs" && <LogsSection project={project} canManage={canManage} />}
        {activeSection === "activity" && <ActivitySection project={project} />}
      </div>
    </div>
  );
}
