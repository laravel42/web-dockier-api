/**
 * Dokploy preflight / dry-run check.
 *
 * A read-only smoke test you can run the moment Dokploy access is available,
 * to confirm the integration is correctly wired BEFORE attempting a real
 * deploy. It performs no mutations — no projects, servers, or VMs are created.
 *
 * Checks, in order:
 *   1. Config present     — DOKPLOY_API_URL / DOKPLOY_API_TOKEN / DOKPLOY_SSH_KEY_ID
 *   2. Reachability + auth — GET project.all (a harmless list query)
 *   3. SSH key resolves    — DOKPLOY_SSH_KEY_ID exists in sshKey.all and has a public key
 *
 * Usage:
 *   pnpm --filter @dockier/backend-fastify preflight:dokploy
 *
 * Exit codes:
 *   0  all checks passed (or config absent — nothing to check, explained)
 *   1  a check failed (unreachable, bad token, missing SSH key, etc.)
 */

import { initConfig, env } from "../shared/config.js";
import { collectDokployConfigIssues } from "../services/deploy/domain/dokploy/config.js";
import { DokployClient } from "../services/deploy/domain/dokploy/client.js";

type CheckStatus = "pass" | "fail" | "skip";

function line(status: CheckStatus, label: string, detail?: string): void {
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "–";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<number> {
  await initConfig();

  console.log("Dokploy preflight (read-only — no resources are created)\n");

  // ─── 1. Config ─────────────────────────────────────────────────
  console.log("Config:");
  const issues = collectDokployConfigIssues();
  if (issues.length > 0) {
    for (const issue of issues) line("fail", issue.key, issue.message);
    console.log(
      "\nDokploy is not fully configured. Set the values above in your environment " +
      "or root .env, then re-run. (If you're not using Dokploy yet, this is expected.)",
    );
    // Not a hard failure — there's simply nothing to reach yet.
    return 0;
  }
  line("pass", "DOKPLOY_API_URL", env.DOKPLOY_API_URL);
  line("pass", "DOKPLOY_API_TOKEN", "set");
  line("pass", "DOKPLOY_SSH_KEY_ID", env.DOKPLOY_SSH_KEY_ID);

  // Use a fast, low-retry client so preflight fails quickly rather than
  // waiting through the default exponential backoff.
  const client = new DokployClient({
    baseUrl: env.DOKPLOY_API_URL!,
    apiToken: env.DOKPLOY_API_TOKEN!,
    timeout: 8_000,
    maxRetries: 0,
  });
  let failed = false;

  // ─── 2. Reachability + auth ────────────────────────────────────
  console.log("\nConnectivity:");
  try {
    const projects = await client.listProjects();
    line("pass", "Reachable + authenticated", `project.all returned ${Array.isArray(projects) ? projects.length : "?"} project(s)`);
  } catch (err) {
    failed = true;
    const msg = errMsg(err);
    line("fail", "project.all", msg);
    if (/401|403|token/i.test(msg)) {
      console.log("    → Looks like an auth problem. Check DOKPLOY_API_TOKEN.");
    } else {
      console.log("    → Looks like a reachability problem. Confirm DOKPLOY_API_URL is correct and reachable from this host (public URL/tunnel if the backend is remote).");
    }
  }

  // ─── 3. SSH key resolves ───────────────────────────────────────
  console.log("\nSSH key:");
  try {
    const keys = await client.listSSHKeys();
    const match = keys.find((k) => k.sshKeyId === env.DOKPLOY_SSH_KEY_ID);
    if (!match) {
      failed = true;
      line("fail", "DOKPLOY_SSH_KEY_ID resolves", `no key with id "${env.DOKPLOY_SSH_KEY_ID}" found in Dokploy`);
      const available = keys.map((k) => `${k.name} (${k.sshKeyId})`).join(", ") || "(none)";
      console.log(`    → Available keys: ${available}`);
    } else if (!match.publicKey) {
      failed = true;
      line("fail", "SSH key has public material", `key "${match.name}" has no public key`);
    } else {
      line("pass", "DOKPLOY_SSH_KEY_ID resolves", `"${match.name}" with usable public key`);
    }
  } catch (err) {
    failed = true;
    line("fail", "sshKey.all", errMsg(err));
  }

  console.log("");
  if (failed) {
    console.log("Preflight FAILED — fix the items above before deploying.");
    return 1;
  }
  console.log("Preflight PASSED — Dokploy is reachable, authenticated, and the SSH key resolves.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Preflight crashed:", err);
    process.exit(1);
  });
