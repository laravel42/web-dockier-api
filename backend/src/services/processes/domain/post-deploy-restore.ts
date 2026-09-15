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
import { resolveExecutionTarget, executeCommand } from "../../../shared/service-clients/command-execution.js";
import type { BackgroundProcessRow, ScheduledJobRow } from "../schemas.js";

const db = supabaseAdmin;

const FREQUENCY_TO_CRON: Record<string, string> = {
  every_minute: "* * * * *",
  hourly: "0 * * * *",
  nightly: "0 0 * * *",
  weekly: "0 0 * * 0",
  monthly: "0 0 1 * *",
  on_reboot: "@reboot",
};

/**
 * Restore all active processes and installed jobs after a deploy.
 * Non-blocking: failures are logged but don't fail the deployment.
 */
export async function restoreProcessesAfterDeploy(params: {
  tenantId: string;
  projectId: string;
}): Promise<void> {
  const { tenantId, projectId } = params;

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

  if (processes.length === 0 && jobs.length === 0) return;

  logger.info(`[processes] Restoring ${processes.length} process(es) and ${jobs.length} job(s) after deploy`);

  // Resolve execution target
  const { target } = await resolveExecutionTarget(projectId, tenantId);
  if (!target) {
    logger.warn(`[processes] Cannot restore processes — no execution target available`);
    return;
  }

  // Restore background processes
  for (const proc of processes) {
    try {
      const marker = `DOCKIER_PROC_${proc.id.slice(0, 8)}`;
      const numProcs = proc.num_processes || 1;
      const startCmds: string[] = [];
      for (let i = 0; i < numProcs; i++) {
        startCmds.push(
          `nohup sh -c 'export ${marker}=1 && ${proc.command}' > /tmp/${marker}_${i}.log 2>&1 &`
        );
      }
      const cmd = startCmds.join(" && ");
      await executeCommand(target, cmd);
      logger.info(`[processes] Restored process: ${proc.name || proc.command}`);
    } catch (err) {
      const msg = getErrMsg(err);
      logger.error(`[processes] Failed to restore process ${proc.id}: ${msg}`);
      // Mark as errored so user knows it didn't start
      await db.from("background_processes")
        .update({ status: "errored", updated_at: new Date().toISOString() })
        .eq("id", proc.id);
    }
  }

  // Restore scheduled jobs
  if (jobs.length > 0) {
    try {
      // Build all cron entries at once for efficiency
      const cronLines: string[] = [];
      for (const job of jobs) {
        const marker = `# DOCKIER_JOB_${job.id.slice(0, 8)}`;
        const cronExpr = job.frequency === "custom" && job.custom_cron
          ? job.custom_cron
          : FREQUENCY_TO_CRON[job.frequency] || "0 * * * *";
        cronLines.push(marker);
        cronLines.push(`${cronExpr} ${job.command} # ↑ dockier`);
      }

      const installCmd = [
        "which crontab > /dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq cron > /dev/null 2>&1)",
        `(crontab -l 2>/dev/null || echo "") | grep -v "DOCKIER_JOB_" | grep -v "# ↑ dockier" > /tmp/cron_restore`,
        `printf '${cronLines.join("\\n")}\\n' >> /tmp/cron_restore`,
        "crontab /tmp/cron_restore",
        "service cron start 2>/dev/null || crond 2>/dev/null || true",
      ].join(" && ");

      await executeCommand(target, installCmd);
      logger.info(`[processes] Restored ${jobs.length} scheduled job(s)`);
    } catch (err) {
      const msg = getErrMsg(err);
      logger.error(`[processes] Failed to restore scheduled jobs: ${msg}`);
    }
  }
}
