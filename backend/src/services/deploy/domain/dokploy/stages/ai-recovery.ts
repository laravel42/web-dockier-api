/**
 * Stage: AI Recovery (Dokploy AI)
 *
 * Invokes Dokploy's built-in AI to diagnose deployment failures and
 * apply fixes. This uses Dokploy's own AI integration (already configured
 * on the Dockier Dokploy account) rather than calling OpenAI directly,
 * because Dokploy AI understands its build system and container errors better.
 *
 * Non-fatal: if Dokploy AI is unavailable or cannot fix the issue,
 * returns { fixed: false } without throwing.
 */

import type { DokployClient } from "../client.js";
import { DokployError } from "../types.js";

export interface AIRecoveryResult {
  fixed: boolean;
  description: string;
}

/**
 * Invoke Dokploy AI to diagnose and fix a deployment failure.
 * Returns whether a fix was applied (for retry decision).
 */
export async function invokeDokployAI(params: {
  applicationId: string;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<AIRecoveryResult> {
  const { applicationId, client, log } = params;

  try {
    await log("[stage:ai-recovery] Triggering Dokploy AI diagnosis...");

    const result = await client.triggerAIFix(applicationId);

    if (result.applied) {
      const description = result.summary || "Applied automatic fix";
      await log(`[stage:ai-recovery] ✓ Fix applied: ${description}`);
      return { fixed: true, description };
    }

    await log("[stage:ai-recovery] Dokploy AI analyzed the issue but no fix was applied");
    return { fixed: false, description: result.summary || "No actionable fix found" };
  } catch (err) {
    // Non-fatal — AI recovery is best-effort
    const message = err instanceof DokployError
      ? `API error (${err.statusCode}): ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);

    await log(`[stage:ai-recovery] ⚠ Dokploy AI unavailable: ${message}`);
    return { fixed: false, description: `AI unavailable: ${message}` };
  }
}
