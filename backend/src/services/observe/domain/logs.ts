import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { getErrMsg } from "../../../shared/utils/error-message.js";
import { nowIso } from "../../../shared/utils/time.js";
import { resolveProjectRunner, readDokployContainerLogs } from "../../../shared/service-clients/command-execution.js";

export const LogsError = createDomainErrorClass<"not_found" | "bad_request" | "internal">("LogsError");
export type LogsError = InstanceType<typeof LogsError>;

export type LogType = "site" | "nginx_access" | "nginx_error";

export interface LogEntry {
  type: LogType;
  content: string;
  size: number;
  lastModified: string | null;
  /** null: `content` is an explanatory message, not log data (nothing to download or clear). */
  source: "file" | "container" | null;
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

/**
 * Retrieve log content from the deployed server by executing `tail` on the log file.
 */
export async function getLog(params: {
  tenantId: string;
  projectId: string;
  logType: LogType;
}): Promise<LogEntry> {
  const { tenantId, projectId, logType } = params;

  // Same routing as commands: inside the Dokploy container first, native target otherwise.
  const runner = await resolveProjectRunner(projectId, tenantId);

  const label = LOG_TYPE_LABELS[logType];
  const message = (content: string): LogEntry => ({ type: logType, content, size: 0, lastModified: null, source: null });
  const data = (content: string, source: "file" | "container"): LogEntry => ({
    type: logType,
    content,
    size: Buffer.byteLength(content, "utf8"),
    lastModified: nowIso(),
    source,
  });

  if (!runner.run) {
    return message(runner.errorMessage || `No active deployment found. Deploy your project first to access ${label}.`);
  }

  // Build a command that tries each possible log path and tails the first one found
  const findAndTailCmd = buildLogReadCommand(LOG_PATHS[logType]);

  try {
    const result = await runner.run(findAndTailCmd);

    if (result.timedOut) return message(`Timed out reading ${label}. The log file may be very large.`);

    if (result.exitCode !== 0 && result.output.includes("NO_LOG_FOUND")) {
      // Most stacks on Dokploy log to stdout, not to a file: show the container's output instead.
      const stdout = logType === "site" ? await readDokployContainerLogs(projectId, MAX_TAIL_LINES) : null;
      if (stdout && stdout.exitCode === 0 && !stdout.timedOut) return data(stdout.output, "container");
      return message(`${label} not found. The application may not generate this type of log, or it's stored in a non-standard location.`);
    }

    // The script keeps tail's exit code, so non-zero here is an error (unreadable file, container down), not log data.
    if (result.exitCode !== 0) return message(`Failed to read ${label}: ${result.output.trim() || `exit code ${result.exitCode}`}`);

    // An empty file is still data: the frontend shows its own empty state.
    return data(result.output, "file");
  } catch (err) {
    return message(`Failed to read ${label}: ${getErrMsg(err)}`);
  }
}

/**
 * Clear log contents on the deployed server.
 */
export async function clearLog(params: {
  tenantId: string;
  projectId: string;
  userId?: string;
  logType: LogType;
}): Promise<void> {
  const { tenantId, projectId, userId, logType } = params;

  const runner = await resolveProjectRunner(projectId, tenantId);

  if (!runner.run) {
    throw new LogsError(runner.errorMessage || "No active deployment found.", "bad_request");
  }

  // Build a command that truncates the log file
  const paths = LOG_PATHS[logType];
  const truncateCmd = buildLogClearCommand(paths);

  const result = await runner.run(truncateCmd).catch((err) => {
    throw new LogsError(`Failed to clear ${LOG_TYPE_LABELS[logType]}`, "internal", err);
  });

  // Nothing was truncated: say so instead of recording a "cleared" event for a log that isn't there.
  if (result.exitCode !== 0 && result.output.includes("NO_LOG_FOUND")) {
    throw new LogsError(`${LOG_TYPE_LABELS[logType]} not found, so there is nothing to clear.`, "not_found");
  }

  if (result.exitCode !== 0) {
    throw new LogsError(`Failed to clear ${LOG_TYPE_LABELS[logType]}: ${result.output}`, "internal");
  }

  // Record activity
  const { recordActivity } = await import("./activity.js");
  await recordActivity({
    tenantId,
    projectId,
    userId,
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
  const checks = paths.map((p) => `[ -f "${p}" ] && { tail -n ${MAX_TAIL_LINES} "${p}"; exit $?; }`).join("; ");
  return `${checks}; echo "NO_LOG_FOUND"; exit 1`;
}

/**
 * Build a shell command that truncates the first existing log file.
 */
function buildLogClearCommand(paths: string[]): string {
  // Stop at the first existing file and keep its exit code, so a permission error isn't reported as "not found".
  const checks = paths.map((p) => `[ -f "${p}" ] && { : > "${p}"; exit $?; }`).join("; ");
  return `${checks}; echo "NO_LOG_FOUND"; exit 1`;
}
