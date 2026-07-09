/**
 * Pipeline shared helpers.
 *
 * Low-level utilities used across all pipeline stages: timestamp formatting,
 * deployment log appending, status updates, and .env content parsing.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";

const db = supabaseAdmin;

// ─── Timestamp ─────────────────────────────────────────────────────

export function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── Deployment Log ────────────────────────────────────────────────

export async function appendLog(deploymentId: string, line: string): Promise<void> {
  const sanitized = line.replace(/\0/g, "");
  const { data: current } = await db.from("deployments").select("logs").eq("id", deploymentId).maybeSingle();
  const updatedLogs = (current?.logs || "") + sanitized + "\n";
  await db.from("deployments").update({ logs: updatedLogs }).eq("id", deploymentId);
}

// ─── Status Update ─────────────────────────────────────────────────

export async function updateStatus(deploymentId: string, status: string, extra?: Record<string, unknown>): Promise<void> {
  await db.from("deployments").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", deploymentId);
}

// ─── Env Parser ────────────────────────────────────────────────────

/** Parse .env file content into key-value pairs, supporting multi-line quoted values. */
export function parseEnvContent(content: string): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];
  let currentKey = "";
  let currentValue = "";
  let inMultiLine = false;
  let quoteChar = "";

  for (const line of content.split("\n")) {
    if (inMultiLine) {
      if (line.endsWith(quoteChar)) {
        currentValue += "\n" + line.slice(0, -1);
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
