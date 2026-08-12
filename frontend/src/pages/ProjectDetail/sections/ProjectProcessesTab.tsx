import { useState, useEffect, useCallback, useRef } from "react";
import { processesApi } from "@/services/processes";
import { deployApi } from "@/services/api";
import type {
  BackgroundProcess,
  ScheduledJob,
  ProcessType,
  JobFrequency,
  Project,
} from "@/types";
import type { CreateProcessBody, CreateJobBody } from "@/services/processes";
import { usePermissions } from "@/context/PermissionsContext";
import { panelId, tabId, useTabListKeyboard } from "@/hooks/useTabListKeyboard";
import { getFrameworkById } from "@/config/frameworks";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { CircleCheckIcon, CopyIcon, EllipsisVerticalIcon, FileTextIcon, InfoIcon, PauseIcon, PlayIcon, RefreshCwIcon, SquareIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { settingsBadgeCls } from "@/utils/styles";

interface Props {
  project: Project;
}

type SubTab = "processes" | "scheduler";

const ALL_RUNTIME_OPTIONS = [
  { value: "node", label: "Node.js", versions: ["22", "20", "18"], categories: ["JavaScript"] },
  { value: "php", label: "PHP", versions: ["8.4", "8.3", "8.2", "8.1"], categories: ["PHP"] },
  { value: "python", label: "Python", versions: ["3.12", "3.11", "3.10"], categories: ["Python"] },
  { value: "go", label: "Go", versions: ["1.22", "1.21", "1.20"], categories: ["Other"] },
];

/** Maps the project's detected platform to the runtimes available for processes. */
function getRuntimeOptionsForProject(platform?: string): typeof ALL_RUNTIME_OPTIONS {
  if (!platform) return ALL_RUNTIME_OPTIONS;
  const fw = getFrameworkById(platform);
  if (!fw) return ALL_RUNTIME_OPTIONS;
  // Filter runtimes to those matching the framework's category
  const filtered = ALL_RUNTIME_OPTIONS.filter((r) => r.categories.includes(fw.category));
  // If the category is "Static" or nothing matched, allow all
  return filtered.length > 0 ? filtered : ALL_RUNTIME_OPTIONS;
}

/** Returns the default runtime value for a project based on its platform. */
function getDefaultRuntime(platform?: string): string {
  const options = getRuntimeOptionsForProject(platform);
  return options[0]?.value ?? "node";
}

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

function ProcessLogsModal({
  projectId,
  processId,
  processName,
  onClose,
}: {
  projectId: string;
  processId: string;
  processName: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await processesApi.getProcessLogs(projectId, processId, 200);
      setLogs(res.logs);
    } catch {
      setLogs("Failed to retrieve logs.");
    } finally {
      setLoading(false);
    }
  }, [projectId, processId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <Modal open onClose={onClose} title={`Logs — ${processName}`} size="lg">
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={fetchLogs}
          className="text-xs text-text-muted hover:text-text transition-colors"
          title="Refresh"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </div>
      <div className="rounded-lg border border-border bg-terminal overflow-auto max-h-80">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-4" />
          </div>
        ) : (
          <pre className="p-4 text-xs/relaxed font-mono text-strong whitespace-pre-wrap break-all">
            {logs || "No logs available yet."}
          </pre>
        )}
      </div>
    </Modal>
  );
}

function ProcessStatusBadge({ status }: { status: BackgroundProcess["status"] }) {
  const config: Record<BackgroundProcess["status"], { label: string; color: string; dot: string }> = {
    running: { label: "Running", color: settingsBadgeCls.success, dot: "bg-success-500" },
    stopped: { label: "Stopped", color: settingsBadgeCls.muted, dot: "bg-text-muted" },
    errored: {
      label: "Errored",
      color: "inline-flex items-center rounded border border-danger-500/45 bg-danger-500/30 px-2 py-0.5 text-xs font-medium text-danger-300",
      dot: "bg-danger-500",
    },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${c.color}`}>
      <span className={`size-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function JobStatusBadge({ status }: { status: ScheduledJob["status"] }) {
  const config: Record<ScheduledJob["status"], { label: string; color: string; dot: string }> = {
    installed: { label: "Installed", color: settingsBadgeCls.success, dot: "bg-success-500" },
    paused: { label: "Paused", color: settingsBadgeCls.warning, dot: "bg-amber-500" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium ${c.color}`}>
      <span className={`size-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

const FREQUENCY_LABELS: Record<JobFrequency, string> = {
  every_minute: "Every minute",
  hourly: "Hourly",
  nightly: "Nightly",
  weekly: "Weekly",
  monthly: "Monthly",
  on_reboot: "On reboot",
  custom: "Custom frequency",
};

// ─── Process Actions Menu ───

function ProcessActionsMenu({
  process,
  projectId,
  project,
  hasDeployment,
  onRefresh,
}: {
  process: BackgroundProcess;
  projectId: string;
  project: Project;
  hasDeployment: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAction = async (action: string) => {
    setOpen(false);
    if (action === "start") {
      await processesApi.changeProcessStatus(projectId, process.id, "running");
      onRefresh();
    } else if (action === "stop") {
      await processesApi.changeProcessStatus(projectId, process.id, "stopped");
      onRefresh();
    } else if (action === "restart") {
      await processesApi.changeProcessStatus(projectId, process.id, "restart");
      onRefresh();
    } else if (action === "edit") {
      setShowEdit(true);
    } else if (action === "copy") {
      await navigator.clipboard.writeText(process.id);
    } else if (action === "logs") {
      setShowLogs(true);
    } else if (action === "delete") {
      setShowDelete(true);
    }
  };

  const handleDelete = async () => {
    await processesApi.deleteProcess(projectId, process.id);
    onRefresh();
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="size-8 flex items-center justify-center rounded-md border border-border hover:bg-card/60 transition-colors"
          aria-label="Actions"
        >
          <EllipsisVerticalIcon className="size-4 text-text-muted" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-(--shadow-overlay) py-1">
            <button onClick={() => handleAction("logs")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <FileTextIcon className="size-4 text-text-muted" />
              View logs
            </button>
            <button onClick={() => handleAction("restart")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <RefreshCwIcon className="size-4 text-text-muted" />
              Restart
            </button>
            <button onClick={() => handleAction("start")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <PlayIcon className="size-4 text-text-muted" />
              Start
            </button>
            <button onClick={() => handleAction("stop")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <SquareIcon className="size-4 text-text-muted" />
              Stop
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("edit")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2">
              <SquarePenIcon className="size-4 text-text-muted" />
              Edit
            </button>
            <button onClick={() => handleAction("copy")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2">
              <CopyIcon className="size-4 text-text-muted"  />
              Copy ID
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("delete")} className="w-full px-3 py-2 text-left text-sm text-danger-500 hover:bg-danger-500/5 flex items-center gap-2">
              <Trash2Icon className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {showEdit && (
        <CreateProcessModal
          projectId={projectId}
          project={project}
          editProcess={process}
          onClose={() => setShowEdit(false)}
          onCreated={() => { setShowEdit(false); onRefresh(); }}
        />
      )}

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Process"
        message="Are you sure you want to delete this background process? This action cannot be undone."
      />

      {showLogs && (
        <ProcessLogsModal
          projectId={projectId}
          processId={process.id}
          processName={process.name || process.command}
          onClose={() => setShowLogs(false)}
        />
      )}
    </>
  );
}

// ─── Job Actions Menu ───

function JobActionsMenu({
  job,
  projectId,
  hasDeployment,
  onRefresh,
}: {
  job: ScheduledJob;
  projectId: string;
  hasDeployment: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAction = async (action: string) => {
    setOpen(false);
    if (action === "pause") {
      await processesApi.changeJobStatus(projectId, job.id, "paused");
      onRefresh();
    } else if (action === "run") {
      await processesApi.changeJobStatus(projectId, job.id, "installed");
      onRefresh();
    } else if (action === "edit") {
      setShowEdit(true);
    } else if (action === "copy") {
      await navigator.clipboard.writeText(job.id);
    } else if (action === "delete") {
      setShowDelete(true);
    }
  };

  const handleDelete = async () => {
    await processesApi.deleteJob(projectId, job.id);
    onRefresh();
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="size-8 flex items-center justify-center rounded-md border border-border hover:bg-card/60 transition-colors"
          aria-label="Actions"
        >
          <EllipsisVerticalIcon className="size-4 text-text-muted" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-(--shadow-overlay) py-1">
            <button onClick={() => handleAction("pause")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <PauseIcon className="size-4 text-text-muted" />
              Pause
            </button>
            <button onClick={() => handleAction("run")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <PlayIcon className="size-4 text-text-muted" />
              Run
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("edit")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2">
              <SquarePenIcon className="size-4 text-text-muted" />
              Edit
            </button>
            <button onClick={() => handleAction("copy")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-card/60 flex items-center gap-2">
              <CopyIcon className="size-4 text-text-muted" />
              Copy ID
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("delete")} className="w-full px-3 py-2 text-left text-sm text-danger-500 hover:bg-danger-500/5 flex items-center gap-2">
              <Trash2Icon className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {showEdit && (
        <CreateJobModal
          projectId={projectId}
          editJob={job}
          onClose={() => setShowEdit(false)}
          onCreated={() => { setShowEdit(false); onRefresh(); }}
        />
      )}

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Scheduled Job"
        message="Are you sure you want to delete this scheduled job? This action cannot be undone."
      />
    </>
  );
}

// ─── Create/Edit Process Modal ───

function CreateProcessModal({
  projectId,
  project,
  editProcess,
  onClose,
  onCreated,
}: {
  projectId: string;
  project: Project;
  editProcess?: BackgroundProcess;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(editProcess?.name || "");
  const [type, setType] = useState<ProcessType>(editProcess?.type || "queue_worker");
  const [command, setCommand] = useState(editProcess?.command || "");
  const [runtime, setRuntime] = useState(editProcess?.runtime || getDefaultRuntime(project.platform));
  const [runtimeVersion, setRuntimeVersion] = useState(editProcess?.runtimeVersion || "");
  const [connection, setConnection] = useState(editProcess?.connection || "");
  const [numProcesses, setNumProcesses] = useState(editProcess?.numProcesses ?? 1);
  const [queue, setQueue] = useState(editProcess?.queue || "");
  const [backoff, setBackoff] = useState(editProcess?.backoff ?? 0);
  const [sleep, setSleep] = useState(editProcess?.sleep ?? 3);
  const [rest, setRest] = useState(editProcess?.rest ?? 0);
  const [timeout, setTimeout] = useState(editProcess?.timeout ?? 60);
  const [tries, setTries] = useState(editProcess?.tries ?? 1);
  const [memory, setMemory] = useState(editProcess?.memory ?? 128);
  const [env, setEnv] = useState(editProcess?.env || "");
  const [force, setForce] = useState(editProcess?.force ?? false);
  const [workingDirectory, setWorkingDirectory] = useState(editProcess?.workingDirectory || "");
  const [gracefulShutdown, setGracefulShutdown] = useState(editProcess?.gracefulShutdown ?? 15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const RUNTIME_OPTIONS = getRuntimeOptionsForProject(project.platform);

  const currentRuntimeOpts = RUNTIME_OPTIONS.find((r) => r.value === runtime);

  const buildPreviewCommand = () => {
    if (type === "custom") return command;
    if (runtime === "php") {
      const parts = ["php", "artisan", "queue:work"];
      if (connection) parts.push(connection);
      if (queue) parts.push(`--queue=${queue}`);
      if (backoff > 0) parts.push(`--backoff=${backoff}`);
      if (sleep !== 3) parts.push(`--sleep=${sleep}`);
      if (rest > 0) parts.push(`--rest=${rest}`);
      if (timeout !== 60) parts.push(`--timeout=${timeout}`);
      if (tries !== 1) parts.push(`--tries=${tries}`);
      if (memory !== 128) parts.push(`--memory=${memory}`);
      if (env) parts.push(`--env=${env}`);
      if (force) parts.push("--force");
      return parts.join(" ");
    }
    if (runtime === "node") {
      let cmd = `node ${connection || "worker.js"}`;
      if (queue) cmd += ` --queue=${queue}`;
      if (timeout !== 60) cmd += ` --timeout=${timeout}`;
      return cmd;
    }
    if (runtime === "python") {
      let cmd = `python ${connection || "worker.py"}`;
      if (queue) cmd += ` --queue=${queue}`;
      if (timeout !== 60) cmd += ` --timeout=${timeout}`;
      return cmd;
    }
    if (runtime === "go") {
      let cmd = connection || "./worker";
      if (queue) cmd += ` --queue=${queue}`;
      if (timeout !== 60) cmd += ` --timeout=${timeout}`;
      return cmd;
    }
    return command || "worker";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: CreateProcessBody = {
        name: name.trim(),
        type,
        runtime,
        runtimeVersion: runtimeVersion || undefined,
        connection: connection.trim() || undefined,
        numProcesses,
        queue: queue.trim() || undefined,
        backoff,
        sleep,
        rest,
        timeout,
        tries,
        memory,
        env: env.trim() || undefined,
        force,
        workingDirectory: workingDirectory.trim() || undefined,
        gracefulShutdown,
      };
      if (type === "custom") {
        body.command = command.trim();
      }
      if (editProcess) {
        await processesApi.updateProcess(projectId, editProcess.id, body);
      } else {
        await processesApi.createProcess(projectId, body);
      }
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to save process");
    } finally {
      setSaving(false);
    }
  };

  const tabBtnCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
      active ? "border-primary-500 text-text" : "border-transparent text-text-muted hover:text-text"
    }`;

  return (
    <Modal open onClose={onClose} title={editProcess ? "Edit background process" : "New background process"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editProcess && (
          <p className="text-xs text-text-muted -mt-2">
            {type === "queue_worker"
              ? "Create a background process that continuously listens for queued jobs and processes them as they are added."
              : "Create a custom background process that runs continuously. If the command exits, it will be restarted automatically."}
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Name</label>
          <p className="text-xs text-text-muted mb-1.5">Add a custom display name for the background process.</p>
          <Input type="text"  value={name} onChange={(e) => setName(e.target.value)} placeholder="" />
        </div>

        {/* Type tabs */}
        <div className="flex border-b border-border">
          <button type="button" className={tabBtnCls(type === "queue_worker")} onClick={() => setType("queue_worker")}>Queue worker</button>
          <button type="button" className={tabBtnCls(type === "custom")} onClick={() => setType("custom")}>Custom</button>
        </div>

        {type === "queue_worker" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                Runtime
              </label>
              <select  value={runtime} onChange={(e) => { setRuntime(e.target.value); setRuntimeVersion(""); }}>
                {RUNTIME_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {currentRuntimeOpts && currentRuntimeOpts.versions.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                  <InfoIcon className="size-3.5 text-primary-500" />
                  Version
                </label>
                <select  value={runtimeVersion || currentRuntimeOpts.versions[0]} onChange={(e) => setRuntimeVersion(e.target.value)}>
                  {currentRuntimeOpts.versions.map((v) => <option key={v} value={v}>{currentRuntimeOpts.label} {v}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                {runtime === "php" ? "Connection" : "Entry point"}
              </label>
              <Input type="text"  value={connection} onChange={(e) => setConnection(e.target.value)} placeholder={runtime === "php" ? "redis" : runtime === "node" ? "worker.js" : runtime === "python" ? "worker.py" : "./worker"} />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                processes
              </label>
              <Input type="number"  value={numProcesses} onChange={(e) => setNumProcesses(Number(e.target.value))} min={1} />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                --queue
              </label>
              <Input type="text"  value={queue} onChange={(e) => setQueue(e.target.value)} placeholder={runtime === "php" ? "default,emails" : "default"} />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                Timeout
              </label>
              <div className="relative flex-1">
                <Input type="number" className={` pr-16`} value={timeout} onChange={(e) => setTimeout(Number(e.target.value))} min={0} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                Tries
              </label>
              <div className="relative flex-1">
                <Input type="number" className={` pr-12`} value={tries} onChange={(e) => setTries(Number(e.target.value))} min={0} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">tries</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <InfoIcon className="size-3.5 text-primary-500" />
                Memory
              </label>
              <div className="relative flex-1">
                <Input type="number" className={` pr-10`} value={memory} onChange={(e) => setMemory(Number(e.target.value))} min={32} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">MB</span>
              </div>
            </div>
            {/* PHP-specific fields */}
            {runtime === "php" && (
              <>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <InfoIcon className="size-3.5 text-primary-500" />
                    --backoff
                  </label>
                  <div className="relative flex-1">
                    <Input type="number" className={` pr-16`} value={backoff} onChange={(e) => setBackoff(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <InfoIcon className="size-3.5 text-primary-500" />
                    --sleep
                  </label>
                  <div className="relative flex-1">
                    <Input type="number" className={` pr-16`} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <InfoIcon className="size-3.5 text-primary-500" />
                    --rest
                  </label>
                  <div className="relative flex-1">
                    <Input type="number" className={` pr-16`} value={rest} onChange={(e) => setRest(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <InfoIcon className="size-3.5 text-primary-500" />
                    --env
                  </label>
                  <Input type="text"  value={env} onChange={(e) => setEnv(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <InfoIcon className="size-3.5 text-primary-500" />
                    --force
                  </label>
                  <button
                    type="button"
                    onClick={() => setForce(!force)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${force ? "bg-primary-500" : "bg-border"}`}
                  >
                    <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${force ? "translate-x-4.5" : "translate-x-1"}`} />
                  </button>
                </div>
              </>
            )}

            {/* Preview */}
            <div className="mt-4 rounded-lg border border-border p-3">
              <span className="text-xs uppercase tracking-wide font-semibold text-text-muted">Preview</span>
              <p className="mt-1 text-xs font-mono text-primary-500 break-all">{buildPreviewCommand()}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-text">Command</label>
              <p className="text-xs text-text-muted mb-1.5">The command that should run for this background process.</p>
              <Input type="text"  value={command} onChange={(e) => setCommand(e.target.value)} placeholder="node worker.js" />
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-text">Supervisor configuration</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Working directory</span>
                  <Input type="text" className={` w-48! h-7! text-xs`} value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="/home/app" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">Processes</span>
                  <Input type="number" className={` w-48! h-7! text-xs`} value={numProcesses} onChange={(e) => setNumProcesses(Number(e.target.value))} min={1} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">Graceful shutdown</span>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" className={` w-36! h-7! text-xs`} value={gracefulShutdown} onChange={(e) => setGracefulShutdown(Number(e.target.value))} min={0} />
                    <span className="text-primary-500 text-xs">seconds</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={saving} loading={saving}>
          {saving ? "Saving…" : editProcess ? "Update background process" : "Create background process"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Create/Edit Job Modal ───

function CreateJobModal({
  projectId,
  editJob,
  onClose,
  onCreated,
}: {
  projectId: string;
  editJob?: ScheduledJob;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(editJob?.name || "");
  const [command, setCommand] = useState(editJob?.command || "");
  const [user, setUser] = useState(editJob?.user || "root");
  const [frequency, setFrequency] = useState<JobFrequency>(editJob?.frequency || "weekly");
  const [customCron, setCustomCron] = useState(editJob?.customCron || "");
  const [monitorHeartbeat, setMonitorHeartbeat] = useState(editJob?.monitorHeartbeat ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body: CreateJobBody = {
        name: name.trim(),
        command: command.trim(),
        user: user.trim() || "root",
        frequency,
        customCron: frequency === "custom" ? customCron.trim() : undefined,
        monitorHeartbeat,
      };
      if (editJob) {
        await processesApi.updateJob(projectId, editJob.id, body);
      } else {
        await processesApi.createJob(projectId, body);
      }
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to save job");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editJob ? "Edit scheduled job" : "New scheduled job"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!editJob && (
          <p className="text-xs text-text-muted -mt-2">
            Create a new scheduled job for this project. This job will run on the configured schedule.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Name</label>
          <Input type="text"  value={name} onChange={(e) => setName(e.target.value)} placeholder="My scheduled job" required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Command</label>
          <p className="text-xs text-text-muted mb-1.5">Commands should use fully qualified paths.</p>
          <Input type="text"  value={command} onChange={(e) => setCommand(e.target.value)} placeholder="php /home/app/artisan schedule:run" required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">User</label>
          <Input type="text"  value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Frequency</label>
          <select  value={frequency} onChange={(e) => setFrequency(e.target.value as JobFrequency)}>
            <option value="every_minute">Every minute</option>
            <option value="hourly">Hourly</option>
            <option value="nightly">Nightly</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="on_reboot">On reboot</option>
            <option value="custom">Custom frequency</option>
          </select>
        </div>

        {frequency === "custom" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text">Custom Cron Expression</label>
            <Input type="text"  value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="*/5 * * * *" />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-xs font-medium text-text">Monitor with heartbeats</p>
            <p className="text-xs text-text-muted">Generate a URL to ping after the job has run.</p>
          </div>
          <button
            type="button"
            onClick={() => setMonitorHeartbeat(!monitorHeartbeat)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${monitorHeartbeat ? "bg-primary-500" : "bg-border"}`}
          >
            <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${monitorHeartbeat ? "translate-x-4.5" : "translate-x-1"}`} />
          </button>
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={saving || !name.trim() || !command.trim()} loading={saving}>
          {saving ? "Saving…" : editJob ? "Update scheduled job" : "Create scheduled job"}
        </Button>
      </form>
    </Modal>
  );
}

// ─── Main Tab ───

export default function ProjectProcessesTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const canView = has("project:view");

  const [subTab, setSubTab] = useState<SubTab>("processes");
  const subTabKeys: SubTab[] = ["processes", "scheduler"];
  const handleSubTabKeyDown = useTabListKeyboard(subTabKeys, setSubTab);
  const [processes, setProcesses] = useState<BackgroundProcess[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateProcess, setShowCreateProcess] = useState(false);
  const [showCreateJob, setShowCreateJob] = useState(false);
  const [hasDeployment, setHasDeployment] = useState(false);

  // Check if the project has an active deployment
  useEffect(() => {
    if (!project.id || !canView) return;
    deployApi.listDeployments({ projectId: project.id, limit: 5 })
      .then((res) => {
        setHasDeployment(res.deployments.some((d) => d.status === "success"));
      })
      .catch(() => setHasDeployment(false));
  }, [project.id, canView]);

  const fetchData = useCallback(async () => {
    if (!project.id || !canView) return;
    setLoading(true);
    setError("");
    try {
      const [procRes, jobRes] = await Promise.all([
        processesApi.listProcesses(project.id),
        processesApi.listJobs(project.id),
      ]);
      setProcesses(procRes.processes);
      setJobs(jobRes.jobs);
    } catch {
      setError("Failed to load processes");
    } finally {
      setLoading(false);
    }
  }, [project.id, canView]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canView) { setLoading(false); return; }
    void fetchData();
  }, [permissionsLoading, canView, fetchData]);

  if (permissionsLoading || loading) {
    return <TabSpinner label="Loading processes…" />;
  }

  if (!canView) {
    return <p className="text-sm text-text-muted text-center py-8">You don't have permission to view processes.</p>;
  }

  if (error) {
    return <p className="text-sm text-danger-500 text-center py-8">{error}</p>;
  }

  const subTabCls = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-primary/10 text-text" : "text-text-muted hover:bg-card/60 hover:text-text"
    }`;

  return (
    <div className="flex min-h-0 flex-col gap-4 pr-1">
      {/* Sub-tab nav as a topbar */}
      <div
        className="-mx-1 flex shrink-0 items-stretch gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border px-1 pb-2 scrollbar-hide"
        role="tablist"
        aria-label="Process sections"
      >
        <button
          type="button"
          role="tab"
          id={tabId("processes")}
          aria-controls={panelId("processes")}
          aria-selected={subTab === "processes"}
          tabIndex={subTab === "processes" ? 0 : -1}
          className={subTabCls(subTab === "processes")}
          onClick={() => setSubTab("processes")}
          onKeyDown={(e) => handleSubTabKeyDown(e, "processes")}
        >
          Background processes
        </button>
        <button
          type="button"
          role="tab"
          id={tabId("scheduler")}
          aria-controls={panelId("scheduler")}
          aria-selected={subTab === "scheduler"}
          tabIndex={subTab === "scheduler" ? 0 : -1}
          className={subTabCls(subTab === "scheduler")}
          onClick={() => setSubTab("scheduler")}
          onKeyDown={(e) => handleSubTabKeyDown(e, "scheduler")}
        >
          Scheduler
        </button>
      </div>

      {/* Content */}
      <div
        role="tabpanel"
        id={panelId(subTab)}
        aria-labelledby={tabId(subTab)}
        className="flex-1 min-w-0"
      >
        {subTab === "processes" ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-text">Background processes</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Background processes are managed using Supervisor, which monitors your processes and automatically restarts them if they crash or stop unexpectedly. Supports Node.js, PHP, Python, and Go queue workers.
                  </p>
                  {!hasDeployment && (
                    <p className="mt-2 text-xs text-amber-400">
                      Processes won't run until this project has an active deployment. You can pre-configure them now.
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button variant="outline" className="whitespace-nowrap" onClick={() => setShowCreateProcess(true)}>
                    + Add background process
                  </Button>
                )}
              </div>

              {/* Process list */}
              {processes.length > 0 && (
                <div className="mt-4 divide-y divide-border border-t border-border">
                  {processes.map((proc) => (
                    <div key={proc.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{proc.name || proc.command}</p>
                        <p className="text-xs text-text-muted font-mono truncate mt-0.5">{proc.command}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-text-muted">{proc.numProcesses} Process{proc.numProcesses > 1 ? "es" : ""}</span>
                        <ProcessStatusBadge status={proc.status} />
                        {canManage && <ProcessActionsMenu process={proc} projectId={project.id} project={project} hasDeployment={hasDeployment} onRefresh={fetchData} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {processes.length === 0 && (
                <div className="mt-4 pt-4 border-t border-border text-center">
                  <p className="text-xs text-text-muted">No background processes configured yet.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Scheduler header */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-text">Scheduled jobs</h3>
                  <p className="text-xs text-text-muted mt-1">
                    Schedule any recurring tasks that need to run on your site.{" "}
                    <span className="text-primary-500 cursor-pointer hover:underline">Learn more</span>
                  </p>
                  {!hasDeployment && (
                    <p className="mt-2 text-xs text-amber-400">
                      Scheduled jobs won't run until this project has an active deployment. You can pre-configure them now.
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button variant="outline" className="whitespace-nowrap" onClick={() => setShowCreateJob(true)}>
                    + Add scheduled job
                  </Button>
                )}
              </div>

              {/* Jobs list */}
              {jobs.length > 0 && (
                <div className="mt-4 divide-y divide-border border-t border-border">
                  {jobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text truncate">{job.name}</p>
                          {job.monitorHeartbeat && (
                            <CircleCheckIcon className="size-3.5 text-success-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-text-muted font-mono truncate mt-0.5">
                          {job.user} · {job.command}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-text-muted">{FREQUENCY_LABELS[job.frequency]}</span>
                        <JobStatusBadge status={job.status} />
                        {canManage && <JobActionsMenu job={job} projectId={project.id} hasDeployment={hasDeployment} onRefresh={fetchData} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {jobs.length === 0 && (
                <div className="mt-4 pt-4 border-t border-border text-center">
                  <p className="text-xs text-text-muted">No scheduled jobs configured yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateProcess && (
        <CreateProcessModal
          projectId={project.id}
          project={project}
          onClose={() => setShowCreateProcess(false)}
          onCreated={() => { setShowCreateProcess(false); fetchData(); }}
        />
      )}
      {showCreateJob && (
        <CreateJobModal
          projectId={project.id}
          onClose={() => setShowCreateJob(false)}
          onCreated={() => { setShowCreateJob(false); fetchData(); }}
        />
      )}
    </div>
  );
}
