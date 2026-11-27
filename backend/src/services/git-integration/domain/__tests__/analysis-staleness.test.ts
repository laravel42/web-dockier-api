import { describe, expect, it, vi } from "vitest";

// cache.ts imports the Supabase client, which reads config at load time.
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));

const { isAnalysisStale } = await import("../cache.js");

/**
 * The decision that makes a cached repo analysis follow the repository. It is
 * read once per `repo-analyze` call, which is what Project Detail and the
 * deploy wizard both go through, so each branch below is a real behaviour:
 * a wrong `true` re-walks the repo and re-bills OpenAI on every page view, a
 * wrong `false` deploys a project with the stack it had months ago.
 */
describe("isAnalysisStale", () => {
  it("is fresh when the stored sha is the branch HEAD", () => {
    expect(isAnalysisStale("abc123", "abc123")).toBe(false);
  });

  it("is stale when the repo moved on", () => {
    expect(isAnalysisStale("abc123", "def456")).toBe(true);
  });

  it("is stale when nothing was ever stamped", () => {
    // Rows written before the stamp existed, and the analysis-less row the
    // favicon route creates on a miss. One re-analysis each, then correct.
    expect(isAnalysisStale("", "abc123")).toBe(true);
    expect(isAnalysisStale(null, "abc123")).toBe(true);
    expect(isAnalysisStale(undefined, "abc123")).toBe(true);
  });

  it("keeps the cache when HEAD cannot be established", () => {
    // getHeadCommitSha returns "" for a provider failure, an empty repo, or a
    // provider with no commit support. Re-analysing then is pure cost.
    expect(isAnalysisStale("abc123", "")).toBe(false);
    expect(isAnalysisStale("", "")).toBe(false);
  });
});
