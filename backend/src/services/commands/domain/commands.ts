import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { enqueueCommand } from "./worker.js";
import type { CommandRow } from "../schemas.js";

export type CommandStatus = "running" | "finished" | "failed" | "timed_out";

export interface CommandResponse {
  id: string;
  projectId: string;
  userId: string;
  command: string;
  status: CommandStatus;
  output: string;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

function rowToCommand(row: CommandRow): CommandResponse {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    command: row.command,
    status: row.status as CommandStatus,
    output: row.output,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

/**
 * HTTP error helper — attaches a statusCode so Fastify's error handler
 * translates it to the correct response code.
 */
function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function runCommand(params: {
  tenantId: string;
  projectId: string;
  userId: string;
  command: string;
}): Promise<CommandResponse> {
  const { tenantId, projectId, userId, command } = params;

  // Validate the project belongs to this tenant before running
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (projectError || !project) {
    throw httpError(404, "Project not found");
  }

  // Insert command record with "running" status
  const { data, error } = await supabaseAdmin
    .from("commands")
    .insert({
      organization_id: tenantId,
      project_id: projectId,
      user_id: userId,
      command,
      status: "running",
      output: "",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw httpError(500, error?.message || "Failed to create command");
  }

  // Dispatch to the background worker for actual execution
  try {
    await enqueueCommand({
      commandId: data.id,
      tenantId,
      projectId,
      command,
    });
  } catch {
    // If enqueue fails, mark the command as failed so it doesn't stay stuck
    await supabaseAdmin
      .from("commands")
      .update({ status: "failed", output: "Failed to dispatch command for execution.", finished_at: new Date().toISOString() })
      .eq("id", data.id);
    throw httpError(500, "Failed to dispatch command for execution");
  }

  return rowToCommand(data as CommandRow);
}

export async function listCommands(params: {
  tenantId: string;
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<{ commands: CommandResponse[]; total: number }> {
  const { tenantId, projectId, limit = 20, offset = 0 } = params;

  const { count } = await supabaseAdmin
    .from("commands")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  const { data, error } = await supabaseAdmin
    .from("commands")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw httpError(500, error.message);
  }

  return {
    commands: (data || []).map((row) => rowToCommand(row as CommandRow)),
    total: count ?? 0,
  };
}

export async function getCommand(params: {
  tenantId: string;
  projectId: string;
  commandId: string;
}): Promise<CommandResponse> {
  const { tenantId, projectId, commandId } = params;

  const { data, error } = await supabaseAdmin
    .from("commands")
    .select("*")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .eq("id", commandId)
    .single();

  if (error || !data) {
    throw httpError(404, "Command not found");
  }

  return rowToCommand(data as CommandRow);
}

export async function deleteCommand(params: {
  tenantId: string;
  projectId: string;
  commandId: string;
}): Promise<void> {
  const { tenantId, projectId, commandId } = params;

  const { error, count } = await supabaseAdmin
    .from("commands")
    .delete({ count: "exact" })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .eq("id", commandId);

  if (error) {
    throw httpError(500, error.message);
  }

  if (count === 0) {
    throw httpError(404, "Command not found");
  }
}
