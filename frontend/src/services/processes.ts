import { request } from "./request";

// ─── Types ───

export type ProcessType = "queue_worker" | "custom";
export type ProcessStatus = "running" | "stopped" | "errored";
export type JobFrequency = "every_minute" | "hourly" | "nightly" | "weekly" | "monthly" | "on_reboot" | "custom";
export type JobStatus = "installed" | "paused";

export interface BackgroundProcess {
  id: string;
  projectId: string;
  name: string;
  type: ProcessType;
  command: string;
  status: ProcessStatus;
  runtime: string;
  runtimeVersion: string | null;
  connection: string | null;
  numProcesses: number;
  queue: string | null;
  backoff: number;
  sleep: number;
  rest: number;
  timeout: number;
  tries: number;
  memory: number;
  env: string | null;
  force: boolean;
  workingDirectory: string | null;
  gracefulShutdown: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  projectId: string;
  name: string;
  command: string;
  user: string;
  frequency: JobFrequency;
  customCron: string | null;
  monitorHeartbeat: boolean;
  heartbeatUrl: string | null;
  status: JobStatus;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProcessBody {
  name?: string;
  type?: ProcessType;
  command?: string;
  runtime?: string;
  runtimeVersion?: string;
  connection?: string;
  numProcesses?: number;
  queue?: string;
  backoff?: number;
  sleep?: number;
  rest?: number;
  timeout?: number;
  tries?: number;
  memory?: number;
  env?: string;
  force?: boolean;
  workingDirectory?: string;
  gracefulShutdown?: number;
}

export interface CreateJobBody {
  name: string;
  command: string;
  user?: string;
  frequency?: JobFrequency;
  customCron?: string;
  monitorHeartbeat?: boolean;
}

// ─── API ───

export const processesApi = {
  // Background Processes
  listProcesses: (projectId: string) =>
    request<{ processes: BackgroundProcess[] }>(
      `/projects/${encodeURIComponent(projectId)}/processes`,
    ),

  createProcess: (projectId: string, body: CreateProcessBody) =>
    request<BackgroundProcess>(
      `/projects/${encodeURIComponent(projectId)}/processes`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  updateProcess: (projectId: string, processId: string, body: Partial<CreateProcessBody>) =>
    request<BackgroundProcess>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  changeProcessStatus: (projectId: string, processId: string, status: ProcessStatus) =>
    request<BackgroundProcess>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),

  deleteProcess: (projectId: string, processId: string) =>
    request<{ success: true }>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}`,
      { method: "DELETE" },
    ),

  // Scheduled Jobs
  listJobs: (projectId: string) =>
    request<{ jobs: ScheduledJob[] }>(
      `/projects/${encodeURIComponent(projectId)}/scheduled-jobs`,
    ),

  createJob: (projectId: string, body: CreateJobBody) =>
    request<ScheduledJob>(
      `/projects/${encodeURIComponent(projectId)}/scheduled-jobs`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  updateJob: (projectId: string, jobId: string, body: Partial<CreateJobBody>) =>
    request<ScheduledJob>(
      `/projects/${encodeURIComponent(projectId)}/scheduled-jobs/${encodeURIComponent(jobId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  changeJobStatus: (projectId: string, jobId: string, status: JobStatus) =>
    request<ScheduledJob>(
      `/projects/${encodeURIComponent(projectId)}/scheduled-jobs/${encodeURIComponent(jobId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),

  deleteJob: (projectId: string, jobId: string) =>
    request<{ success: true }>(
      `/projects/${encodeURIComponent(projectId)}/scheduled-jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE" },
    ),
};
