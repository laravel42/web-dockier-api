/**
 * Pipeline shared helpers.
 *
 * Low-level utilities used across all pipeline stages: timestamp formatting,
 * deployment log appending, status updates, and .env content parsing.
 *
 * DB writes delegate to domain functions in deployments.ts — this module
 * provides the pipeline-specific calling conventions (e.g. appendLog signature
 * expected by createDeployLogger and createStreamingRunCmd).
 */

import {
  appendDeploymentLog,
  setDeploymentStatus,
} from "./deployments.js";
import { emit } from "../../../shared/events.js";

// ─── Deployment Log ────────────────────────────────────────────────

export async function appendLog(deploymentId: string, line: string): Promise<void> {
  await appendDeploymentLog(deploymentId, line);
}

// ─── Status Update ─────────────────────────────────────────────────

export async function updateStatus(deploymentId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
  await setDeploymentStatus(deploymentId, status, extra);
}

// ─── Deploy Notification ───────────────────────────────────────────

/**
 * Emit a deploy-succeeded notification via the domain event bus.
 *
 * Encapsulates the common notification payload so callers (pipeline.ts,
 * processor.ts) don't duplicate the message construction.
 */
export function emitDeploySuccessNotification(params: {
  tenantId: string;
  deploymentId: string;
  repo: string;
  branch: string;
  commitHash?: string;
  appUrl?: string;
}): void {
  const { tenantId, deploymentId, repo, branch, commitHash, appUrl } = params;
  const message = appUrl
    ? `Deployment of ${repo} (${branch}) succeeded. App URL: ${appUrl}`
    : `Deployment of ${repo} (${branch}) succeeded.`;

  emit("notification:send", {
    tenantId,
    title: "Deployment succeeded",
    message,
    metadata: {
      kind: "deploy",
      repo,
      branch,
      commit: commitHash || undefined,
      appUrl: appUrl || undefined,
      deployId: deploymentId,
    },
  });
}

// ─── Env Parser ────────────────────────────────────────────────────

/** Check whether a line ends with an unescaped quote character. */
function endsWithUnescapedQuote(line: string, quote: string): boolean {
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith(quote)) return false;
  // Count consecutive backslashes before the quote
  let backslashes = 0;
  for (let i = trimmed.length - 2; i >= 0; i--) {
    if (trimmed[i] === "\\") backslashes++;
    else break;
  }
  // The quote is escaped if preceded by an odd number of backslashes
  return backslashes % 2 === 0;
}

/** Parse .env file content into key-value pairs, supporting multi-line quoted values. */
export function parseEnvContent(content: string): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];
  let currentKey = "";
  let currentValue = "";
  let inMultiLine = false;
  let quoteChar = "";

  for (const line of content.split("\n")) {
    if (inMultiLine) {
      if (endsWithUnescapedQuote(line, quoteChar)) {
        const trimmed = line.trimEnd();
        currentValue += "\n" + trimmed.slice(0, -1);
        vars.push({ name: currentKey, value: currentValue });
        inMultiLine = false;
      } else {
        currentValue += "\n" + line;
      }
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const name = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1);

    // Handle quoted values (may be multi-line)
    const stripped = value.trimStart();
    if ((stripped.startsWith('"') || stripped.startsWith("'")) && !stripped.endsWith(stripped[0])) {
      quoteChar = stripped[0];
      currentKey = name;
      currentValue = stripped.slice(1);
      inMultiLine = true;
      continue;
    }

    // Single-line: strip surrounding quotes
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Remove inline comments (unquoted)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(" #");
      if (commentIdx > -1) value = value.slice(0, commentIdx).trimEnd();
    }

    if (name) vars.push({ name, value });
  }

  if (inMultiLine && currentKey) {
    vars.push({ name: currentKey, value: currentValue });
  }

  return vars;
}
