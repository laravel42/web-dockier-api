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
import { type Advisory, migrationsNotConfiguredAdvisory } from "../advisories.js";

/** Cap on the whole script, mirroring the native post-deploy guard. */
const MAX_SCRIPT_LENGTH = 10_000;

/**
 * Commands that Railpack's PHP `start-container.sh` already runs at container
 * startup (in the real runtime env, every deploy): `migrate`, `storage:link`,
 * and the `optimize` family — which rebuilds config/route/view/event caches.
 * Re-running these here over `docker exec` is at best redundant and at worst
 * harmful: a bare exec shell may not carry the app's runtime env, so
 * `config:cache` can bake a broken config (DB pointing at 127.0.0.1) over the
 * good one the container built at boot, producing a Bad Gateway.
 *
 * A `php artisan` command line is considered "startup-covered" if it invokes
 * one of these. Matched against the artisan sub-command token.
 */
const STARTUP_COVERED_ARTISAN = new Set([
  "migrate",
  "optimize",
  "optimize:clear",
  "config:cache",
  "config:clear",
  "route:cache",
  "route:clear",
  "view:cache",
  "view:clear",
  "event:cache",
  "event:clear",
  "storage:link",
]);

export async function stageRunPostDeploy(params: {
  projectId: string;
  /**
   * Dokploy build type for this app. When "railpack" and the app is PHP, the
   * container's own startup runs the standard Laravel release sequence, so
   * startup-covered commands are skipped here (see STARTUP_COVERED_ARTISAN).
   */
  buildType?: string;
  /** Detected primary language (used with techStack to identify PHP apps). */
  primaryLanguage?: string;
  /** Detected tech stack (used with primaryLanguage to identify PHP apps). */
  techStack?: string[];
  /** How long to keep retrying container readiness before giving up (ms). */
  readinessTimeoutMs?: number;
  /** Test seam: sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
  log: (line: string) => Promise<void>;
  /** Optional sink for user-facing advisories (see advisories.ts). */
  advise?: (advisory: Advisory) => void;
}): Promise<void> {
  const { projectId, buildType, primaryLanguage, techStack = [], log, advise } = params;
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

  // A PHP app whose builder does NOT run migrations at startup (i.e. anything
  // other than Railpack PHP) gets them ONLY from these post-deploy commands. If
  // none are configured, migrations silently never run — flag it, since projects
  // created before the default template included them are in exactly that state.
  if (isPhpApp(primaryLanguage, techStack) && !isRailpackPhp(buildType, primaryLanguage, techStack)) {
    if (!/\bartisan\s+migrate\b/.test(script)) {
      await log(
        "[stage:post-deploy] This build does not run database migrations at container startup, and no migration command is configured — migrations did NOT run.",
      );
      advise?.(migrationsNotConfiguredAdvisory());
    }
  }

  if (!script) return; // nothing configured

  if (script.length > MAX_SCRIPT_LENGTH) {
    await log("[stage:post-deploy] Post-deploy commands exceed the 10KB limit — skipping.");
    return;
  }

  // On Railpack PHP apps the container's startup already runs migrate +
  // optimize (config/route/view/event caches) against the real env. Drop any
  // command line that startup already covers, so we neither duplicate work nor
  // risk clobbering the boot-time config cache from a bare exec shell.
  const runnable = isRailpackPhp(buildType, primaryLanguage, techStack)
    ? stripStartupCovered(script)
    : script;

  // Any real work left? (ignore blank lines and `#` comments)
  const hasWork = runnable.split("\n").some((line) => {
    const l = line.trim();
    return l && !l.startsWith("#");
  });
  if (!hasWork) {
    if (isRailpackPhp(buildType, primaryLanguage, techStack) && hasNonComment(script)) {
      await log(
        "[stage:post-deploy] Migrations and cache optimization run automatically at container startup — no extra post-deploy commands to run.",
      );
    }
    return;
  }

  // From here on, run only the commands not already handled at startup.
  script = runnable;

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

/** True if the script has at least one non-blank, non-comment line. */
function hasNonComment(script: string): boolean {
  return script.split("\n").some((line) => {
    const l = line.trim();
    return l && !l.startsWith("#");
  });
}

/**
 * Detect a Railpack PHP app (the case where the container's startup already
 * runs the Laravel release sequence). Mirrors configure-app's PHP detection:
 * primaryLanguage alone is unreliable (a Laravel repo can be classified as
 * "Blade"/blank), so we also check the tech stack.
 */
function isPhpApp(primaryLanguage: string | undefined, techStack: string[]): boolean {
  const lang = (primaryLanguage ?? "").toLowerCase();
  if (lang.includes("php") || lang.includes("laravel") || lang.includes("blade")) return true;
  return techStack.some((s) => {
    const t = s.toLowerCase();
    return t.includes("php") || t.includes("laravel") || t.includes("filament") || t.includes("statamic") || t.includes("blade");
  });
}

function isRailpackPhp(buildType: string | undefined, primaryLanguage: string | undefined, techStack: string[]): boolean {
  if (buildType !== "railpack") return false;
  const lang = (primaryLanguage ?? "").toLowerCase();
  if (lang.includes("php") || lang.includes("laravel") || lang.includes("blade")) return true;
  return techStack.some((s) => {
    const t = s.toLowerCase();
    return t.includes("php") || t.includes("laravel") || t.includes("filament") || t.includes("blade");
  });
}

/**
 * Remove `php artisan <cmd>` lines whose sub-command is already run by
 * Railpack's PHP startup (see STARTUP_COVERED_ARTISAN). Non-artisan lines and
 * artisan commands NOT in the covered set (e.g. `db:seed`, `horizon:publish`)
 * are preserved, so users can still add genuinely one-off commands. Comments
 * and blank lines are passed through untouched.
 */
function stripStartupCovered(script: string): string {
  return script
    .split("\n")
    .filter((line) => {
      const l = line.trim();
      if (!l || l.startsWith("#")) return true; // keep comments/blanks
      const sub = artisanSubCommand(l);
      return !(sub && STARTUP_COVERED_ARTISAN.has(sub));
    })
    .join("\n");
}

/**
 * Extract the artisan sub-command token from a command line, or null if the
 * line isn't a `php artisan <cmd>` invocation. Tolerates a leading path/binary
 * (e.g. `/usr/bin/php artisan migrate`) and extra flags after the sub-command.
 */
function artisanSubCommand(line: string): string | null {
  // Match: (optional path)php  artisan  <subcommand>
  const m = line.match(/(?:^|\s)php\s+artisan\s+([^\s]+)/i);
  return m ? m[1].toLowerCase() : null;
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
