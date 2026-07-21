import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import { assertProjectAccess } from "../../../shared/supabase/project-access.js";
import { enqueueCommand } from "./worker.js";
import { safeRecordActivity } from "../../observe/domain/activity.js";
import type { CommandRow } from "../schemas.js";
import { rowToCommand, type CommandResponse, type CommandStatus } from "./mappers.js";

export type { CommandStatus, CommandResponse };

export const CommandsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("CommandsError");
export type CommandsError = InstanceType<typeof CommandsError>;

export async function runCommand(params: {
  tenantId: string;
  projectId: string;
  userId: string;
  command: string;
}): Promise<CommandResponse> {
  const { tenantId, projectId, userId, command } = params;

  // Validate the project belongs to this tenant before running
  await assertProjectAccess(projectId, tenantId, CommandsError);

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

  const row = unwrapQuery(data, error, CommandsError, { internalMsg: "Failed to create command" });

  // Dispatch to the background worker for actual execution
  try {
    await enqueueCommand({
      commandId: row.id,
      tenantId,
      projectId,
      command,
    });
  } catch {
    // If enqueue fails, mark the command as failed so it doesn't stay stuck
    await supabaseAdmin
      .from("commands")
      .update({ status: "failed", output: "Failed to dispatch command for execution.", finished_at: new Date().toISOString() })
      .eq("id", row.id);
    throw new CommandsError("Failed to dispatch command for execution", "internal");
  }

  // Record activity for this command execution
  safeRecordActivity({
    tenantId,
    projectId,
    userId,
    eventType: "command_run",
    description: "Running custom command",
    metadata: { commandId: row.id, command },
  });

  return rowToCommand(row as CommandRow);
}

export async function listCommands(params: {
  tenantId: string;
  projectId: string;
  limit?: number;
  offset?: number;
}): Promise<{ commands: CommandResponse[]; total: number }> {
  const { tenantId, projectId, limit = 20, offset = 0 } = params;

  const { data, error, count } = await supabaseAdmin
    .from("commands")
    .select("*", { count: "exact" })
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const rows = unwrapList(data, error, CommandsError, { internalMsg: "Failed to list commands" });

  return {
    commands: rows.map((row) => rowToCommand(row as CommandRow)),
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

  const row = unwrapQuery(data, error, CommandsError, { notFoundMsg: "Command not found" });

  return rowToCommand(row as CommandRow);
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

  throwOnError(error, CommandsError, { internalMsg: "Failed to delete command" });

  if (count === 0) {
    throw new CommandsError("Command not found", "not_found");
  }
}
