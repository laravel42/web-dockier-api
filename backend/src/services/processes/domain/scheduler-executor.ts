/**
 * Scheduler Executor
 *
 * Handles installing, pausing, and removing cron jobs on deployed
 * infrastructure. Uses the same execution target resolution as the
 * commands service.
 */

import { logger } from "../../../shared/logger.js";
import { resolveExecutionTarget, executeCommand } from "../../../shared/service-clients/command-execution.js";
import { ProcessesError } from "./processes.js";
import type { ScheduledJobRow } from "../schemas.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabaseAdmin } from "../../../shared/supabase/client.js";
const db = supabaseAdmin as any;

/** Map frequency values to cron expressions. */
const FREQUENCY_TO_CRON: Record<string, string> = {
  every_minute: "* * * * *",
  hourly: "0 * * * *",
  nightly: "0 0 * * *",
  weekly: "0 0 * * 0",
  monthly: "0 0 1 * *",
  on_reboot: "@reboot",
};

/** Unique marker comment for identifying Dockier-managed cron entries. */
function cronMarker(jobId: string): string {
  const short = jobId.replace(/[^a-f0-9]/g, "").slice(0, 8);
  return `# DOCKIER_JOB_${short}`;
}

/** Validate cron expression format (basic check). */
function assertValidCron(expr: string): void {
  if (expr === "@reboot") return;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    throw new ProcessesError("Invalid cron expression format.", "bad_request");
  }
}

/** Validate the user field to prevent injection. */
const SAFE_USER = /^[a-z_][a-z0-9_-]{0,31}$/;
function assertSafeUser(user: string): void {
  if (!SAFE_USER.test(user)) {
    throw new ProcessesError("Invalid user name. Must be a valid Unix username.", "bad_request");
  }
}

/** Build the cron expression for a job. */
function buildCronExpression(job: ScheduledJobRow): string {
  if (job.frequency === "custom" && job.custom_cron) {
    return job.custom_cron;
  }
  return FREQUENCY_TO_CRON[job.frequency] || "0 * * * *";
}

/**
 * Fetch a scheduled job row and assert it belongs to the given tenant + project.
 * Throws not_found if the row doesn't exist or doesn't match the scope.
 */
async function fetchJobOrThrow(
  jobId: string,
  projectId: string,
  tenantId: string,
): Promise<ScheduledJobRow> {
  const { data: job } = await db
    .from("scheduled_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (!job) throw new ProcessesError("Job not found", "not_found");

  // Defense-in-depth: verify organization_id even if PostgREST filter is correct.
  if ((job as ScheduledJobRow).organization_id !== tenantId) {
    throw new ProcessesError("Access denied", "forbidden");
  }

  return job as ScheduledJobRow;
}

/**
 * Install a scheduled job by adding a cron entry inside the container.
 */
export async function installJob(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
}): Promise<{ success: boolean; message: string }> {
  const { tenantId, projectId, jobId } = params;

  const jobRow = await fetchJobOrThrow(jobId, projectId, tenantId);

  // Validate inputs before executing on infrastructure
  assertSafeUser(jobRow.user);
  const cronExpr = buildCronExpression(jobRow);
  assertValidCron(cronExpr);

  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    return { success: false, message: errorMessage || "No active deployment found." };
  }

  const marker = cronMarker(jobId);
  const cronLine = `${cronExpr} ${jobRow.command}`;

  // Remove existing entry for this job (if any), then add the new one
  // This ensures idempotent installs
  const installCmd = [
    // Ensure cron is available
    "which crontab > /dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq cron > /dev/null 2>&1)",
    // Remove old entry for this job
    `(crontab -u ${jobRow.user} -l 2>/dev/null || echo "") | grep -v "${marker}" | grep -v "# ↑ dockier" > /tmp/cron_edit`,
    // Add new entry
    `echo '${marker}' >> /tmp/cron_edit`,
    `echo '${cronLine} # ↑ dockier' >> /tmp/cron_edit`,
    // Install the crontab
    `crontab -u ${jobRow.user} /tmp/cron_edit`,
    // Ensure cron daemon is running
    "service cron start 2>/dev/null || crond 2>/dev/null || true",
    "echo INSTALLED",
  ].join(" && ");

  try {
    const result = await executeCommand(target, installCmd);
    if (result.exitCode === 0 && result.output.includes("INSTALLED")) {
      await db
        .from("scheduled_jobs")
        .update({ status: "installed", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      logger.info(`[scheduler] Installed job ${jobId}: ${cronLine}`);
      return { success: true, message: "Scheduled job installed." };
    }

    return { success: false, message: result.output || "Failed to install cron job." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[scheduler] Failed to install job ${jobId}: ${msg}`);
    return { success: false, message: `Execution error: ${msg}` };
  }
}

/**
 * Pause a scheduled job by removing its cron entry.
 */
export async function pauseJob(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
}): Promise<{ success: boolean; message: string }> {
  const { tenantId, projectId, jobId } = params;

  const jobRow = await fetchJobOrThrow(jobId, projectId, tenantId);

  assertSafeUser(jobRow.user);

  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    return { success: false, message: errorMessage || "No active deployment found." };
  }

  const marker = cronMarker(jobId);

  // Remove the cron entry for this job
  const pauseCmd = [
    `(crontab -u ${jobRow.user} -l 2>/dev/null || echo "") | grep -v "${marker}" | grep -v "# ↑ dockier" > /tmp/cron_edit`,
    `crontab -u ${jobRow.user} /tmp/cron_edit`,
    "echo PAUSED",
  ].join(" && ");

  try {
    const result = await executeCommand(target, pauseCmd);
    if (result.exitCode === 0 && result.output.includes("PAUSED")) {
      await db
        .from("scheduled_jobs")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      logger.info(`[scheduler] Paused job ${jobId}`);
      return { success: true, message: "Scheduled job paused." };
    }

    return { success: false, message: result.output || "Failed to pause cron job." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[scheduler] Failed to pause job ${jobId}: ${msg}`);
    return { success: false, message: `Execution error: ${msg}` };
  }
}

/**
 * Remove a scheduled job's cron entry from the container.
 * Called before deleting the job from the database.
 */
export async function removeJobCron(params: {
  tenantId: string;
  projectId: string;
  jobId: string;
}): Promise<void> {
  try {
    await pauseJob(params);
  } catch {
    // Best-effort removal — don't block deletion if infra is gone
  }
}
