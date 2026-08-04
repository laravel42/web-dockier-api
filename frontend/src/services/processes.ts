import { request } from "./request";
import { buildQuery } from "./query";
import type {
  BackgroundProcess,
  ScheduledJob,
  ProcessType,
  ProcessStatus,
  JobFrequency,
  JobStatus,
} from "../types";

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

  changeProcessStatus: (projectId: string, processId: string, status: ProcessStatus | "restart") =>
    request<BackgroundProcess>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),

  deleteProcess: (projectId: string, processId: string) =>
    request<{ success: true }>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}`,
      { method: "DELETE" },
    ),

  getProcessLogs: (projectId: string, processId: string, lines = 100) =>
    request<{ logs: string }>(
      `/projects/${encodeURIComponent(projectId)}/processes/${encodeURIComponent(processId)}/logs${buildQuery({ lines })}`,
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
