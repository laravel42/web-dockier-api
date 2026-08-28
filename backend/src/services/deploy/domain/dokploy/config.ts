/**
 * Dokploy configuration validation.
 *
 * Centralizes the "is the Dokploy provider correctly configured?" check so it
 * can fail fast — at server boot and at pipeline entry — with a single, clear
 * message rather than surfacing an opaque error deep inside a provisioning
 * stage after a deployment has already flipped to "building".
 */

import { env } from "../../../../shared/config.js";

export interface DokployConfigIssue {
  key: string;
  message: string;
}

/**
 * Collect configuration problems for the Dokploy deploy provider.
 * Returns an empty array when configuration is complete.
 *
 * `DOKPLOY_SSH_KEY_ID` is required because every deploy auto-provisions a VPS
 * that must be registered in Dokploy with a known SSH key; without it the
 * provision stage cannot register the server.
 */
export function collectDokployConfigIssues(): DokployConfigIssue[] {
  const issues: DokployConfigIssue[] = [];

  if (!env.DOKPLOY_API_URL) {
    issues.push({
      key: "DOKPLOY_API_URL",
      message: "DOKPLOY_API_URL is not set. Set it to the base URL of your Dokploy instance (e.g. https://dokploy.example.com/api).",
    });
  }

  if (!env.DOKPLOY_API_TOKEN) {
    issues.push({
      key: "DOKPLOY_API_TOKEN",
      message: "DOKPLOY_API_TOKEN is not set. Set it to a valid Dokploy API token.",
    });
  }

  if (!env.DOKPLOY_SSH_KEY_ID) {
    issues.push({
      key: "DOKPLOY_SSH_KEY_ID",
      message: "DOKPLOY_SSH_KEY_ID is not set. It is required to register auto-provisioned VPS instances as Dokploy remote servers. Create an SSH key in Dokploy → Settings → SSH Keys and use its id.",
    });
  }

  return issues;
}

/**
 * Throw a single, actionable error if the Dokploy provider is misconfigured.
 * No-op when DEPLOY_PROVIDER is not "dokploy".
 */
export function assertDokployConfigured(): void {
  if (env.DEPLOY_PROVIDER !== "dokploy") return;

  const issues = collectDokployConfigIssues();
  if (issues.length === 0) return;

  const detail = issues.map((i) => `  - ${i.message}`).join("\n");
  throw new Error(
    `DEPLOY_PROVIDER is set to "dokploy" but the Dokploy configuration is incomplete:\n${detail}`,
  );
}

/**
 * Log Dokploy config problems at startup without crashing the process.
 * Deployments will still fail fast at pipeline entry via `assertDokployConfigured`,
 * but this surfaces the misconfiguration early where an operator will see it.
 */
export function warnIfDokployMisconfigured(log: (msg: string) => void): void {
  if (env.DEPLOY_PROVIDER !== "dokploy") return;

  const issues = collectDokployConfigIssues();
  if (issues.length === 0) return;

  log(
    `[dokploy] DEPLOY_PROVIDER=dokploy but configuration is incomplete — deployments will fail until fixed:\n` +
    issues.map((i) => `  - ${i.message}`).join("\n"),
  );
}
