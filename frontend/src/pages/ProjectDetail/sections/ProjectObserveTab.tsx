import { useState, useEffect, useCallback } from "react";
import { observeApi } from "../../../services/observe";
import type {
  Heartbeat,
  HeartbeatFrequency,
  HeartbeatGracePeriod,
  LogType,
  LogEntry,
  ActivityEntry,
} from "../../../services/observe";
import type { Project } from "../../../types";
import { usePermissions } from "../../../context/PermissionsContext";
import Modal from "../../../components/Modal";
import Spinner from "../../../components/Spinner";
import { btnPrimary, btnOutline, inputCls } from "../../../utils/styles";

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

const EVENT_TYPE_LABELS: Record<string, string> = {
  deploy_started: "Deployment started",
  deploy_completed: "Deployment completed",
  deploy_failed: "Deployment failed",
  command_run: "Command executed",
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
  const [deleting, setDeleting] = useState<string | null>(null);
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

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await observeApi.deleteHeartbeat(project.id, id);
      fetchHeartbeats();
    } catch {
      /* silent */
    } finally {
      setDeleting(null);
    }
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
            <button type="button" className={btnOutline} onClick={() => setShowCreateModal(true)}>
              + Add heartbeat
            </button>
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
                    onClick={() => handleDelete(hb.id)}
                    disabled={deleting === hb.id}
                    className="text-xs text-danger-500 hover:text-danger-400 transition-colors disabled:opacity-50"
                  >
                    {deleting === hb.id ? "…" : "Delete"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {canManage && (
            <div className="px-4 py-3">
              <button type="button" className={btnOutline} onClick={() => setShowCreateModal(true)}>
                + Add heartbeat
              </button>
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

  const selectCls = `${inputCls} appearance-none`;

  return (
    <Modal open onClose={onClose} title="New heartbeat">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
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

        <button type="submit" disabled={submitting || !name.trim()} className={btnPrimary}>
          {submitting ? "Creating…" : "Create heartbeat"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Logs Section ───

function LogsSection({ project, canManage }: { project: Project; canManage: boolean }) {
  const [activeLogType, setActiveLogType] = useState<LogType>("site");
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

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

  const handleClear = async () => {
    setClearing(true);
    try {
      await observeApi.clearLog(project.id, activeLogType);
      await fetchLog(activeLogType);
    } catch {
      /* silent */
    } finally {
      setClearing(false);
    }
  };

  const handleDownload = () => {
    if (!logEntry) return;
    const blob = new Blob([logEntry.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeLogType}-${project.id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header with log type selector and actions */}
      <div className="flex items-center justify-between">
        <select
          value={activeLogType}
          onChange={(e) => setActiveLogType(e.target.value as LogType)}
          className={`${inputCls} w-auto max-w-48`}
        >
          {LOG_TYPES.map((lt) => (
            <option key={lt.value} value={lt.value}>{lt.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="text-xs text-text-muted hover:text-danger-500 transition-colors disabled:opacity-50"
              title="Delete contents"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={!logEntry}
            className="text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
            title="Download"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => fetchLog(activeLogType)}
            className="text-xs text-text-muted hover:text-text transition-colors"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      {/* Log content */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-[#0d1117] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-4" />
          </div>
        ) : (
          <pre className="p-4 text-xs/relaxed font-mono text-[#c9d1d9] whitespace-pre-wrap wrap-break-word">
            {logEntry?.content || "No log data available."}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Activity Section ───

function ActivitySection({ project }: { project: Project }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await observeApi.listActivity(project.id, { limit: 50 });
      setActivity(res.activity);
      setTotal(res.total);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  if (loading) return <TabSpinner label="Loading activity…" />;

  if (activity.length === 0) {
    return (
      <div className="rounded-lg border border-border flex flex-col items-center justify-center py-14 gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="size-12 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
        <p className="text-sm font-medium text-text">No recent events</p>
        <p className="text-xs text-text-muted">Dockier retains 14 days of events.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-auto">
      {activity.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
          <ActivityEventIcon eventType={entry.eventType} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text">{entry.description}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType} · {formatRelativeTime(entry.createdAt)}
            </p>
          </div>
        </div>
      ))}
      {total > activity.length && (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-text-muted">Showing {activity.length} of {total} events</p>
        </div>
      )}
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
      <svg xmlns="http://www.w3.org/2000/svg" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
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
    <div className="flex gap-4 h-full min-h-0">
      {/* Left sidebar */}
      <nav className="flex shrink-0 flex-col gap-1 w-32">
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
      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
        {activeSection === "heartbeats" && <HeartbeatsSection project={project} canManage={canManage} />}
        {activeSection === "logs" && <LogsSection project={project} canManage={canManage} />}
        {activeSection === "activity" && <ActivitySection project={project} />}
      </div>
    </div>
  );
}
