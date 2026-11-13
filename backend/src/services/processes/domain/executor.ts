/**
 * Process Executor
 *
 * Handles starting, stopping, and restarting background processes on
 * deployed infrastructure. Reuses the command execution infrastructure
 * from the commands service (resolveExecutionTarget + executeCommand).
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { resolveProjectRunner } from "../../../shared/service-clients/command-execution.js";
import { ProcessesError } from "./processes.js";
import type { BackgroundProcessRow } from "../schemas.js";
import { processLogsScript, startProcessScript, stopProcessScript } from "./scripts.js";

const db = supabaseAdmin;

/**
 * Fetch a process row and assert it belongs to the given tenant + project.
 * Throws not_found if the row doesn't exist or doesn't match the scope.
 */
async function fetchProcessOrThrow(
  processId: string,
  projectId: string,
  tenantId: string,
  columns = "*",
): Promise<BackgroundProcessRow> {
  const { data } = await db
    .from("background_processes")
    .select(columns)
    .eq("id", processId)
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (!data) throw new ProcessesError("Process not found", "not_found");

  // A dynamic column string means PostgREST types the row loosely; narrow it here.
  const row = data as unknown as BackgroundProcessRow;

  // Defense-in-depth: verify organization_id even if PostgREST filter is correct.
  // This guards against future query refactors that might accidentally drop the filter.
  if (columns === "*" && row.organization_id !== tenantId) {
    throw new ProcessesError("Access denied", "forbidden");
  }

  return row;
}

/**
 * Start a background process on the deployed infrastructure.
 *
 * Uses nohup + output redirection to run the process in the background
 * inside the container. The process is identified by a unique marker
 * in its command so we can find and kill it later.
 */
export async function startProcess(params: {
  tenantId: string;
  projectId: string;
  processId: string;
}): Promise<{ success: boolean; message: string }> {
  const { tenantId, projectId, processId } = params;

  // Fetch the process config — scoped to tenant + project with ownership assertion
  const process = await fetchProcessOrThrow(processId, projectId, tenantId);

  // The command is deliberately NOT filtered: the user is authorised to run
  // anything inside their own container, so `$VAR` and `$(...)` must work.
  // Length is capped by the route schema, and the shell boundary is the
  // quoting in commands/domain/executor.ts.

  // Inside the Dokploy container when the project has one, as Commands does.
  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    return { success: false, message: runner.errorMessage };
  }

  const processCmd = process.command;
  const fullCmd = startProcessScript(processId, processCmd, process.num_processes);

  try {
    const result = await runner.run(fullCmd);
    logger.info(`[processes] Start command result: exitCode=${result.exitCode}, output="${result.output.trim().slice(0, 200)}"`);

    if (result.exitCode === 0 || result.output.includes("STARTED")) {
      // Update status to running
      await db
        .from("background_processes")
        .update({ status: "running", updated_at: nowIso() })
        .eq("id", processId);

      logger.info(`[processes] Started process ${processId}: ${processCmd}`);
      return { success: true, message: "Process started successfully." };
    }

    logger.warn(`[processes] Start failed for ${processId}: ${result.output.trim().slice(0, 500)}`);
    return { success: false, message: result.output || "Failed to start process." };
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error(`[processes] Failed to start process ${processId}: ${msg}`);
    return { success: false, message: `Execution error: ${msg}` };
  }
}

/**
 * Stop a background process on the deployed infrastructure.
 *
 * Finds processes by the unique marker environment variable and kills them.
 */
export async function stopProcess(params: {
  tenantId: string;
  projectId: string;
  processId: string;
}): Promise<{ success: boolean; message: string }> {
  const { tenantId, projectId, processId } = params;

  // Verify ownership with defense-in-depth assertion
  await fetchProcessOrThrow(processId, projectId, tenantId, "id,organization_id");

  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    return { success: false, message: runner.errorMessage };
  }

  const stopCmd = stopProcessScript(processId);

  try {
    const result = await runner.run(stopCmd);
    // pkill returns 1 if no process found, which is fine
    if (result.output.includes("STOPPED")) {
      await db
        .from("background_processes")
        .update({ status: "stopped", updated_at: nowIso() })
        .eq("id", processId);

      logger.info(`[processes] Stopped process ${processId}`);
      return { success: true, message: "Process stopped." };
    }

    return { success: false, message: result.output || "Failed to stop process." };
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error(`[processes] Failed to stop process ${processId}: ${msg}`);
    return { success: false, message: `Execution error: ${msg}` };
  }
}

/**
 * Restart a process: stop then start.
 */
export async function restartProcess(params: {
  tenantId: string;
  projectId: string;
  processId: string;
}): Promise<{ success: boolean; message: string }> {
  await stopProcess(params);
  return startProcess(params);
}

/**
 * Fetch the logs for a background process from the container.
 * Reads from the log file created by nohup during start.
 */
export async function getProcessLogs(params: {
  tenantId: string;
  projectId: string;
  processId: string;
  lines?: number;
}): Promise<{ logs: string }> {
  const { tenantId, projectId, processId } = params;
  // Validate and cap lines to prevent abuse
  const lines = Math.min(Math.max(params.lines ?? 100, 1), 1000);

  // Verify ownership with defense-in-depth assertion
  await fetchProcessOrThrow(processId, projectId, tenantId, "id,organization_id");

  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    return { logs: runner.errorMessage };
  }

  const cmd = processLogsScript(processId, lines);

  try {
    const result = await runner.run(cmd);
    return { logs: result.output || "No logs available yet." };
  } catch (err) {
    const msg = getErrMsg(err);
    return { logs: `Failed to retrieve logs: ${msg}` };
  }
}
