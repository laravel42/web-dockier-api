/**
 * Fetch the tail of a Dokploy build log for failure diagnosis.
 *
 * Dokploy exposes no REST procedure for build-log CONTENT — it writes the log
 * to a file on the server that ran the build (`deployment.logPath`, under
 * `/etc/dokploy/logs/<appName>/`) and streams it to its own UI over a
 * websocket. The real failure evidence (`JavaScript heap out of memory`,
 * `exit code: 134`, the railpack plan) therefore only exists in that file, so
 * we read it over the SSH channel the Commands panel already uses.
 *
 * Strictly BEST-EFFORT, exactly like the AI Dockerfile review layer: it runs on
 * a path that is already reporting a failure, returns "" on ANY problem, and
 * never throws. A miss costs a richer diagnosis, never a deploy.
 */

import { resolveDokployCommandTarget, execOnDokployHost } from "../command-exec.js";

/**
 * shortcut: we read only the last 256 KB of the log and give the read 30s, so a
 * failure whose only evidence sits earlier in a huge log stays undiagnosed.
 * The tail is where it lives today (the terminal `process "..." did not
 * complete successfully: exit code: 134` line plus the surrounding heap dump);
 * raise the cap if a real failure is ever missed because of it.
 */
const DEFAULT_MAX_BYTES = 262_144;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * `logPath` is interpolated into a remote shell command, so it is validated
 * first. Dokploy builds it as `/etc/dokploy/logs/<appName>/<appName>-<ts>.log`
 * and its timestamps contain `:`. Same defensive posture as SAFE_NAME in
 * command-exec.ts.
 */
const SAFE_LOG_PATH = /^\/[A-Za-z0-9._:\-/]+$/;

/**
 * Return the last `maxBytes` of the build log at `logPath`, or "" when it can't
 * be read (no server/key/app mapping, bad path, ssh failure, timeout, missing
 * file). Never throws.
 */
export async function fetchBuildLogTail(params: {
  projectId: string;
  logPath: string;
  maxBytes?: number;
  timeoutMs?: number;
}): Promise<string> {
  const { projectId, logPath, maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

  try {
    if (!logPath || logPath.includes("..") || !SAFE_LOG_PATH.test(logPath)) return "";

    const { target } = await resolveDokployCommandTarget(projectId);
    if (!target) return "";

    // `tail -c` truncates on the server, so a multi-megabyte log is never
    // transferred. 2>/dev/null keeps a missing file from polluting the output.
    const result = await execOnDokployHost(target, `tail -c ${maxBytes} '${logPath}' 2>/dev/null`, { timeoutMs });
    return result.exitCode === 0 ? result.output : "";
  } catch {
    return "";
  }
}
