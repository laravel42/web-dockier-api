/**
 * AI Dockerfile review cache.
 *
 * The pre-deploy preview and the deploy pipeline both run the same
 * generate-then-review path. Without a cache they each make an independent
 * OpenAI call, so the Dockerfile a user approves in the wizard is only
 * *probably* the one that gets built: `temperature: 0` narrows the output
 * distribution but does not make the API deterministic, and the review is
 * best-effort, so a transient timeout on one call and not the other flips
 * the outcome entirely.
 *
 * Caching the review keyed on its inputs makes the preview binding in the
 * common case and removes the duplicate API call. It is strictly an
 * optimization: a miss reproduces the uncached behavior exactly.
 *
 * Design constraints (see `shared/cache/memory-async-cache.ts`):
 *   - Async contract, so a Redis backend is a constructor swap.
 *   - Flat, JSON-serializable payload. `RepoConfig` is deliberately NOT
 *     stored — its `features` field is a `Set`, which would not survive
 *     serialization. It contributes to the KEY instead.
 *   - Expiry only. Keys derive from immutable inputs (a commit hash and a
 *     config fingerprint), so entries never need invalidating.
 */

import { createHash } from "node:crypto";
import { MemoryAsyncCache } from "../../shared/cache/memory-async-cache.js";
import { logger } from "../../shared/logger.js";
import { getErrMsg } from "../../shared/utils/error-message.js";
import type { DockerfileReviewResult } from "./ai-review.js";
import type { RepoConfig } from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────

/**
 * How long a review stays reusable. Sized for the preview-to-deploy gap in
 * a single wizard session, with headroom for a user who leaves the modal open.
 */
export const REVIEW_CACHE_TTL_MS = 30 * 60_000;

/** Entry ceiling. Each entry holds at most two Dockerfiles (a few KB). */
export const REVIEW_CACHE_MAX_ENTRIES = 200;

// ─── Store ─────────────────────────────────────────────────────────

/**
 * Cached value. Mirrors `DockerfileReviewResult`, which is already flat and
 * JSON-safe — asserted structurally so widening that type into something
 * unserializable fails to compile here.
 */
export type CachedReview = DockerfileReviewResult;

const store = new MemoryAsyncCache<CachedReview>({
  maxSize: REVIEW_CACHE_MAX_ENTRIES,
  sweepIntervalMs: 60_000,
});

// ─── Key derivation ────────────────────────────────────────────────

export interface ReviewCacheKeyInput {
  /** Commit being analyzed. Pins the manifest, .env.example, and file tree. */
  commitHash: string;
  /** Model name — a different model is a different reviewer. */
  model: string;
  /** The mechanical Dockerfile under review. */
  dockerfile: string;
  /** Detected stack, which shapes the prompt beyond the Dockerfile itself. */
  repoConfig: RepoConfig;
}

/**
 * Fingerprint the `RepoConfig` fields that actually reach the review prompt.
 * `features` is a Set, so it is sorted into a stable string — iteration order
 * would otherwise make the fingerprint depend on insertion order.
 */
function fingerprintConfig(c: RepoConfig): string {
  return [
    c.runtime,
    c.framework,
    c.runtimeVersion,
    c.packageManager,
    c.packageManagerVersion,
    c.startCommand,
    c.subDir,
    [...c.features].sort().join(","),
  ].join("|");
}

/**
 * Derive a cache key from everything the review outcome depends on.
 *
 * Returns null when there is no commit hash: without it the key cannot
 * distinguish two states of the same branch, and a stale hit would be worse
 * than no cache. Callers treat null as "caching disabled".
 */
export function reviewCacheKey(input: ReviewCacheKeyInput): string | null {
  if (!input.commitHash) return null;
  const material = [
    input.commitHash,
    input.model,
    fingerprintConfig(input.repoConfig),
    createHash("sha256").update(input.dockerfile).digest("hex"),
  ].join("\u0000");
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

// ─── Accessors ─────────────────────────────────────────────────────

/**
 * Look up a cached review. Never throws — a cache failure degrades to a miss
 * so the caller simply runs the review, matching the uncached path.
 */
export async function getCachedReview(key: string): Promise<CachedReview | undefined> {
  try {
    return await store.get(key);
  } catch (e: unknown) {
    logger.warn(`[AI-Dockerfile] Review cache read failed: ${getErrMsg(e)}`);
    return undefined;
  }
}

/**
 * Store a review outcome. Never throws.
 *
 * Only *settled* outcomes are cached — an approval or a validated revision.
 * Results carrying a `skipReason` (AI unavailable, malformed response,
 * rejected revision) are transient or input-specific failures; caching them
 * would pin a bad outcome for the whole TTL and stop the deploy from
 * retrying a review the preview happened to fail.
 */
export async function setCachedReview(key: string, review: CachedReview): Promise<void> {
  if (review.skipReason) return;
  try {
    await store.set(key, review, REVIEW_CACHE_TTL_MS);
  } catch (e: unknown) {
    logger.warn(`[AI-Dockerfile] Review cache write failed: ${getErrMsg(e)}`);
  }
}

/** Test helper — drops all entries. */
export async function clearReviewCache(): Promise<void> {
  await store.clear();
}
