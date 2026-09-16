import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, deleteOrThrow } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import type { BackgroundProcessRow, ScheduledJobRow } from "../schemas.js";
import type { TableUpdate } from "../../../shared/supabase/types.js";
import { rowToProcess, rowToJob, type BackgroundProcessResponse, type ScheduledJobResponse } from "./mappers.js";

export const ProcessesError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("ProcessesError");
export type ProcessesError = InstanceType<typeof ProcessesError>;

const db = supabaseAdmin;

// ─── Background Processes ───

export async function createProcess(params: {
  tenantId: string;
  projectId: string;
  name: string;
  type: string;
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
}): Promise<BackgroundProcessResponse> {
  const { tenantId, projectId, ...rest } = params;

  // Build the command if queue_worker type
  let command = rest.command || "";
  if (rest.type === "queue_worker" && !command) {
    const runtime = rest.runtime || "node";
    if (runtime === "php") {
      const parts = ["php", "artisan", "queue:work"];
      if (rest.connection) parts.push(rest.connection);
      if (rest.queue) parts.push(`--queue=${rest.queue}`);
      if (rest.backoff && rest.backoff > 0) parts.push(`--backoff=${rest.backoff}`);
      if (rest.sleep && rest.sleep !== 3) parts.push(`--sleep=${rest.sleep}`);
      if (rest.rest && rest.rest > 0) parts.push(`--rest=${rest.rest}`);
      if (rest.timeout && rest.timeout !== 60) parts.push(`--timeout=${rest.timeout}`);
      if (rest.tries && rest.tries !== 1) parts.push(`--tries=${rest.tries}`);
      if (rest.memory && rest.memory !== 128) parts.push(`--memory=${rest.memory}`);
      if (rest.env) parts.push(`--env=${rest.env}`);
      if (rest.force) parts.push("--force");
      command = parts.join(" ");
    } else if (runtime === "node") {
      command = rest.connection
        ? `node ${rest.connection}`
        : "node worker.js";
    } else if (runtime === "python") {
      command = rest.connection
        ? `python ${rest.connection}`
        : "python worker.py";
    } else if (runtime === "go") {
      command = rest.connection
        ? `./${rest.connection}`
        : "./worker";
    }
  }

  const { data, error } = await db
    .from("background_processes")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      name: rest.name || "",
      type: rest.type,
      command,
      status: "stopped",
      runtime: rest.runtime || "node",
      runtime_version: rest.runtimeVersion || null,
      connection: rest.connection || null,
      num_processes: rest.numProcesses ?? 1,
      queue: rest.queue || null,
      backoff: rest.backoff ?? 0,
      sleep: rest.sleep ?? 3,
      rest: rest.rest ?? 0,
      timeout: rest.timeout ?? 60,
      tries: rest.tries ?? 1,
      memory: rest.memory ?? 128,
      env: rest.env || null,
      force: rest.force ?? false,
      working_directory: rest.workingDirectory || null,
      graceful_shutdown: rest.gracefulShutdown ?? 15,
    })
    .select()
    .single();

  throwOnError(error, ProcessesError, { internalMsg: "Failed to create process" });
  if (!data) throw new ProcessesError("Failed to create process", "internal");

  return rowToProcess(data as BackgroundProcessRow);
}

export async function listProcesses(params: {
  tenantId: string;
  projectId: string;
}): Promise<BackgroundProcessResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await db
    .from("background_processes")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  throwOnError(error, ProcessesError, { internalMsg: "Failed to list processes" });

  return ((data ?? []) as BackgroundProcessRow[]).map(rowToProcess);
}

export async function updateProcess(params: {
  tenantId: string;
  projectId: string;
  processId: string;
  updates: Record<string, unknown>;
}): Promise<BackgroundProcessResponse> {
  const { tenantId, projectId, processId, updates } = params;

  const u = updates as Partial<{
    name: string; type: string; command: string; runtime: string; runtimeVersion: string | null;
    connection: string | null; numProcesses: number; queue: string | null; backoff: number;
    sleep: number; rest: number; timeout: number; tries: number; memory: number; env: string | null;
    force: boolean; workingDirectory: string | null; gracefulShutdown: number;
  }>;
  const dbUpdates: TableUpdate<"background_processes"> = { updated_at: nowIso() };
  if (u.name !== undefined) dbUpdates.name = u.name;
  if (u.type !== undefined) dbUpdates.type = u.type;
  if (u.command !== undefined) dbUpdates.command = u.command;
  if (u.runtime !== undefined) dbUpdates.runtime = u.runtime;
  if (u.runtimeVersion !== undefined) dbUpdates.runtime_version = u.runtimeVersion;
  if (u.connection !== undefined) dbUpdates.connection = u.connection;
  if (u.numProcesses !== undefined) dbUpdates.num_processes = u.numProcesses;
  if (u.queue !== undefined) dbUpdates.queue = u.queue;
  if (u.backoff !== undefined) dbUpdates.backoff = u.backoff;
  if (u.sleep !== undefined) dbUpdates.sleep = u.sleep;
  if (u.rest !== undefined) dbUpdates.rest = u.rest;
  if (u.timeout !== undefined) dbUpdates.timeout = u.timeout;
  if (u.tries !== undefined) dbUpdates.tries = u.tries;
  if (u.memory !== undefined) dbUpdates.memory = u.memory;
  if (u.env !== undefined) dbUpdates.env = u.env;
  if (u.force !== undefined) dbUpdates.force = u.force;
  if (u.workingDirectory !== undefined) dbUpdates.working_directory = u.workingDirectory;
  if (u.gracefulShutdown !== undefined) dbUpdates.graceful_shutdown = u.gracefulShutdown;

  const { data, error } = await db
    .from("background_processes")
    .update(dbUpdates)
    .eq("id", processId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .select()
    .single();

  throwOnError(error, ProcessesError, { notFoundMsg: "Process not found", internalMsg: "Failed to update process" });
  if (!data) throw new ProcessesError("Process not found", "not_found");

  return rowToProcess(data as BackgroundProcessRow);
}

export async function updateProcessStatus(params: {
  tenantId: string;
  projectId: string;
  processId: string;
  status: string;
}): Promise<BackgroundProcessResponse> {
  const { tenantId, projectId, processId, status } = params;

  const { data, error } = await db
    .from("background_processes")
    .update({ status, updated_at: nowIso() })
    .eq("id", processId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .select()
    .single();

  throwOnError(error, ProcessesError, { notFoundMsg: "Process not found", internalMsg: "Failed to update process status" });
  if (!data) throw new ProcessesError("Process not found", "not_found");

  return rowToProcess(data as BackgroundProcessRow);
}

export async function deleteProcess(params: {
  tenantId: string;
  projectId: string;
  processId: string;
}): Promise<void> {
  const { tenantId, projectId, processId } = params;

  await deleteOrThrow(
    db
      .from("background_processes")
      .delete({ count: "exact" })
      .eq("id", processId)
      .eq("organization_id", tenantId)
      .eq("project_id", projectId),
    ProcessesError,
    { notFoundMsg: "Process not found", internalMsg: "Failed to delete process" },
  );
}

// ─── Scheduled Jobs ───

export async function createJob(params: {
  tenantId: string;
  projectId: string;
  name: string;
  command: string;
  user?: string;
  frequency?: string;
  customCron?: string;
  monitorHeartbeat?: boolean;
}): Promise<ScheduledJobResponse> {
  const { tenantId, projectId, ...rest } = params;

  const { data, error } = await db
    .from("scheduled_jobs")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      name: rest.name,
      command: rest.command,
      user: rest.user || "root",
      frequency: rest.frequency || "weekly",
      custom_cron: rest.customCron || null,
      monitor_heartbeat: rest.monitorHeartbeat ?? false,
      status: "installed",
    })
    .select()
    .single();

  throwOnError(error, ProcessesError, { internalMsg: "Failed to create job" });
  if (!data) throw new ProcessesError("Failed to create job", "internal");

  return rowToJob(data as ScheduledJobRow);
}

export async function listJobs(params: {
  tenantId: string;
  projectId: string;
}): Promise<ScheduledJobResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await db
    .from("scheduled_jobs")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  throwOnError(error, ProcessesError, { internalMsg: "Failed to list jobs" });

  return ((data ?? []) as ScheduledJobRow[]).map(rowToJob);
}

export async function updateJob(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
  updates: Record<string, unknown>;
}): Promise<ScheduledJobResponse> {
  const { tenantId, projectId, jobId, updates } = params;

  const u = updates as Partial<{
    name: string; command: string; user: string; frequency: string;
    customCron: string | null; monitorHeartbeat: boolean;
  }>;
  const dbUpdates: TableUpdate<"scheduled_jobs"> = { updated_at: nowIso() };
  if (u.name !== undefined) dbUpdates.name = u.name;
  if (u.command !== undefined) dbUpdates.command = u.command;
  if (u.user !== undefined) dbUpdates.user = u.user;
  if (u.frequency !== undefined) dbUpdates.frequency = u.frequency;
  if (u.customCron !== undefined) dbUpdates.custom_cron = u.customCron;
  if (u.monitorHeartbeat !== undefined) dbUpdates.monitor_heartbeat = u.monitorHeartbeat;

  const { data, error } = await db
    .from("scheduled_jobs")
    .update(dbUpdates)
    .eq("id", jobId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .select()
    .single();

  throwOnError(error, ProcessesError, { notFoundMsg: "Job not found", internalMsg: "Failed to update job" });
  if (!data) throw new ProcessesError("Job not found", "not_found");

  return rowToJob(data as ScheduledJobRow);
}

export async function updateJobStatus(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
  status: string;
}): Promise<ScheduledJobResponse> {
  const { tenantId, projectId, jobId, status } = params;

  const { data, error } = await db
    .from("scheduled_jobs")
    .update({ status, updated_at: nowIso() })
    .eq("id", jobId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .select()
    .single();

  throwOnError(error, ProcessesError, { notFoundMsg: "Job not found", internalMsg: "Failed to update job status" });
  if (!data) throw new ProcessesError("Job not found", "not_found");

  return rowToJob(data as ScheduledJobRow);
}

export async function deleteJob(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
}): Promise<void> {
  const { tenantId, projectId, jobId } = params;

  await deleteOrThrow(
    db
      .from("scheduled_jobs")
      .delete({ count: "exact" })
      .eq("id", jobId)
      .eq("organization_id", tenantId)
      .eq("project_id", projectId),
    ProcessesError,
    { notFoundMsg: "Job not found", internalMsg: "Failed to delete job" },
  );
}
