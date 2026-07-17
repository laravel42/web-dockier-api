import type { BackgroundProcessRow, ScheduledJobRow } from "../schemas.js";

export type ProcessType = "queue_worker" | "custom";
export type ProcessStatus = "running" | "stopped" | "errored";
export type JobFrequency = "every_minute" | "hourly" | "nightly" | "weekly" | "monthly" | "on_reboot" | "custom";
export type JobStatus = "installed" | "paused";

export interface BackgroundProcessResponse {
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

export interface ScheduledJobResponse {
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

export function rowToProcess(row: BackgroundProcessRow): BackgroundProcessResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type as ProcessType,
    command: row.command,
    status: row.status as ProcessStatus,
    runtime: row.runtime,
    runtimeVersion: row.runtime_version,
    connection: row.connection,
    numProcesses: row.num_processes,
    queue: row.queue,
    backoff: row.backoff,
    sleep: row.sleep,
    rest: row.rest,
    timeout: row.timeout,
    tries: row.tries,
    memory: row.memory,
    env: row.env,
    force: row.force,
    workingDirectory: row.working_directory,
    gracefulShutdown: row.graceful_shutdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToJob(row: ScheduledJobRow): ScheduledJobResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    user: row.user,
    frequency: row.frequency as JobFrequency,
    customCron: row.custom_cron,
    monitorHeartbeat: row.monitor_heartbeat,
    heartbeatUrl: row.heartbeat_url,
    status: row.status as JobStatus,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
