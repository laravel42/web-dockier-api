/**
 * Shared build pipeline steps: clone → analyze → generate Dockerfile.
 *
 * Used by both the deploy processor (pipeline.ts) and the image-builder
 * (source-bundler.ts). Each service provides its own logger implementation
 * so logging goes to the right destination.
 */

import { join } from "node:path";
import { buildCloneUrl } from "./git-url";
import { analyzeRepoConfig, generateDockerfile, configSummary, toDetectedStack } from "./repo-analyzer";
import type { RepoConfig, DetectedStack } from "./repo-analyzer/types";
import type { ContextualLogger } from "./logging";
import { BuildError } from "./logging";

// ─── Constants ─────────────────────────────────────────────────────

/** Standard .dockerignore entries shared across all pipeline consumers. */
export const DEFAULT_DOCKERIGNORE = [
  "node_modules", ".next", ".git", ".gitignore", "dist", "build", "out", "output",
  ".turbo", ".cache", ".pnpm-store", "/vendor", ".env", "*.log", "!.env.example",
  "coverage", ".nyc_output", "__pycache__", "*.pyc", ".venv", "venv",
  "*.md", "*.mdx", "LICENSE", ".vscode", ".idea", ".cursor",
  "Dockerfile*", ".dockerignore", "pulumi", ".pulumi-state",
].join("\n");

// ─── Types ─────────────────────────────────────────────────────────

export interface CloneOptions {
  /** Git clone URL or components to build one */
  git: {
    provider: string;
    token: string;
    repo: string;
    endpoint?: string;
  };
  branch: string;
  /** Short identifier for temp directory naming */
  shortId: string;
  logger: ContextualLogger;
}

export interface CloneResult {
  repoDir: string;
  workDir: string;
  commitHash: string;
}

export interface AnalyzeOptions {
  repoDir: string;
  logger: ContextualLogger;
  /** If true, skip Dockerfile generation when one already exists */
  skipExistingDockerfile?: boolean;
}

export interface AnalyzeResult {
  repoConfig: RepoConfig;
  detectedStack: DetectedStack;
  /** Port detected from Dockerfile (generated or existing) */
  detectedPort: number;
  /** Whether a Dockerfile was generated (vs. already present) */
  dockerfileGenerated: boolean;
}

// ─── Clone Repository ──────────────────────────────────────────────

/**
 * Clone a git repository to a temporary directory.
 * Returns the repo directory path, work directory, and commit hash.
 */
export async function cloneRepo(opts: CloneOptions): Promise<CloneResult> {
  const { git, branch, shortId, logger } = opts;
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { execSync } = await import("node:child_process");

  await logger.section("Clone Repository");

  const cloneUrl = buildCloneUrl({
    provider: git.provider,
    token: git.token,
    repo: git.repo,
    endpoint: git.endpoint,
  });

  let workDir: string;
  try {
    workDir = await mkdtemp(join(tmpdir(), `build-${shortId}-`));
  } catch (err) {
    throw new BuildError("Failed to create temp directory", "clone", err);
  }

  const repoDir = join(workDir, "repo");

  try {
    execSync(
      `git clone --depth 1 --branch ${JSON.stringify(branch)} ${JSON.stringify(cloneUrl)} repo`,
      { cwd: workDir, timeout: 120_000, stdio: "pipe" },
    );
  } catch (err) {
    throw new BuildError(`Failed to clone ${git.repo}@${branch}`, "clone", err);
  }

  const commitHash = execSync("git rev-parse HEAD", { cwd: repoDir, timeout: 5_000 })
    .toString()
    .trim();

  await logger.success(`Repository cloned (commit: ${commitHash.slice(0, 8)})`);

  return { repoDir, workDir, commitHash };
}

// ─── Analyze & Generate Dockerfile ─────────────────────────────────

/**
 * Analyze a cloned repository and generate a Dockerfile + .dockerignore.
 *
 * Handles:
 * - Tech stack detection via repo-analyzer
 * - packageManager field injection for pnpm/yarn (corepack)
 * - Lockfile copying for monorepo subdirectories
 * - Dockerfile generation (or detection of existing one)
 * - .dockerignore generation
 */
export async function analyzeAndGenerate(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const { repoDir, logger, skipExistingDockerfile } = opts;
  const { existsSync, readFileSync } = await import("node:fs");
  const { readFile, writeFile, copyFile } = await import("node:fs/promises");

  await logger.section("Analyze Repository");

  // Detect tech stack
  const repoConfig = analyzeRepoConfig(repoDir);
  for (const line of configSummary(repoConfig)) {
    await logger.info(line);
  }

  // Fix packageManager field for pnpm/yarn projects (corepack requires it)
  if (repoConfig.runtime === "node" && (repoConfig.packageManager === "pnpm" || repoConfig.packageManager === "yarn")) {
    const appDir = repoConfig.subDir ? join(repoDir, repoConfig.subDir) : repoDir;
    try {
      const pkgPath = join(appDir, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (!pkg.packageManager) {
        const pmVer = repoConfig.packageManagerVersion || (repoConfig.packageManager === "pnpm" ? "10.14.0" : "4.5.0");
        pkg.packageManager = `${repoConfig.packageManager}@${pmVer}`;
        await writeFile(pkgPath, JSON.stringify(pkg, null, 2), "utf-8");
        await logger.info(`Added packageManager field: ${pkg.packageManager}`);
      }
    } catch { /* non-critical */ }

    // Copy lockfile to subdirectory if needed
    if (repoConfig.subDir) {
      const lockFiles: Record<string, string> = { pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lockb" };
      const lockFile = lockFiles[repoConfig.packageManager];
      if (lockFile && existsSync(join(repoDir, lockFile)) && !existsSync(join(appDir, lockFile))) {
        try { await copyFile(join(repoDir, lockFile), join(appDir, lockFile)); } catch { /* non-critical */ }
      }
    }
  }

  // Generate or detect Dockerfile
  let detectedPort = repoConfig.port || 3000;
  let dockerfileGenerated = false;

  const hasExistingDockerfile = existsSync(join(repoDir, "Dockerfile"));

  if (hasExistingDockerfile && skipExistingDockerfile) {
    // Use existing Dockerfile — just detect port from it
    try {
      const df = readFileSync(join(repoDir, "Dockerfile"), "utf-8");
      const exposeMatch = df.match(/EXPOSE\s+(\d+)/);
      if (exposeMatch) detectedPort = parseInt(exposeMatch[1], 10);
    } catch { /* use default port */ }
    await logger.info(`Repo already has a Dockerfile, using it as-is (port: ${detectedPort})`);
  } else {
    // Generate Dockerfile
    const df = generateDockerfile(repoConfig, repoDir);
    if (df) {
      await writeFile(join(repoDir, "Dockerfile"), df, "utf-8");
      dockerfileGenerated = true;
      const exposeMatch = df.match(/EXPOSE\s+(\d+)/);
      if (exposeMatch) detectedPort = parseInt(exposeMatch[1], 10);
    }

    const pm = repoConfig.packageManager !== "unknown" ? repoConfig.packageManager : "npm";
    await logger.success(
      `Generated Dockerfile (${repoConfig.runtime}/${repoConfig.framework || "generic"}, pm: ${pm}, subDir: ${repoConfig.subDir || "/"})`,
    );
  }

  // Generate .dockerignore if not present
  if (!existsSync(join(repoDir, ".dockerignore"))) {
    await writeFile(join(repoDir, ".dockerignore"), DEFAULT_DOCKERIGNORE, "utf-8");
  }

  const detectedStack = toDetectedStack(repoConfig);

  return { repoConfig, detectedStack, detectedPort, dockerfileGenerated };
}
