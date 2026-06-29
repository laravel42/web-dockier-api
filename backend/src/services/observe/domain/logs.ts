import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { resolveExecutionTarget } from "../../commands/domain/worker.js";
import { executeCommand } from "../../commands/domain/executor.js";

export type LogType = "site" | "nginx_access" | "nginx_error";

export interface LogEntry {
  type: LogType;
  content: string;
  size: number;
  lastModified: string | null;
}

/**
 * Log file paths by type.
 * These are the standard locations for Laravel/PHP and Nginx-based deployments.
 * For other stacks the paths may differ — we try multiple fallbacks.
 */
const LOG_PATHS: Record<LogType, string[]> = {
  site: [
    // Laravel
    "/var/www/html/storage/logs/laravel.log",
    "/var/www/storage/logs/laravel.log",
    "/app/storage/logs/laravel.log",
    // Node.js / generic
    "/var/log/app.log",
    "/app/logs/app.log",
    "/tmp/app.log",
  ],
  nginx_access: [
    "/var/log/nginx/access.log",
    "/var/log/access.log",
  ],
  nginx_error: [
    "/var/log/nginx/error.log",
    "/var/log/error.log",
  ],
};

const LOG_TYPE_LABELS: Record<LogType, string> = {
  site: "Site Log",
  nginx_access: "Nginx Access Log",
  nginx_error: "Nginx Error Log",
};

/** Max lines to tail from the log file. */
const MAX_TAIL_LINES = 500;

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Retrieve log content from the deployed server by executing `tail` on the log file.
 */
export async function getLog(params: {
  tenantId: string;
  projectId: string;
  logType: LogType;
}): Promise<LogEntry> {
  const { tenantId, projectId, logType } = params;

  // Verify project ownership
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (projectError || !project) {
    throw httpError(404, "Project not found");
  }

  // Resolve execution target (same mechanism as commands)
  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);

  if (!target) {
    return {
      type: logType,
      content: errorMessage || `No active deployment found. Deploy your project first to access ${LOG_TYPE_LABELS[logType]}.`,
      size: 0,
      lastModified: null,
    };
  }

  // Build a command that tries each possible log path and tails the first one found
  const paths = LOG_PATHS[logType];
  const findAndTailCmd = buildLogReadCommand(paths);

  try {
    const result = await executeCommand(target, findAndTailCmd);

    if (result.timedOut) {
      return {
        type: logType,
        content: `Timed out reading ${LOG_TYPE_LABELS[logType]}. The log file may be very large.`,
        size: 0,
        lastModified: null,
      };
    }

    if (result.exitCode !== 0 && result.output.includes("NO_LOG_FOUND")) {
      return {
        type: logType,
        content: `${LOG_TYPE_LABELS[logType]} not found. The application may not generate this type of log, or it's stored in a non-standard location.`,
        size: 0,
        lastModified: null,
      };
    }

    // Even with non-zero exit code, if we got output it might be the log content
    const content = result.output || `No entries in ${LOG_TYPE_LABELS[logType]}.`;

    return {
      type: logType,
      content,
      size: Buffer.byteLength(content, "utf8"),
      lastModified: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      type: logType,
      content: `Failed to read ${LOG_TYPE_LABELS[logType]}: ${msg}`,
      size: 0,
      lastModified: null,
    };
  }
}

/**
 * Clear log contents on the deployed server.
 */
export async function clearLog(params: {
  tenantId: string;
  projectId: string;
  logType: LogType;
}): Promise<void> {
  const { tenantId, projectId, logType } = params;

  // Verify project ownership
  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", tenantId)
    .single();

  if (projectError || !project) {
    throw httpError(404, "Project not found");
  }

  // Resolve execution target
  const { target, errorMessage } = await resolveExecutionTarget(projectId, tenantId);

  if (!target) {
    throw httpError(400, errorMessage || "No active deployment found.");
  }

  // Build a command that truncates the log file
  const paths = LOG_PATHS[logType];
  const truncateCmd = buildLogClearCommand(paths);

  try {
    const result = await executeCommand(target, truncateCmd);
    if (result.exitCode !== 0) {
      throw httpError(500, `Failed to clear ${LOG_TYPE_LABELS[logType]}: ${result.output}`);
    }
  } catch (err) {
    if (err && typeof err === "object" && "statusCode" in err) {
      throw err;
    }
    throw httpError(500, `Failed to clear ${LOG_TYPE_LABELS[logType]}`);
  }

  // Record activity
  const { recordActivity } = await import("./activity.js");
  await recordActivity({
    tenantId,
    projectId,
    eventType: "log_cleared",
    description: `Cleared ${LOG_TYPE_LABELS[logType]}`,
    metadata: { logType },
  });
}

// ─── Command Builders ───

/**
 * Build a shell command that finds the first existing log file and tails it.
 * Uses a loop so we try multiple paths and output the first one found.
 */
function buildLogReadCommand(paths: string[]): string {
  const checks = paths.map((p) => `[ -f "${p}" ] && tail -n ${MAX_TAIL_LINES} "${p}" && exit 0`).join("; ");
  return `${checks}; echo "NO_LOG_FOUND"; exit 1`;
}

/**
 * Build a shell command that truncates the first existing log file.
 */
function buildLogClearCommand(paths: string[]): string {
  const checks = paths.map((p) => `[ -f "${p}" ] && : > "${p}" && exit 0`).join("; ");
  return `${checks}; exit 0`;
}
