/**
 * Post-Deploy Process Restore
 *
 * After a successful deployment, re-applies all background processes
 * marked as "running" and all scheduled jobs marked as "installed"
 * to the new container. This ensures processes survive re-deploys.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { logger } from "../../../shared/logger.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { resolveProjectRunner } from "../../../shared/service-clients/command-execution.js";
import type { BackgroundProcessRow, ScheduledJobRow } from "../schemas.js";
import { SAFE_CRON_USER, installCronScript, startProcessScript } from "./scripts.js";
import { jobCronExpression } from "./scheduler-executor.js";

const db = supabaseAdmin;

export interface RestoreResult {
  processes: number;
  jobs: number;
  /** Set when nothing could be restored, for the deploy log. */
  skipped?: string;
}

/**
 * Restore all active processes and installed jobs after a deploy.
 * Non-blocking: failures are logged but don't fail the deployment.
 *
 * `waitUntilReady` lets the Dokploy pipeline wait for the NEW container before
 * anything is started in it; it runs only when there is something to restore.
 */
export async function restoreProcessesAfterDeploy(params: {
  tenantId: string;
  projectId: string;
  waitUntilReady?: () => Promise<boolean>;
}): Promise<RestoreResult> {
  const { tenantId, projectId, waitUntilReady } = params;

  // Fetch active processes and installed jobs
  const [procResult, jobResult] = await Promise.all([
    db.from("background_processes")
      .select("*")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .eq("status", "running"),
    db.from("scheduled_jobs")
      .select("*")
      .eq("organization_id", tenantId)
      .eq("project_id", projectId)
      .eq("status", "installed"),
  ]);

  const processes = (procResult.data || []) as BackgroundProcessRow[];
  const jobs = (jobResult.data || []) as ScheduledJobRow[];

  if (processes.length === 0 && jobs.length === 0) return { processes: 0, jobs: 0 };

  logger.info(`[processes] Restoring ${processes.length} process(es) and ${jobs.length} job(s) after deploy`);

  // Inside the Dokploy container when the project has one, as Commands does.
  const runner = await resolveProjectRunner(projectId, tenantId);
  if (!runner.run) {
    logger.warn(`[processes] Cannot restore processes: ${runner.errorMessage}`);
    return { processes: 0, jobs: 0, skipped: runner.errorMessage };
  }
  const run = runner.run;
  if (waitUntilReady && !(await waitUntilReady())) {
    const skipped = "the application container did not become ready in time";
    logger.warn(`[processes] Cannot restore processes: ${skipped}`);
    return { processes: 0, jobs: 0, skipped };
  }

  // Restore background processes — the same script Start runs, so a restored
  // process can be stopped (it used to be started in a form Stop never found).
  let restoredProcesses = 0;
  for (const proc of processes) {
    try {
      const result = await run(startProcessScript(proc.id, proc.command, proc.num_processes, {
        workingDirectory: proc.working_directory,
        graceSeconds: proc.graceful_shutdown,
      }));
      // The runner reports failure as a result, not a throw; same check as Start.
      if (result.exitCode !== 0 && !result.output.includes("STARTED")) {
        throw new Error(result.output.trim().slice(0, 300) || `exit code ${result.exitCode}`);
      }
      restoredProcesses++;
      logger.info(`[processes] Restored process: ${proc.name || proc.command}`);
    } catch (err) {
      const msg = getErrMsg(err);
      logger.error(`[processes] Failed to restore process ${proc.id}: ${msg}`);
      // Mark as errored so user knows it didn't start
      await db.from("background_processes")
        .update({ status: "errored", updated_at: nowIso() })
        .eq("id", proc.id);
    }
  }

  // Restore scheduled jobs with the install script: it keeps each job's user (the
  // restore used to put every job in root's crontab), escapes the command, and
  // validates the stored values. One script per job, run together.
  let restoredJobs = 0;
  if (jobs.length > 0) {
    const scripts: string[] = [];
    for (const job of jobs) {
      try {
        if (!SAFE_CRON_USER.test(job.user)) throw new Error(`invalid cron user "${job.user}"`);
        scripts.push(installCronScript({ jobId: job.id, user: job.user, expr: jobCronExpression(job), command: job.command }));
      } catch (err) {
        logger.error(`[processes] Skipping scheduled job ${job.id} on restore: ${getErrMsg(err)}`);
      }
    }
    try {
      if (scripts.length > 0) {
        const result = await run(scripts.join("\n"));
        if (!result.output.includes("INSTALLED")) {
          throw new Error(result.output.trim().slice(0, 300) || `exit code ${result.exitCode}`);
        }
      }
      restoredJobs = scripts.length;
      logger.info(`[processes] Restored ${scripts.length} scheduled job(s)`);
    } catch (err) {
      const msg = getErrMsg(err);
      logger.error(`[processes] Failed to restore scheduled jobs: ${msg}`);
    }
  }

  return { processes: restoredProcesses, jobs: restoredJobs };
}
