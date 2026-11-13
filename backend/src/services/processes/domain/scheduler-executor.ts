/**
 * Scheduler Executor
 *
 * Handles installing, pausing, and removing cron jobs on deployed
 * infrastructure. Uses the same execution target resolution as the
 * commands service.
 */

import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { resolveProjectRunner } from "../../../shared/service-clients/command-execution.js";
import { ProcessesError } from "./processes.js";
import type { ScheduledJobRow } from "../schemas.js";
import { FREQUENCY_TO_CRON, SAFE_CRON_USER, installCronScript, isValidCronExpression, removeCronScript } from "./scripts.js";

import { supabaseAdmin } from "../../../shared/supabase/client.js";
const db = supabaseAdmin;

/** Validate the user field to prevent injection. */
function assertSafeUser(user: string): void {
  if (!SAFE_CRON_USER.test(user)) {
    throw new ProcessesError("Invalid user name. Must be a valid Unix username.", "bad_request");
  }
}

/** The job's cron expression, validated: rows stored before schema validation may not be. */
export function jobCronExpression(job: ScheduledJobRow): string {
  const expr = job.frequency === "custom" && job.custom_cron
    ? job.custom_cron.trim()
    : FREQUENCY_TO_CRON[job.frequency] || "0 * * * *";
  if (!isValidCronExpression(expr)) {
    throw new ProcessesError("Invalid cron expression format.", "bad_request");
  }
  return expr;
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
}): Promise<{ success: boolean; message: string; noTarget?: boolean }> {
  const { tenantId, projectId, jobId } = params;

  const jobRow = await fetchJobOrThrow(jobId, projectId, tenantId);

  // Validate inputs before executing on infrastructure
  assertSafeUser(jobRow.user);
  const cronExpr = jobCronExpression(jobRow);

  // Inside the Dokploy container when the project has one, as Commands does.
  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    // noTarget: nothing to install into yet. The job stays "installed" and the
    // post-deploy restore installs it; a caller must not read this as a failure.
    return { success: false, noTarget: true, message: runner.errorMessage };
  }

  // Replaces only this job's entry, so installs are idempotent and leave other jobs alone.
  const installCmd = installCronScript({ jobId, user: jobRow.user, expr: cronExpr, command: jobRow.command });
  const cronLine = `${cronExpr} ${jobRow.command}`;

  try {
    const result = await runner.run(installCmd);
    if (result.exitCode === 0 && result.output.includes("INSTALLED")) {
      await db
        .from("scheduled_jobs")
        .update({ status: "installed", updated_at: nowIso() })
        .eq("id", jobId);

      logger.info(`[scheduler] Installed job ${jobId}: ${cronLine}`);
      return { success: true, message: "Scheduled job installed." };
    }

    return { success: false, message: result.output || "Failed to install cron job." };
  } catch (err) {
    const msg = getErrMsg(err);
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

  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    return { success: false, message: runner.errorMessage };
  }

  const pauseCmd = removeCronScript({ jobId, user: jobRow.user });

  try {
    const result = await runner.run(pauseCmd);
    if (result.exitCode === 0 && result.output.includes("PAUSED")) {
      await db
        .from("scheduled_jobs")
        .update({ status: "paused", updated_at: nowIso() })
        .eq("id", jobId);

      logger.info(`[scheduler] Paused job ${jobId}`);
      return { success: true, message: "Scheduled job paused." };
    }

    return { success: false, message: result.output || "Failed to pause cron job." };
  } catch (err) {
    const msg = getErrMsg(err);
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
