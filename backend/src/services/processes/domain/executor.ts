/**
 * Process Executor
 *
 * Handles starting, stopping, and restarting background processes on
 * deployed infrastructure. Reuses the command execution infrastructure
 * from the commands service (resolveExecutionTarget + executeCommand).
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { resolveExecutionTarget } from "../../commands/domain/worker.js";
import { executeCommand } from "../../commands/domain/executor.js";
import { ProcessesError } from "./processes.js";
import type { BackgroundProcessRow } from "../schemas.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// ─── Security ──────────────────────────────────────────────────────

/** Validate that a process command doesn't contain shell injection patterns. */
const DANGEROUS_PATTERNS = /[`$]|\beval\b|\bexec\b.*\||\brm\s+-rf\s+\/|&&\s*rm|;\s*rm/i;

function assertSafeCommand(command: string): void {
  if (DANGEROUS_PATTERNS.test(command)) {
    throw new ProcessesError(
      "Command contains potentially unsafe patterns. Review and simplify the command.",
      "bad_request",
    );
  }
  if (command.length > 2000) {
    throw new ProcessesError("Command exceeds maximum length (2000 characters).", "bad_request");
  }
}

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

  // Defense-in-depth: verify organization_id even if PostgREST filter is correct.
  // This guards against future query refactors that might accidentally drop the filter.
  if (columns === "*" && (data as BackgroundProcessRow).organization_id !== tenantId) {
    throw new ProcessesError("Access denied", "forbidden");
  }

  return data as BackgroundProcessRow;
}

/** Marker must be alphanumeric + underscore only. */
function buildMarker(processId: string): string {
  const short = processId.replace(/[^a-f0-9]/g, "").slice(0, 8);
  return `DOCKIER_PROC_${short}`;
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

  // Validate the command before execution
  assertSafeCommand(process.command);

  // Resolve execution target
  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    return { success: false, message: errorMessage || "No active deployment found." };
  }

  const marker = buildMarker(processId);
  const processCmd = process.command;
  const numProcs = Math.min(process.num_processes || 1, 10); // Cap at 10

  // Start N instances using nohup. Uses newlines to avoid dash syntax issues.
  const lines: string[] = [];
  for (let i = 0; i < numProcs; i++) {
    lines.push(`${marker}=1 nohup ${processCmd} > /tmp/${marker}_${i}.log 2>&1 &`);
  }
  lines.push("sleep 1");
  lines.push("echo STARTED");
  const fullCmd = lines.join("\n");

  try {
    const result = await executeCommand(target, fullCmd);
    logger.info(`[processes] Start command result: exitCode=${result.exitCode}, output="${result.output.trim().slice(0, 200)}"`);

    if (result.exitCode === 0 || result.output.includes("STARTED")) {
      // Update status to running
      await db
        .from("background_processes")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", processId);

      logger.info(`[processes] Started process ${processId}: ${processCmd}`);
      return { success: true, message: "Process started successfully." };
    }

    logger.warn(`[processes] Start failed for ${processId}: ${result.output.trim().slice(0, 500)}`);
    return { success: false, message: result.output || "Failed to start process." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

  // Resolve execution target
  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    return { success: false, message: errorMessage || "No active deployment found." };
  }

  const marker = buildMarker(processId);

  // Kill all processes with our marker — pkill returns 1 if no match (safe)
  const stopCmd = `pkill -f "${marker}" 2>/dev/null\necho STOPPED`;

  try {
    const result = await executeCommand(target, stopCmd);
    // pkill returns 1 if no process found, which is fine
    if (result.output.includes("STOPPED")) {
      await db
        .from("background_processes")
        .update({ status: "stopped", updated_at: new Date().toISOString() })
        .eq("id", processId);

      logger.info(`[processes] Stopped process ${processId}`);
      return { success: true, message: "Process stopped." };
    }

    return { success: false, message: result.output || "Failed to stop process." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    return { logs: errorMessage || "No active deployment found. Cannot retrieve logs." };
  }

  const marker = buildMarker(processId);
  const cmd = `cat /tmp/${marker}_*.log 2>/dev/null | tail -n ${lines} || echo "No logs available yet."`;

  try {
    const result = await executeCommand(target, cmd);
    return { logs: result.output || "No logs available yet." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { logs: `Failed to retrieve logs: ${msg}` };
  }
}
