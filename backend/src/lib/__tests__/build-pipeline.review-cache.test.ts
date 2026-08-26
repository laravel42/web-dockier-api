/**
 * AI Dockerfile review cache — integration behavior through analyzeAndGenerate.
 *
 * The cache is silent, best-effort infrastructure: if it breaks, nothing fails,
 * the system just quietly pays for a second OpenAI call and the deploy may build
 * a Dockerfile the user was never shown. These tests pin the behavior that makes
 * the pre-deploy preview binding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextualLogger } from "../logging.js";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    OPENAI_API_KEY: "sk-test" as string | undefined,
    OPENAI_MODEL: "gpt-4o-mini",
    AI_DOCKERFILE_REVIEW: "on" as "on" | "off",
  },
}));

vi.mock("../../shared/config.js", () => ({ env: mockEnv }));
vi.mock("../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { analyzeAndGenerate } = await import("../build-pipeline.js");
const { clearReviewCache, reviewCacheKey } = await import("../repo-analyzer/review-cache.js");
const { createRepoConfig } = await import("../repo-analyzer/types.js");

const noopLogger: ContextualLogger = {
  info: async () => {},
  success: async () => {},
  warn: async () => {},
  error: async () => {},
  section: async () => {},
};

/** Minimal successful OpenAI chat-completion envelope. */
function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(body) }, finish_reason: "stop" }],
    }),
  } as unknown as Response;
}

// ─── Key derivation ────────────────────────────────────────────────

describe("reviewCacheKey", () => {
  const base = {
    commitHash: "abc123",
    model: "gpt-4o-mini",
    dockerfile: "FROM node:20\nEXPOSE 3000\n",
    repoConfig: createRepoConfig({ runtime: "node", framework: "nextjs" }),
  };

  it("returns null without a commit hash so caching is disabled rather than unsafe", () => {
    expect(reviewCacheKey({ ...base, commitHash: "" })).toBeNull();
  });

  it("is stable for identical inputs", () => {
    expect(reviewCacheKey(base)).toBe(reviewCacheKey({ ...base }));
  });

  it("is insensitive to Set insertion order in features", () => {
    const a = createRepoConfig({ runtime: "node", features: new Set(["prisma", "tailwind"]) });
    const b = createRepoConfig({ runtime: "node", features: new Set(["tailwind", "prisma"]) });
    expect(reviewCacheKey({ ...base, repoConfig: a })).toBe(reviewCacheKey({ ...base, repoConfig: b }));
  });

  it.each([
    ["commit", { commitHash: "def456" }],
    ["model", { model: "gpt-5.4-mini" }],
    ["dockerfile", { dockerfile: "FROM node:22\nEXPOSE 3000\n" }],
    ["repoConfig", { repoConfig: createRepoConfig({ runtime: "php", framework: "laravel" }) }],
  ])("changes when the %s changes", (_label, override) => {
    expect(reviewCacheKey({ ...base, ...override })).not.toBe(reviewCacheKey(base));
  });
});

// ─── Integration ───────────────────────────────────────────────────

describe("analyzeAndGenerate — review cache", () => {
  let dirs: string[];
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Minimal Node project so generateDockerfile produces a real Dockerfile. */
  function newRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "review-cache-test-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "sample", scripts: { start: "node index.js" } }),
    );
    dirs.push(dir);
    return dir;
  }

  beforeEach(async () => {
    dirs = [];
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockEnv.OPENAI_API_KEY = "sk-test";
    mockEnv.AI_DOCKERFILE_REVIEW = "on";
    await clearReviewCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("reuses an approved review for the same commit, making one OpenAI call", async () => {
    fetchMock.mockResolvedValue(okResponse({ approved: true, changes: [] }));

    const first = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "deadbeef", capture: true });
    const second = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "deadbeef", capture: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second.aiReviewed).toBe(true);
    expect(second.finalDockerfile).toBe(first.finalDockerfile);
  });

  it("replays a revision verbatim, even when a fresh call would have approved instead", async () => {
    // Derive the revision from the real mechanical output so it clears
    // validateRevision()'s minimum-length floor.
    mockEnv.OPENAI_API_KEY = undefined;
    const mechanical = (await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, capture: true })).finalDockerfile!;
    mockEnv.OPENAI_API_KEY = "sk-test";

    const changes = [{ what: "Added non-root USER", why: "container ran as root" }];
    fetchMock.mockResolvedValueOnce(
      okResponse({ approved: false, revisedDockerfile: mechanical.trimEnd() + "\nUSER node\n", changes }),
    );
    // Any second call would approve — proves the cache short-circuited it.
    fetchMock.mockResolvedValue(okResponse({ approved: true, changes: [] }));

    const first = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "cafe1234", capture: true });
    const second = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "cafe1234", capture: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.aiRevised).toBe(true);
    expect(second.aiRevised).toBe(true);
    expect(second.finalDockerfile).toBe(first.finalDockerfile);
    expect(second.reviewChanges).toEqual(changes);
  });

  it("does not cache a failed review, so a deploy retries after a failed preview", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    fetchMock.mockResolvedValue(okResponse({ approved: true, changes: [] }));

    const first = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "f00d", capture: true });
    const second = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "f00d", capture: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.reviewSkipReason).toBeTruthy();
    expect(second.reviewSkipReason).toBeFalsy();
  });

  it("does not cache a rejected revision", async () => {
    // Too short to pass validateRevision() — a skipReason result, not a settled one.
    fetchMock.mockResolvedValue(
      okResponse({ approved: false, revisedDockerfile: "FROM node:20\nEXPOSE 3000\n", changes: [] }),
    );

    await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "beef", capture: true });
    const second = await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "beef", capture: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.aiRevised).toBe(false);
  });

  it("does not share a review across different commits", async () => {
    fetchMock.mockResolvedValue(okResponse({ approved: true, changes: [] }));

    await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "aaa1" });
    await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger, commitHash: "bbb2" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is disabled when no commit hash is supplied", async () => {
    fetchMock.mockResolvedValue(okResponse({ approved: true, changes: [] }));

    await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger });
    await analyzeAndGenerate({ repoDir: newRepo(), logger: noopLogger });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
