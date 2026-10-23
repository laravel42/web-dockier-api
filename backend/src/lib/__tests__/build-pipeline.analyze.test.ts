import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContextualLogger } from "../logging.js";

// Mutable env stub so each test controls OPENAI_API_KEY / flag.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    OPENAI_API_KEY: undefined as string | undefined,
    OPENAI_MODEL: "gpt-4o-mini",
    AI_DOCKERFILE_REVIEW: "on" as "on" | "off",
  },
}));

vi.mock("../../shared/config.js", () => ({ env: mockEnv }));

// Silence the shared logger used inside ai-review.ts.
vi.mock("../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Imported after mocks are registered.
const { analyzeAndGenerate } = await import("../build-pipeline.js");

const noopLogger: ContextualLogger = {
  info: async () => {},
  success: async () => {},
  warn: async () => {},
  error: async () => {},
  section: async () => {},
};

describe("analyzeAndGenerate — AI review integration safety", () => {
  let repoDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "ai-review-test-"));
    // Minimal Node project so generateDockerfile produces a real Dockerfile.
    writeFileSync(
      join(repoDir, "package.json"),
      JSON.stringify({ name: "sample", scripts: { start: "node index.js" } }),
    );
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mockEnv.OPENAI_API_KEY = undefined;
    mockEnv.AI_DOCKERFILE_REVIEW = "on";
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("writes the mechanical Dockerfile and makes no OpenAI call when no API key is set", async () => {
    mockEnv.OPENAI_API_KEY = undefined;

    const result = await analyzeAndGenerate({ repoDir, logger: noopLogger });

    expect(result.dockerfileGenerated).toBe(true);
    expect(result.aiReviewed).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();

    const written = readFileSync(join(repoDir, "Dockerfile"), "utf-8");
    expect(written).toMatch(/^FROM\s+/m);
    expect(written).toMatch(/EXPOSE\s+\d+/);
  });

  it("falls back to the mechanical Dockerfile when the AI review fails (no throw)", async () => {
    mockEnv.OPENAI_API_KEY = "sk-test";
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await analyzeAndGenerate({ repoDir, logger: noopLogger });

    expect(result.dockerfileGenerated).toBe(true);
    expect(result.aiReviewed).toBe(true);
    expect(result.aiRevised).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();

    const written = readFileSync(join(repoDir, "Dockerfile"), "utf-8");
    expect(written).toMatch(/^FROM\s+/m);
    expect(written).toMatch(/EXPOSE\s+\d+/);
  });

  it("does not call the AI when the flag is off, even with an API key", async () => {
    mockEnv.OPENAI_API_KEY = "sk-test";
    mockEnv.AI_DOCKERFILE_REVIEW = "off";

    const result = await analyzeAndGenerate({ repoDir, logger: noopLogger });

    expect(result.dockerfileGenerated).toBe(true);
    expect(result.aiReviewed).toBeFalsy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(join(repoDir, "Dockerfile"))).toBe(true);
  });
});

// ─── skipDockerfile (static deploys) ───────────────────────────────
//
// A static deploy publishes build output to object storage and never builds an
// image, so generating a Dockerfile is dead weight and reviewing it is a paid
// OpenAI call for a file nothing reads. Observed in a live static deploy before
// this option existed: `✓ AI improved Dockerfile [3.8s]`.

describe("analyzeAndGenerate — skipDockerfile", () => {
  let repoDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "skip-dockerfile-test-"));
    writeFileSync(
      join(repoDir, "package.json"),
      JSON.stringify({ name: "sample", scripts: { start: "node index.js" } }),
    );
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mockEnv.OPENAI_API_KEY = undefined;
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("writes no Dockerfile and makes no OpenAI call, even with a key and the review enabled", async () => {
    mockEnv.OPENAI_API_KEY = "sk-test";
    mockEnv.AI_DOCKERFILE_REVIEW = "on";

    const result = await analyzeAndGenerate({ repoDir, logger: noopLogger, skipDockerfile: true });

    expect(existsSync(join(repoDir, "Dockerfile"))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.dockerfileGenerated).toBe(false);
    expect(result.aiReviewed).toBeFalsy();
  });

  it("still returns the repo analysis the static build depends on", async () => {
    const result = await analyzeAndGenerate({ repoDir, logger: noopLogger, skipDockerfile: true });

    // The static builder reads these: installDeps picks the package manager,
    // buildSite picks the build command from the detected stack.
    expect(result.repoConfig.runtime).toBe("node");
    expect(result.repoConfig.packageManager).toBeTruthy();
    expect(result.detectedStack).toBeTruthy();
  });

  it("writes no .dockerignore either", async () => {
    await analyzeAndGenerate({ repoDir, logger: noopLogger, skipDockerfile: true });

    expect(existsSync(join(repoDir, ".dockerignore"))).toBe(false);
  });

  it("leaves a Dockerfile the repo already had untouched", async () => {
    writeFileSync(join(repoDir, "Dockerfile"), "FROM scratch\n# mine\n");

    await analyzeAndGenerate({ repoDir, logger: noopLogger, skipDockerfile: true });

    expect(readFileSync(join(repoDir, "Dockerfile"), "utf-8")).toBe("FROM scratch\n# mine\n");
  });
});
