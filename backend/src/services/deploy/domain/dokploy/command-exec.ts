/**
 * Dokploy Command Executor
 *
 * Runs a shell command inside a deployed app's container, over SSH, for apps
 * deployed via the Dokploy pipeline. Used by BOTH:
 *   - the automatic post-deploy stage (running the project's post-deploy
 *     commands after a successful deploy), and
 *   - the on-demand "Commands" panel (running a command against a live app).
 *
 * Mechanism (why SSH + docker exec):
 *   Dokploy runs each app as a Docker Swarm service on the tenant's VM and
 *   exposes no REST endpoint to exec inside a container. So we SSH to the box
 *   as root — using the Dockier-owned key installed at provision time and
 *   stored (encrypted) on the server mapping — resolve the running container
 *   from the Swarm service name (the Dokploy `appName`), and `docker exec` the
 *   command. This works for ANY stack (Node, PHP, Python, Go, ...) because it
 *   targets the already-running container rather than the app's start command.
 *
 * All failures are returned as a result (never thrown), so callers can log and
 * continue. The private key is written to a locked-down temp file for the
 * `ssh -i` call and removed immediately after.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getServer, getApplication } from "./mappings.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

/** Default per-command timeout — matches the Commands panel's 2-minute limit. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Container/service names must be shell-safe (they're interpolated into a remote command). */
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

export interface DokployCommandResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

export interface DokployCommandTarget {
  serverIp: string;
  /** Dockier-owned SSH private key (PEM). */
  sshPrivateKey: string;
  /** Dokploy application appName (the Swarm service name). */
  appName: string;
}

/**
 * Resolve the SSH + container target for a project's Dokploy deployment.
 *
 * Returns `{ target }` when the project has a ready server WITH a stored
 * Dockier key AND a known appName; otherwise `{ target: null, errorMessage }`
 * with a user-facing reason (no Dokploy internals leaked).
 */
export async function resolveDokployCommandTarget(
  projectId: string,
): Promise<{ target: DokployCommandTarget | null; errorMessage?: string }> {
  const server = await getServer(projectId);
  if (!server) {
    return { target: null, errorMessage: "This project has no deployed server yet. Deploy it first to run commands." };
  }
  if (server.serverStatus !== "ready") {
    return { target: null, errorMessage: "The deployment server isn't ready yet. Try again once the deployment finishes." };
  }
  if (!server.sshPrivateKey) {
    // Older servers provisioned before command-execution support have no key.
    return {
      target: null,
      errorMessage:
        "Command execution isn't available for this deployment yet. Redeploy the project to enable running commands on the server.",
    };
  }

  const app = await getApplication(projectId);
  if (!app?.appName) {
    return {
      target: null,
      errorMessage:
        "Could not locate the running application for this project. Redeploy the project to enable running commands.",
    };
  }

  return {
    target: { serverIp: server.serverIp, sshPrivateKey: server.sshPrivateKey, appName: app.appName },
  };
}

/**
 * Run a command inside the deployed container for a project (convenience
 * wrapper that resolves the target first). Returns a failed result with a
 * user-facing message when no runnable target exists.
 */
export async function runDokployCommand(
  projectId: string,
  command: string,
  opts: { timeoutMs?: number } = {},
): Promise<DokployCommandResult> {
  const { target, errorMessage } = await resolveDokployCommandTarget(projectId);
  if (!target) {
    return { exitCode: 1, output: errorMessage || "Cannot run command.", timedOut: false };
  }
  return execInDokployContainer(target, command, opts);
}

/**
 * Execute a command inside the app container on a resolved target.
 *
 * Builds ONE remote script that (1) finds the running container for the Swarm
 * service `appName` and (2) `docker exec`s the command in it. Runs it over SSH
 * with a locked-down temp key file.
 */
export async function execInDokployContainer(
  target: DokployCommandTarget,
  command: string,
  opts: { timeoutMs?: number } = {},
): Promise<DokployCommandResult> {
  const { serverIp, sshPrivateKey, appName } = target;

  if (!SAFE_NAME.test(appName)) {
    return { exitCode: 1, output: `Invalid application name: "${appName}"`, timedOut: false };
  }
  if (!command.trim()) {
    return { exitCode: 0, output: "", timedOut: false };
  }

  const remoteScript = buildRemoteScript(appName, command);

  let keyDir: string | undefined;
  try {
    keyDir = await mkdtemp(join(tmpdir(), "dokploy-cmd-"));
    const keyPath = join(keyDir, "id");
    await writeFile(keyPath, ensureTrailingNewline(sshPrivateKey), { mode: 0o600 });

    const sshArgs = [
      "-i", keyPath,
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "ConnectTimeout=30",
      "-o", "LogLevel=ERROR",
      `root@${serverIp}`,
      remoteScript,
    ];

    return await spawnWithTimeout("ssh", sshArgs, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (err) {
    return { exitCode: 1, output: `Command execution failed: ${getErrMsg(err)}`, timedOut: false };
  } finally {
    if (keyDir) await rm(keyDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Build the remote shell script: resolve the running container for the Swarm
 * service, then exec the user's command inside it.
 *
 * Dokploy names the Swarm service after the app's `appName`; the actual task
 * container is `<appName>.<slot>.<taskid>`. `docker ps --filter name=<appName>`
 * matches it. We take the first running match. The user command is embedded in
 * a single-quoted `sh -c '...'` with single quotes escaped.
 */
function buildRemoteScript(appName: string, command: string): string {
  const escaped = command.replace(/'/g, "'\\''");
  // Note: appName is validated against SAFE_NAME before we get here.
  return [
    `CID=$(docker ps --filter "name=${appName}" --filter "status=running" --format "{{.ID}}" | head -n1);`,
    `if [ -z "$CID" ]; then echo "The application container is not running." >&2; exit 1; fi;`,
    `docker exec "$CID" sh -c '${escaped}'`,
  ].join(" ");
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

/**
 * Spawn a process, capturing combined stdout+stderr, with a hard timeout that
 * SIGKILLs the child. Mirrors the existing command executor's semantics
 * (exit 124 + timedOut on timeout).
 */
function spawnWithTimeout(cmd: string, args: string[], timeoutMs: number): Promise<DokployCommandResult> {
  return new Promise((resolve) => {
    let output = "";
    let settled = false;

    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      resolve({ exitCode: 124, output: output || "Command timed out.", timedOut: true });
    }, timeoutMs);

    proc.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { output += d.toString(); });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output, timedOut: false });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: 1, output: err.message, timedOut: false });
    });
  });
}
