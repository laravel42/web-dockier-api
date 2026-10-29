/**
 * AI diagnosis of a failed build.
 *
 * Replaces the Dokploy AI recovery stage, which never worked: Dockier called
 * `application.aiFixDeployment`, and that procedure does not exist on the
 * Dokploy API. Verified against the live instance — it returns the byte-
 * identical 404 as a procedure name that was never implemented, while a real
 * procedure's 404 carries a `path` field. So every failed deploy logged
 * "Running automated deployment diagnosis...", got a 404, discarded it, and
 * retried unchanged.
 *
 * Dokploy does expose `ai.analyzeLogs`, but it is the wrong tool here: it
 * hardcodes its own prompt server-side, returns ~2KB of markdown that does not
 * fit the deploy log's line stream or the wizard's one-line summary, sends the
 * log tail unredacted, suggests remedies the user has no way to apply ("check
 * your CI/CD resource configuration"), and depends on an AI provider staying
 * configured inside Dokploy — the exact fragility that produced the dead stage.
 *
 * So this calls OpenAI directly, through the same raw-`fetch` convention as
 * `lib/repo-analyzer/ai-review.ts`: JSON mode, `temperature: 0`, manual shape
 * validation, never throws, `null` on any failure.
 *
 * IMPORTANT: this DIAGNOSES, it does not fix. No automated path can edit a
 * user's repository mid-deploy, which is what `aiFixDeployment` purported to
 * do. The retry in stageDeployWithRetry is kept because it genuinely rescues
 * transient failures, but it is no longer described as a retry-after-fix.
 */

import { logger } from "../../../../../shared/logger.js";
import { getErrMsg } from "../../../../../shared/utils/error-message.js";
import { env } from "../../../../../shared/config.js";
import type { RuntimeHint } from "./trigger-deploy.js";

/** Hard ceiling before the diagnosis is treated as unavailable. */
export const AI_DIAGNOSIS_TIMEOUT_MS = 20_000;

/** Output budget. Two short fields; anything longer is the model ignoring us. */
const MAX_TOKENS = 600;

/**
 * How much of the build log tail to send. The failure is almost always in the
 * last few hundred lines, and a whole log is both expensive and more likely to
 * bury the error.
 */
const MAX_LOG_CHARS = 12_000;

/**
 * Patterns redacted before the log leaves our network.
 *
 * A build log echoes env values: a failing `docker build --build-arg`, a
 * framework printing its config, a stack trace with a connection string. The
 * Dokploy route could not do this at all — it builds the prompt itself from
 * whatever it is handed.
 *
 * Shares intent with `SECRET_PATTERNS` in `lib/repo-analyzer/ai-review.ts`, but
 * matches VALUES in arbitrary log text rather than Dockerfile directives, so
 * the expressions are necessarily different.
 */
const REDACTIONS: Array<[RegExp, string]> = [
  // Private keys, in any of their PEM spellings.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]"],
  // KEY=value / KEY: value where the key names a credential.
  [/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*[=:]\s*\S+/gi, "$1=[redacted]"],
  // Credentials embedded in a URL (postgres://user:pass@host, https://x:y@git).
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s:/@]+@/gi, "$1[redacted]@"],
  // Provider key shapes that are recognisable on their own.
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted aws key id]"],
  [/\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/g, "[redacted api key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted github token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted jwt]"],
];

export interface AIDiagnosis {
  /** One line naming what failed. Goes straight into the deploy log. */
  summary: string;
  /** One line the user can act on. */
  suggestion: string;
}

/**
 * Ask a model what went wrong, from the build log tail.
 *
 * Returns null — never throws — when the key is unset, the request fails, the
 * model is unavailable, or the response does not have the expected shape. The
 * caller then falls back to the generic guidance, exactly as before.
 *
 * Only called when the deterministic classifier in `build-failure.ts` found
 * nothing: those patterns are free, exact, and already cover the failures we
 * understand. This is for the long tail.
 */
export async function diagnoseBuildFailure(params: {
  /** Build log tail (already fetched by reportBuildFailure). */
  logTail: string;
  hint?: RuntimeHint;
  /** Overridable for tests. */
  timeoutMs?: number;
}): Promise<AIDiagnosis | null> {
  const { logTail, hint, timeoutMs = AI_DIAGNOSIS_TIMEOUT_MS } = params;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const evidence = redact(logTail).slice(-MAX_LOG_CHARS).trim();
  if (evidence.length < 40) return null; // nothing to reason about

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        messages: [{ role: "user", content: buildPrompt(evidence, hint) }],
        temperature: 0,
        max_completion_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      logger.warn(`[ai-diagnosis] OpenAI ${res.status}: ${body.error?.message || res.statusText}`);
      return null;
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    return validate(JSON.parse(content) as Record<string, unknown>);
  } catch (err) {
    // Includes the timeout abort and a malformed JSON body. Non-fatal by
    // design: a deploy failure must still report its generic guidance.
    logger.warn(`[ai-diagnosis] Diagnosis unavailable: ${getErrMsg(err)}`);
    return null;
  }
}

/**
 * Accept only a response with two usable single-line strings.
 *
 * Unbounded model prose would break the deploy log's line stream and the
 * wizard's one-line summary, so length and newlines are enforced here rather
 * than hoped for from the prompt.
 */
function validate(raw: Record<string, unknown>): AIDiagnosis | null {
  const summary = oneLine(raw.summary);
  const suggestion = oneLine(raw.suggestion);
  if (!summary || !suggestion) return null;
  return { summary, suggestion };
}

function oneLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length < 8 || flat.length > 400) return null;
  return flat;
}

/** Strip credential-shaped text from a log before it leaves our network. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * The prompt.
 *
 * Constrains the remedies to things a Dockier user can actually do. The deploy
 * target is a container on a VM Dockier provisioned, reached through Traefik —
 * the user has no CI runner to reconfigure, no shell on the box, and no Dokploy
 * access. Advice outside that set is worse than none: it sends them looking for
 * controls that do not exist. (The Dokploy-hosted alternative produced exactly
 * this, suggesting `webpack-bundle-analyzer` for a Vite build.)
 */
function buildPrompt(logTail: string, hint?: RuntimeHint): string {
  const context = [
    hint?.buildType && `Builder: ${hint.buildType}`,
    hint?.framework && `Framework: ${hint.framework}`,
    hint?.kind && `App type: ${hint.kind}`,
    hint?.repoHasStartScript !== undefined && `Repo declares a start script: ${hint.repoHasStartScript}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are diagnosing a failed application build for a developer platform.

The build ran on a Linux container image built from the user's git repository and
deployed to a virtual machine behind a reverse proxy. The user can change ONLY:
their repository (source, build scripts, dependencies, Dockerfile), their
project's environment variables, and their selected server plan (more CPU/memory).

They have NO access to the build server, the container runtime, the proxy, or any
CI system. Never suggest inspecting logs, running commands on the server,
changing CI configuration, or contacting a provider — none of those are available
to them.

${context ? `Context:\n${context}\n` : ""}
Build log (tail, secrets redacted):
---
${logTail}
---

Respond with JSON only:
{
  "summary": "one sentence naming what actually failed, quoting the specific command, file or dependency from the log",
  "suggestion": "one sentence with the concrete change to make, in the repository, the environment variables, or the server plan"
}

Both values must be a single plain sentence under 300 characters, with no markdown.
If the log does not show a clear cause, say so plainly in "summary" rather than guessing.`;
}
