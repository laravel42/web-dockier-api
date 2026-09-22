/**
 * Stage: Run Post-Deploy Commands
 *
 * After a successful deploy, run the project's user-defined post-deploy
 * commands (from project settings `deployScript`) inside the running app
 * container, over SSH. Works for any stack — it execs into the already-running
 * container rather than touching how the app starts.
 *
 * Best-effort and NON-FATAL: any failure (no key on older servers, container
 * not up, a command exiting non-zero) is logged and the deploy still succeeds.
 * A failing migration shouldn't roll back an otherwise-healthy deploy; the user
 * sees the output in the deploy log and can re-run via the Commands panel.
 *
 * Never surfaces "Dokploy" in user-facing logs.
 */

import { resolveDokployCommandTarget, execInDokployContainer } from "../command-exec.js";
import { getProjectDeployConfig } from "../../../../../shared/service-clients/projects.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";

/** Cap on the whole script, mirroring the native post-deploy guard. */
const MAX_SCRIPT_LENGTH = 10_000;

export async function stageRunPostDeploy(params: {
  projectId: string;
  /** How long to keep retrying container readiness before giving up (ms). */
  readinessTimeoutMs?: number;
  /** Test seam: sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
  log: (line: string) => Promise<void>;
}): Promise<void> {
  const { projectId, log } = params;
  const sleep = params.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const readinessTimeoutMs = params.readinessTimeoutMs ?? 120_000;

  // Load the user's post-deploy commands from project settings.
  let script: string;
  try {
    const config = await getProjectDeployConfig(projectId);
    script = (config?.deployScript ?? "").trim();
  } catch (err) {
    await log(`[stage:post-deploy] Skipped loading post-deploy commands: ${getErrMsg(err)}`);
    return;
  }

  if (!script) return; // nothing configured

  if (script.length > MAX_SCRIPT_LENGTH) {
    await log("[stage:post-deploy] Post-deploy commands exceed the 10KB limit — skipping.");
    return;
  }

  // Any real work? (ignore blank lines and `#` comments)
  const hasWork = script.split("\n").some((line) => {
    const l = line.trim();
    return l && !l.startsWith("#");
  });
  if (!hasWork) return;

  // Resolve the SSH + container target. If unavailable (older server without a
  // Dockier key, app not located), skip with a clear, non-fatal note.
  const { target, errorMessage } = await resolveDokployCommandTarget(projectId);
  if (!target) {
    await log(`[stage:post-deploy] Skipping post-deploy commands: ${errorMessage}`);
    return;
  }

  await log("[stage:post-deploy] Running post-deploy commands...");

  // Wait for the container to be running before executing (the deploy may have
  // just started it). We probe with a trivial command until it succeeds or the
  // readiness window elapses.
  const ready = await waitForContainer(target, readinessTimeoutMs, sleep, log);
  if (!ready) {
    await log("[stage:post-deploy] The application container did not become ready in time — skipping post-deploy commands.");
    return;
  }

  // Run the whole script in one shell invocation so multi-line scripts share a
  // shell context. Non-fatal: log the outcome either way.
  const result = await execInDokployContainer(target, script);
  const tail = result.output.trim().split("\n").slice(-20).join("\n");

  if (result.timedOut) {
    await log("[stage:post-deploy] Post-deploy commands timed out.");
  } else if (result.exitCode === 0) {
    await log("[stage:post-deploy] ✓ Post-deploy commands completed.");
  } else {
    await log(`[stage:post-deploy] Post-deploy commands exited with code ${result.exitCode} (deploy still succeeded).`);
  }
  if (tail) await log(`[stage:post-deploy] Output:\n${tail}`);
}

/**
 * Probe the container with a no-op command until it responds (exit 0) or the
 * timeout elapses. Uses a short per-attempt timeout so a not-yet-running
 * container fails fast and we retry.
 */
async function waitForContainer(
  target: Parameters<typeof execInDokployContainer>[0],
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
  log: (line: string) => Promise<void>,
): Promise<boolean> {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt++;
    const probe = await execInDokployContainer(target, "true", { timeoutMs: 20_000 });
    if (probe.exitCode === 0) return true;
    if (attempt % 3 === 0) await log("[stage:post-deploy] Waiting for the application to be ready...");
    await sleep(5_000);
  }
  return false;
}
