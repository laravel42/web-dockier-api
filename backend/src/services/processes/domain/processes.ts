import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError } from "../../../shared/supabase/query.js";
import { assertProjectAccess } from "../../../shared/supabase/project-access.js";
import type { BackgroundProcessRow, ScheduledJobRow } from "../schemas.js";
import { rowToProcess, rowToJob, type BackgroundProcessResponse, type ScheduledJobResponse } from "./mappers.js";

export const ProcessesError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("ProcessesError");
export type ProcessesError = InstanceType<typeof ProcessesError>;

// Use raw Supabase client with 'any' for tables not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

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

  // Verify project belongs to tenant
  await assertProjectAccess(projectId, tenantId, ProcessesError);

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

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.command !== undefined) dbUpdates.command = updates.command;
  if (updates.runtime !== undefined) dbUpdates.runtime = updates.runtime;
  if (updates.runtimeVersion !== undefined) dbUpdates.runtime_version = updates.runtimeVersion;
  if (updates.connection !== undefined) dbUpdates.connection = updates.connection;
  if (updates.numProcesses !== undefined) dbUpdates.num_processes = updates.numProcesses;
  if (updates.queue !== undefined) dbUpdates.queue = updates.queue;
  if (updates.backoff !== undefined) dbUpdates.backoff = updates.backoff;
  if (updates.sleep !== undefined) dbUpdates.sleep = updates.sleep;
  if (updates.rest !== undefined) dbUpdates.rest = updates.rest;
  if (updates.timeout !== undefined) dbUpdates.timeout = updates.timeout;
  if (updates.tries !== undefined) dbUpdates.tries = updates.tries;
  if (updates.memory !== undefined) dbUpdates.memory = updates.memory;
  if (updates.env !== undefined) dbUpdates.env = updates.env;
  if (updates.force !== undefined) dbUpdates.force = updates.force;
  if (updates.workingDirectory !== undefined) dbUpdates.working_directory = updates.workingDirectory;
  if (updates.gracefulShutdown !== undefined) dbUpdates.graceful_shutdown = updates.gracefulShutdown;

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
    .update({ status, updated_at: new Date().toISOString() })
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

  const { error, count } = await db
    .from("background_processes")
    .delete({ count: "exact" })
    .eq("id", processId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, ProcessesError, { internalMsg: "Failed to delete process" });
  if (count === 0) throw new ProcessesError("Process not found", "not_found");
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

  // Verify project belongs to tenant
  await assertProjectAccess(projectId, tenantId, ProcessesError);

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

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.command !== undefined) dbUpdates.command = updates.command;
  if (updates.user !== undefined) dbUpdates.user = updates.user;
  if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
  if (updates.customCron !== undefined) dbUpdates.custom_cron = updates.customCron;
  if (updates.monitorHeartbeat !== undefined) dbUpdates.monitor_heartbeat = updates.monitorHeartbeat;

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
    .update({ status, updated_at: new Date().toISOString() })
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

  const { error, count } = await db
    .from("scheduled_jobs")
    .delete({ count: "exact" })
    .eq("id", jobId)
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, ProcessesError, { internalMsg: "Failed to delete job" });
  if (count === 0) throw new ProcessesError("Job not found", "not_found");
}
