/**
 * Pipeline build stage.
 *
 * Handles Docker image construction: cache lookup, local build with
 * auto-retry/patch, or remote build via AWS CodeBuild.
 */

import { exec } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { BuildError } from "../../../../lib/logging.js";
import { patchDockerfile } from "../../../../lib/repo-analyzer/index.js";
import type { RepoConfig } from "../../../../lib/repo-analyzer/types.js";
import { buildViaCodeBuild } from "../infra/codebuild-builder.js";
import type { RunCmdFn } from "../run-cmd.js";
import type { ContextualLogger } from "../../../../lib/logging.js";
import { toAwsCredentials, type ProviderCredential } from "../../../../lib/provider-credentials.js";
import { appendLog } from "./helpers.js";
import { findCachedImage, patchDeployment } from "../deployments.js";

const execAsync = promisify(exec);

// ─── Types ─────────────────────────────────────────────────────────

export interface BuildImageParams {
  deploymentId: string;
  repoName: string;
  shortId: string;
  region: string;
  repoDir: string;
  workDir: string;
  commitHash: string;
  repoConfig: RepoConfig;
  repo: string;
  branch: string;
  deployStrategy: string;
  buildMethod?: string;
  credential: ProviderCredential;
  projectEnvVars: Array<{ name: string; value: string }>;
  techStack?: string[];
  runCmd: RunCmdFn;
  logger: ContextualLogger;
}

export interface BuildImageResult {
  actualImage: string;
  skippedBuild: boolean;
}

// ─── Build Stage ───────────────────────────────────────────────────

/**
 * Build a Docker image for the deployment.
 *
 * Stages:
 * 1. Check for a cached image from a previous deploy of the same commit
 * 2. If not cached, build via CodeBuild (remote) or local Docker CLI
 * 3. Local build retries up to 3 times with auto-patch on Dockerfile errors
 *
 * Returns the final image name/tag and whether the build was skipped.
 */
export async function buildImage(params: BuildImageParams): Promise<BuildImageResult> {
  const {
    deploymentId,
    repoName,
    shortId,
    region,
    repoDir,
    workDir,
    commitHash,
    repoConfig,
    repo,
    branch,
    deployStrategy,
    buildMethod,
    credential,
    projectEnvVars,
    techStack,
    runCmd,
    logger,
  } = params;

  const imageName = `${repoName}:${shortId}`;
  let actualImage = imageName;
  let skippedBuild = false;

  // ── Check for cached image ──
  const cachedDockerImage = await findCachedImage(repo, branch, commitHash, deploymentId);

  if (cachedDockerImage) {
    try {
      await execAsync(`docker image inspect ${JSON.stringify(cachedDockerImage)}`, { timeout: 10_000 });
      actualImage = cachedDockerImage;
      skippedBuild = true;
      await logger.info(`Reusing cached image: ${actualImage}`);
    } catch { /* not cached locally — proceed to build */ }
  }

  // ── Remote build via CodeBuild ──
  if (!skippedBuild && buildMethod === "codebuild") {
    const result = await buildViaCodeBuild({
      deploymentId,
      repoName,
      shortId,
      region,
      // CodeBuild is AWS-only; toAwsCredentials throws if this deploy is not AWS.
      awsCredentials: toAwsCredentials(credential),
      repoDir,
      workDir,
      commitHash,
      repoConfig,
      deployStrategy,
      repo,
      branch,
      envVars: projectEnvVars,
      techStack,
      appendLog,
    });
    actualImage = result.remoteImageUri;
    skippedBuild = false;
    return { actualImage, skippedBuild };
  }

  // ── Local Docker build with retry/patch ──
  if (!skippedBuild) {
    await logger.section("Build Docker Image");
    const MAX_BUILD_ATTEMPTS = 3;
    let successfulBuildOutput = "";

    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
      const buildArgs = ["build", "--platform", "linux/amd64", "-t", imageName];
      if (attempt > 1) buildArgs.push("--no-cache");
      buildArgs.push(".");
      const buildResult = await runCmd("docker", buildArgs, { cwd: repoDir });
      if (buildResult.code === 0) {
        await logger.success(`Docker image built: ${imageName}`);
        successfulBuildOutput = buildResult.output;
        break;
      }
      if (attempt < MAX_BUILD_ATTEMPTS) {
        const currentDf = await readFile(join(repoDir, "Dockerfile"), "utf-8");
        const fix = patchDockerfile(buildResult.output, currentDf);
        if (fix) {
          await logger.warn(`Build failed — auto-fixing: ${fix.description}`);
          await writeFile(join(repoDir, "Dockerfile"), fix.patched, "utf-8");
          continue;
        }
      }
      throw new BuildError(`docker build failed (exit code ${buildResult.code})`, "docker-build");
    }

    // Surface build warnings (non-fatal issues detected in the build output)
    const warnings = parseBuildWarnings(successfulBuildOutput);
    for (const warning of warnings) {
      await logger.warn(warning);
    }
  }

  // Persist the image name
  await patchDeployment(deploymentId, { docker_image: actualImage });

  return { actualImage, skippedBuild };
}

// ─── Build Warning Detection ───────────────────────────────────────

/**
 * Scan Docker build output for non-fatal issues that should be surfaced
 * as deployment warnings. Does not affect build success/failure.
 */
export function parseBuildWarnings(output: string): string[] {
  const warnings: string[] = [];

  // ── SQLSTATE / DB connection errors during build ──
  // Laravel apps may attempt DB connections during `package:discover` or
  // other artisan commands that run as Composer post-scripts. This is a
  // known anti-pattern but common — surface it so the user is aware.
  if (/SQLSTATE\[HY000\].*Connection refused/i.test(output)) {
    warnings.push(
      "Database connection attempted during image build (SQLSTATE Connection refused). " +
      "A service provider or Composer script tried to reach the database at build time. " +
      "This is non-fatal — the app will connect normally at runtime with real credentials.",
    );
  } else if (/SQLSTATE\[/i.test(output)) {
    warnings.push(
      "Database error detected during image build (SQLSTATE). " +
      "A Composer script or artisan command attempted a database operation at build time. " +
      "The app should work normally at runtime once database credentials are available.",
    );
  }

  // ── npm audit vulnerabilities ──
  // npm ci/install prints audit summary lines like "9 vulnerabilities (2 moderate, 6 high, 1 critical)"
  const auditMatch = output.match(/(\d+)\s+vulnerabilit(?:y|ies)\s*\(([^)]+)\)/);
  if (auditMatch) {
    const total = auditMatch[1];
    const breakdown = auditMatch[2];
    const hasCritical = /critical/i.test(breakdown);
    const hasHigh = /high/i.test(breakdown);
    const severity = hasCritical ? "critical" : hasHigh ? "high" : "moderate";
    warnings.push(
      `npm reported ${total} dependency vulnerabilit${total === "1" ? "y" : "ies"} (${breakdown}). ` +
      `Highest severity: ${severity}. Deployment was not blocked. Review with: npm audit`,
    );
  }

  return warnings;
}
