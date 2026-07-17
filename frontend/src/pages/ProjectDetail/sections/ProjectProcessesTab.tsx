import { useState, useEffect, useCallback, useRef } from "react";
import { processesApi } from "../../../services/processes";
import { deployApi } from "../../../services/api";
import type {
  BackgroundProcess,
  ScheduledJob,
  CreateProcessBody,
  CreateJobBody,
  ProcessType,
  JobFrequency,
} from "../../../services/processes";
import type { Project } from "../../../types";
import { usePermissions } from "../../../context/PermissionsContext";
import { getFrameworkById } from "../../../config/frameworks";
import Modal from "../../../components/Modal";
import ConfirmModal from "../../../components/ConfirmModal";
import Spinner from "../../../components/Spinner";
import { btnPrimary, btnOutline, inputCls } from "../../../utils/styles";

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
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
      <div className="rounded-lg border border-border bg-[#0d1117] overflow-auto max-h-80">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-4" />
          </div>
        ) : (
          <pre className="p-4 text-xs/relaxed font-mono text-[#c9d1d9] whitespace-pre-wrap break-all">
            {logs || "No logs available yet."}
          </pre>
        )}
      </div>
    </Modal>
  );
}

function ProcessStatusBadge({ status }: { status: BackgroundProcess["status"] }) {
  const config: Record<BackgroundProcess["status"], { label: string; color: string; dot: string }> = {
    running: { label: "Running", color: "bg-success-500/10 text-success-500", dot: "bg-success-500" },
    stopped: { label: "Stopped", color: "bg-text-muted/10 text-text-muted", dot: "bg-text-muted" },
    errored: { label: "Errored", color: "bg-danger-500/10 text-danger-500", dot: "bg-danger-500" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.color}`}>
      <span className={`size-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function JobStatusBadge({ status }: { status: ScheduledJob["status"] }) {
  const config: Record<ScheduledJob["status"], { label: string; color: string; dot: string }> = {
    installed: { label: "Installed", color: "bg-success-500/10 text-success-500", dot: "bg-success-500" },
    paused: { label: "Paused", color: "bg-amber-500/10 text-amber-500", dot: "bg-amber-500" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.color}`}>
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
          className="size-8 flex items-center justify-center rounded-md border border-border hover:bg-secondary-50 transition-colors"
          aria-label="Actions"
        >
          <svg className="size-4 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-lg py-1">
            <button onClick={() => handleAction("logs")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              View logs
            </button>
            <button onClick={() => handleAction("restart")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
              Restart
            </button>
            <button onClick={() => handleAction("start")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
              Start
            </button>
            <button onClick={() => handleAction("stop")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
              Stop
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("edit")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
              Edit
            </button>
            <button onClick={() => handleAction("copy")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
              Copy ID
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("delete")} className="w-full px-3 py-2 text-left text-sm text-danger-500 hover:bg-danger-500/5 flex items-center gap-2">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
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
          className="size-8 flex items-center justify-center rounded-md border border-border hover:bg-secondary-50 transition-colors"
          aria-label="Actions"
        >
          <svg className="size-4 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-lg py-1">
            <button onClick={() => handleAction("pause")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
              Pause
            </button>
            <button onClick={() => handleAction("run")} disabled={!hasDeployment} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
              Run
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("edit")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" /></svg>
              Edit
            </button>
            <button onClick={() => handleAction("copy")} className="w-full px-3 py-2 text-left text-sm text-text hover:bg-secondary-50 flex items-center gap-2">
              <svg className="size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
              Copy ID
            </button>
            <div className="my-1 border-t border-border" />
            <button onClick={() => handleAction("delete")} className="w-full px-3 py-2 text-left text-sm text-danger-500 hover:bg-danger-500/5 flex items-center gap-2">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
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
          <p className="text-[11px] text-text-muted mb-1.5">Add a custom display name for the background process.</p>
          <input type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="" />
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
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                Runtime
              </label>
              <select className={inputCls} value={runtime} onChange={(e) => { setRuntime(e.target.value); setRuntimeVersion(""); }}>
                {RUNTIME_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {currentRuntimeOpts && currentRuntimeOpts.versions.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                  <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                  Version
                </label>
                <select className={inputCls} value={runtimeVersion || currentRuntimeOpts.versions[0]} onChange={(e) => setRuntimeVersion(e.target.value)}>
                  {currentRuntimeOpts.versions.map((v) => <option key={v} value={v}>{currentRuntimeOpts.label} {v}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                {runtime === "php" ? "Connection" : "Entry point"}
              </label>
              <input type="text" className={inputCls} value={connection} onChange={(e) => setConnection(e.target.value)} placeholder={runtime === "php" ? "redis" : runtime === "node" ? "worker.js" : runtime === "python" ? "worker.py" : "./worker"} />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                processes
              </label>
              <input type="number" className={inputCls} value={numProcesses} onChange={(e) => setNumProcesses(Number(e.target.value))} min={1} />
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                --queue
              </label>
              <input type="text" className={inputCls} value={queue} onChange={(e) => setQueue(e.target.value)} placeholder={runtime === "php" ? "default,emails" : "default"} />
            </div>

            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                Timeout
              </label>
              <div className="relative flex-1">
                <input type="number" className={`${inputCls} pr-16`} value={timeout} onChange={(e) => setTimeout(Number(e.target.value))} min={0} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                Tries
              </label>
              <div className="relative flex-1">
                <input type="number" className={`${inputCls} pr-12`} value={tries} onChange={(e) => setTries(Number(e.target.value))} min={0} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">tries</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                Memory
              </label>
              <div className="relative flex-1">
                <input type="number" className={`${inputCls} pr-10`} value={memory} onChange={(e) => setMemory(Number(e.target.value))} min={32} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">MB</span>
              </div>
            </div>
            {/* PHP-specific fields */}
            {runtime === "php" && (
              <>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                    --backoff
                  </label>
                  <div className="relative flex-1">
                    <input type="number" className={`${inputCls} pr-16`} value={backoff} onChange={(e) => setBackoff(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                    --sleep
                  </label>
                  <div className="relative flex-1">
                    <input type="number" className={`${inputCls} pr-16`} value={sleep} onChange={(e) => setSleep(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                    --rest
                  </label>
                  <div className="relative flex-1">
                    <input type="number" className={`${inputCls} pr-16`} value={rest} onChange={(e) => setRest(Number(e.target.value))} min={0} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">seconds</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                    --env
                  </label>
                  <input type="text" className={inputCls} value={env} onChange={(e) => setEnv(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-28 text-xs text-text-muted flex items-center gap-1.5">
                    <svg className="size-3.5 text-primary-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" /></svg>
                    --force
                  </label>
                  <button
                    type="button"
                    onClick={() => setForce(!force)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${force ? "bg-primary-500" : "bg-secondary-200"}`}
                  >
                    <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${force ? "translate-x-4.5" : "translate-x-1"}`} />
                  </button>
                </div>
              </>
            )}

            {/* Preview */}
            <div className="mt-4 rounded-lg border border-border p-3">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-text-muted">Preview</span>
              <p className="mt-1 text-xs font-mono text-primary-500 break-all">{buildPreviewCommand()}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-text">Command</label>
              <p className="text-[11px] text-text-muted mb-1.5">The command that should run for this background process.</p>
              <input type="text" className={inputCls} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="node worker.js" />
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-text">Supervisor configuration</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Working directory</span>
                  <input type="text" className={`${inputCls} !w-48 !h-7 text-xs`} value={workingDirectory} onChange={(e) => setWorkingDirectory(e.target.value)} placeholder="/home/app" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">Processes</span>
                  <input type="number" className={`${inputCls} !w-48 !h-7 text-xs`} value={numProcesses} onChange={(e) => setNumProcesses(Number(e.target.value))} min={1} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">Graceful shutdown</span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" className={`${inputCls} !w-36 !h-7 text-xs`} value={gracefulShutdown} onChange={(e) => setGracefulShutdown(Number(e.target.value))} min={0} />
                    <span className="text-primary-500 text-xs">seconds</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <button type="submit" className={`${btnPrimary} w-full`} disabled={saving}>
          {saving ? "Saving…" : editProcess ? "Update background process" : "Create background process"}
        </button>
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
          <input type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="My scheduled job" required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Command</label>
          <p className="text-[11px] text-text-muted mb-1.5">Commands should use fully qualified paths.</p>
          <input type="text" className={inputCls} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="php /home/app/artisan schedule:run" required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">User</label>
          <input type="text" className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text">Frequency</label>
          <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as JobFrequency)}>
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
            <input type="text" className={inputCls} value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="*/5 * * * *" />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-xs font-medium text-text">Monitor with heartbeats</p>
            <p className="text-[11px] text-text-muted">Generate a URL to ping after the job has run.</p>
          </div>
          <button
            type="button"
            onClick={() => setMonitorHeartbeat(!monitorHeartbeat)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${monitorHeartbeat ? "bg-primary-500" : "bg-secondary-200"}`}
          >
            <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${monitorHeartbeat ? "translate-x-4.5" : "translate-x-1"}`} />
          </button>
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <button type="submit" className={`${btnPrimary} w-full`} disabled={saving || !name.trim() || !command.trim()}>
          {saving ? "Saving…" : editJob ? "Update scheduled job" : "Create scheduled job"}
        </button>
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
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      active ? "bg-primary-500/10 text-text" : "text-text-muted hover:bg-card/60 hover:text-text"
    }`;

  return (
    <div className="flex gap-6 pr-1">
      {/* Sub-tab sidebar */}
      <div className="flex shrink-0 flex-col gap-1 w-44">
        <button type="button" className={subTabCls(subTab === "processes")} onClick={() => setSubTab("processes")}>
          Background processes
        </button>
        <button type="button" className={subTabCls(subTab === "scheduler")} onClick={() => setSubTab("scheduler")}>
          Scheduler
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
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
                  <button type="button" className={btnOutline + " whitespace-nowrap"} onClick={() => setShowCreateProcess(true)}>
                    + Add background process
                  </button>
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
                  <button type="button" className={btnOutline + " whitespace-nowrap"} onClick={() => setShowCreateJob(true)}>
                    + Add scheduled job
                  </button>
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
                            <svg className="size-3.5 text-success-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                            </svg>
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
