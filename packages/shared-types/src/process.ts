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
