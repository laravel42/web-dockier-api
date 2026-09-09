/**
 * AI Dockerfile review layer.
 *
 * Runs *after* the mechanical `generateDockerfile()` output and, optionally,
 * asks an LLM to review the generated Dockerfile against repository context.
 * The review is strictly best-effort: any failure, timeout, invalid response,
 * or rejected revision resolves to a passthrough that keeps the mechanical
 * Dockerfile unchanged. This module never throws.
 *
 * It follows the existing raw-`fetch` OpenAI convention used across
 * `backend/src/services/git-integration/domain/ai/*` (JSON mode,
 * `temperature: 0`, manual shape validation, `null` on failure).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../shared/logger.js";
import { getErrMsg } from "../../shared/utils/error-message.js";
import type { RepoConfig } from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────

/** Hard ceiling on how long we wait for the review before treating it as a skip. */
export const AI_REVIEW_TIMEOUT_MS = 20_000;
/** Output token budget for the review response. */
export const AI_REVIEW_MAX_TOKENS = 4096;
/** Manifest content is truncated to this many characters before being sent. */
export const MAX_MANIFEST_CHARS = 6_000;
/** Maximum number of file-tree entries included as context. */
export const MAX_TREE_ENTRIES = 120;
/** Revisions shorter than this fraction of the original are rejected (suspected truncation). */
export const MIN_REVISION_RATIO = 0.5;

/**
 * Guardrail patterns that reject a revision appearing to bake in a secret.
 * This is a defense-in-depth check, not a full secret scanner.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  /AWS_SECRET_ACCESS_KEY\s*[=:]\s*\S/i,
  /AWS_ACCESS_KEY_ID\s*[=:]\s*AKIA[0-9A-Z]{12,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  // Obvious credential assignment with a long literal value on ENV/ARG lines.
  /^\s*(?:ENV|ARG)\s+\w*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)\w*\s*[= ]\s*["']?[A-Za-z0-9/+_-]{20,}/im,
];

// ─── Types ─────────────────────────────────────────────────────────

export interface DockerfileReviewInput {
  apiKey: string;
  model: string;
  /** The mechanically generated Dockerfile. */
  dockerfile: string;
  /** Detected stack config (runtime, framework, pm, versions, features). */
  repoConfig: RepoConfig;
  /** Raw primary manifest content (package.json / composer.json / etc.), truncated. */
  manifest?: { name: string; content: string };
  /** .env.example content — variable NAMES only, never real secret files. */
  envExample?: string;
  /** Capped, filtered top-level file listing. */
  fileTree: string[];
  /** Optional request timeout override (ms). */
  timeoutMs?: number;
}

export interface DockerfileChange {
  what: string;
  why: string;
}

export interface DockerfileReviewResult {
  /** True when the AI (or a fallback) leaves the Dockerfile unchanged. */
  approved: boolean;
  /** True only when a validated revision replaced the mechanical Dockerfile. */
  revised: boolean;
  /** The Dockerfile to write — revised content when revised, else the input. */
  dockerfile: string;
  /** Structured, human-readable changes (empty when approved). */
  changes: DockerfileChange[];
  /** Populated when review was skipped or a revision was rejected. */
  skipReason?: string;
}

/** Internal OpenAI response shape (not exported). */
interface RawReviewResponse {
  approved?: boolean;
  revisedDockerfile?: string;
  changes?: Array<{ what?: string; why?: string }>;
}

// ─── OpenAI call ───────────────────────────────────────────────────

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<RawReviewResponse | null> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_completion_tokens: AI_REVIEW_MAX_TOKENS,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: unknown) {
    logger.warn(`[AI-Dockerfile] Request failed: ${getErrMsg(e)}`);
    return null;
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    logger.warn(`[AI-Dockerfile] OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  } | null;
  if (!data) return null;

  if (data.choices?.[0]?.finish_reason === "length") {
    logger.warn("[AI-Dockerfile] Response truncated — skipping revision");
    return null;
  }

  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) return null;

  try {
    return JSON.parse(text) as RawReviewResponse;
  } catch (e: unknown) {
    logger.warn(`[AI-Dockerfile] JSON parse failed: ${getErrMsg(e)}`);
    return null;
  }
}

// ─── Prompt ────────────────────────────────────────────────────────

function buildPrompt(input: DockerfileReviewInput): string {
  const { dockerfile, repoConfig, manifest, envExample, fileTree } = input;

  const features = repoConfig.features.size > 0 ? [...repoConfig.features].join(", ") : "none";
  const pmVersion = repoConfig.packageManagerVersion || "unspecified";
  const startCommand = repoConfig.startCommand || "unspecified";
  const manifestSection = manifest
    ? `**Primary manifest (${manifest.name}, truncated):**\n\`\`\`\n${manifest.content}\n\`\`\``
    : "**Primary manifest:** none found";
  const envSection = envExample && envExample.trim().length > 0 ? envExample.trim() : "none";
  const treeSection = fileTree.length > 0 ? fileTree.join("\n") : "none";

  return `You are a Docker and DevOps expert acting as a conservative validator for an
auto-generated Dockerfile. Your job is NOT to optimize, modernize, refactor, or rewrite it.
Decide whether it contains a concrete correctness, security, build, or runtime problem that
the evidence below actually supports. If it does not, approve it unchanged.

**Generated Dockerfile:**
\`\`\`
${dockerfile}
\`\`\`

**Project context:**
- Runtime: ${repoConfig.runtime}, Framework: ${repoConfig.framework || "generic"}
- Package manager: ${repoConfig.packageManager} (${pmVersion}), Runtime version: ${repoConfig.runtimeVersion || "unspecified"}
- Detected start command: ${startCommand}
- Features: ${features}
- Subdirectory: ${repoConfig.subDir || "/"}

${manifestSection}

**Environment variable names (from .env.example):**
${envSection}

**File tree (top ${fileTree.length}):**
${treeSection}

Revise ONLY to fix a genuine problem. Otherwise set "approved": true.

Revise when you see one of these concrete problems:
- Unpinned or floating base image (e.g. "FROM node:latest" or no tag) — pin to a specific version.
  A tag such as "node:22", "node:22-bookworm", or "php:8.3-fpm" is ALREADY pinned enough — leave it.
- Dependencies installed AFTER copying all source (e.g. "COPY . ." before "npm install"),
  which breaks layer caching — copy the manifest/lockfile and install first.
- Container runs as root for a long-running server AND the base image already provides a suitable
  non-root user AND switching needs no speculative file-ownership or permission changes. If correct
  ownership cannot be determined from the evidence, leave it running as root.
- Wrong or missing build/start command relative to the manifest scripts.
- Missing system package required by a native dependency that is evident in the manifest or file
  tree above. Do NOT guess native dependencies.
- Missing or incorrect EXPOSE port, when the correct port is determinable from the framework,
  manifest scripts, or project context above. Do NOT guess a port.
- A secret, token, or credential baked into a layer.

Do NOT revise for style, taste, or marginal preferences. In particular, do NOT:
- Swap equivalent commands (e.g. "npm ci || npm install" is intentional and fine — leave it).
- Re-pin or "modernize" a base image that is ALREADY pinned to a specific version.
- Reorder or reformat lines that are already correct.
- Add USER, multi-stage builds, or extra hardening to a Dockerfile that ALREADY has them.
- Add or change USER when the correct file ownership would have to be guessed.
- Invent files, scripts, ports, users, packages, or environment values that the evidence
  above does not support.

Before revising, confirm all three: (1) a specific problem exists, (2) the evidence above
supports it, (3) the change is necessary to fix that problem. If any is false, APPROVE.
A no-op, speculative, or cosmetic revision is worse than no revision.

Return ONLY valid JSON:
{
  "approved": true | false,
  "revisedDockerfile": "<full corrected Dockerfile — complete file, not a diff. Omit or empty when approved>",
  "changes": [{ "what": "short change", "why": "short reason" }]
}

CRITICAL:
- When approving, set "approved": true and leave "revisedDockerfile" empty and "changes" empty.
- When revising, revisedDockerfile MUST be a complete, valid Dockerfile starting with FROM and containing EXPOSE.
- Every entry in "changes" MUST describe a fix for a genuine problem, not a preference.
- Every modification in revisedDockerfile MUST have a matching entry in "changes" — no unlisted edits.
- Do NOT introduce secrets, tokens, or credentials.
- Preserve the detected runtime and framework intent.
- Prefer the smallest change that fixes the problem.`;
}

// ─── Validation ────────────────────────────────────────────────────

function validateRevision(original: string, revised: string): { ok: boolean; reason?: string } {
  const r = revised.trim();
  if (!r) return { ok: false, reason: "empty revision" };
  if (!/^FROM\s+/im.test(r)) return { ok: false, reason: "missing FROM" };
  if (!/^EXPOSE\s+\d+/im.test(r)) return { ok: false, reason: "missing EXPOSE" };
  if (r.length < original.length * MIN_REVISION_RATIO) return { ok: false, reason: "suspiciously short" };
  if (SECRET_PATTERNS.some((re) => re.test(r))) return { ok: false, reason: "possible secret introduced" };
  return { ok: true };
}

function sanitizeChanges(changes: RawReviewResponse["changes"]): DockerfileChange[] {
  if (!Array.isArray(changes)) return [];
  return changes
    .map((c) => ({
      what: typeof c?.what === "string" ? c.what.trim() : "",
      why: typeof c?.why === "string" ? c.why.trim() : "",
    }))
    .filter((c) => c.what.length > 0)
    .slice(0, 20);
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Review a mechanically generated Dockerfile. Never throws.
 *
 * Returns a `revised` result only when the AI proposed a change that passes
 * every validation rule. Every other outcome (approved, no key, error,
 * rejected revision) is a passthrough with the original Dockerfile.
 */
export async function aiReviewDockerfile(input: DockerfileReviewInput): Promise<DockerfileReviewResult> {
  const passthrough = (skipReason: string): DockerfileReviewResult => ({
    approved: true,
    revised: false,
    dockerfile: input.dockerfile,
    changes: [],
    skipReason,
  });

  if (!input.apiKey) return passthrough("no API key");

  const raw = await callOpenAI(
    input.apiKey,
    input.model,
    buildPrompt(input),
    input.timeoutMs ?? AI_REVIEW_TIMEOUT_MS,
  );
  if (!raw) return passthrough("AI unavailable or invalid response");

  // Approved as-is, or no revision offered.
  if (raw.approved === true || !raw.revisedDockerfile) {
    return {
      approved: true,
      revised: false,
      dockerfile: input.dockerfile,
      changes: sanitizeChanges(raw.changes),
    };
  }

  // No-op revision: the model returned content identical to the original
  // (sometimes with approved:false). Treat it as an approval, not a change,
  // so logs never claim a non-existent improvement.
  if (raw.revisedDockerfile.trim() === input.dockerfile.trim()) {
    return { approved: true, revised: false, dockerfile: input.dockerfile, changes: [] };
  }

  const check = validateRevision(input.dockerfile, raw.revisedDockerfile);
  if (!check.ok) return passthrough(`revision rejected: ${check.reason}`);

  return {
    approved: false,
    revised: true,
    dockerfile: raw.revisedDockerfile.trim() + "\n",
    changes: sanitizeChanges(raw.changes),
  };
}

// ─── Context-gathering helpers ─────────────────────────────────────
// Used by the pipeline to assemble review context. Kept here so
// build-pipeline.ts stays thin. These read only non-secret files.

/** Directories/files skipped when listing the tree for context. */
const TREE_SKIP = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".turbo",
  "vendor", "__pycache__", ".venv", "venv", ".cache", ".pnpm-store", "coverage",
]);

/** Manifest filename(s) to read per runtime, in priority order. */
const MANIFEST_BY_RUNTIME: Record<string, string[]> = {
  node: ["package.json"],
  php: ["composer.json"],
  python: ["pyproject.toml", "requirements.txt", "Pipfile"],
  go: ["go.mod"],
};

function appDir(repoDir: string, repoConfig: RepoConfig): string {
  return repoConfig.subDir ? join(repoDir, repoConfig.subDir) : repoDir;
}

/**
 * Read the primary dependency manifest for the detected runtime, truncated.
 * Returns undefined if none is found.
 */
export function readPrimaryManifest(
  repoDir: string,
  repoConfig: RepoConfig,
): { name: string; content: string } | undefined {
  const candidates = MANIFEST_BY_RUNTIME[repoConfig.runtime] ?? [];
  const dir = appDir(repoDir, repoConfig);
  for (const name of candidates) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf-8");
      return { name, content: raw.slice(0, MAX_MANIFEST_CHARS) };
    } catch {
      // Unreadable manifest is non-fatal — skip it.
    }
  }
  return undefined;
}

/**
 * Read `.env.example` (variable names) if present. Never reads `.env`.
 */
export function readEnvExample(repoDir: string): string | undefined {
  for (const dir of [repoDir]) {
    const path = join(dir, ".env.example");
    if (!existsSync(path)) continue;
    try {
      return readFileSync(path, "utf-8").slice(0, MAX_MANIFEST_CHARS);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Shallow, filtered listing of the repo root (and subDir when set), capped.
 */
export function listTopLevelFiles(repoDir: string, cap: number = MAX_TREE_ENTRIES): string[] {
  const out: string[] = [];

  const listDir = (dir: string, prefix: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= cap) return;
      if (TREE_SKIP.has(entry) || entry.startsWith(".git")) continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      out.push(prefix + entry + (isDir ? "/" : ""));
    }
  };

  listDir(repoDir, "");
  return out.slice(0, cap);
}
