// ─── Stack Detection Orchestrator ───
// Delegates to the unified deploy/repo-analyzer module for stack detection
// and Dockerfile generation, while preserving the existing public API surface.

import type { DetectedStack } from "./types";
import {
  analyzeRepoConfig,
  generateDockerfile as repoAnalyzerGenerateDockerfile,
} from "../../deploy/repo-analyzer";
import type { RepoConfig } from "../../deploy/repo-analyzer/types";

// Re-export the unified type
export type { DetectedStack } from "./types";

// Preserve existing named exports for backward compatibility
export { detectNodePM, detectSubDir } from "./helpers";
export { detectNode, nodeDockerfile } from "./node";
export { detectPhp, phpDockerfile } from "./php";
export { detectPython, pythonDockerfile } from "./python";
export { detectGo, goDockerfile } from "./go";

/**
 * Convert a legacy RepoConfig (from deploy/repo-analyzer) into the unified DetectedStack type.
 * This bridges the two type systems during migration.
 */
function repoConfigToDetectedStack(config: RepoConfig): DetectedStack {
  switch (config.runtime) {
    case "node":
      return {
        runtime: "node",
        framework: normalizeNodeFramework(config.framework),
        packageManager: config.packageManager as "npm" | "pnpm" | "yarn" | "bun",
        packageManagerVersion: config.packageManagerVersion,
        nodeVersion: config.nodeVersion || "20",
        hasStandalone: config.hasStandalone,
        isStatic: config.features.has("static"),
        subDir: config.subDir,
        port: config.port,
        nativeDeps: config.nativeDeps,
        startCommand: config.startCommand,
      };
    case "php":
      return {
        runtime: "php",
        framework: config.framework === "laravel" ? "laravel" : "generic",
        phpVersion: config.phpVersion || "8.3",
        phpExtensions: config.phpExtensions,
        hasNodeAssets: config.features.has("node-assets") || false,
        subDir: config.subDir,
        port: config.port,
      };
    case "python":
      return {
        runtime: "python",
        framework: normalizePythonFramework(config.framework),
        pythonVersion: config.pythonVersion || "3.12",
        subDir: config.subDir,
        port: config.port,
      };
    case "go":
      return {
        runtime: "go",
        goVersion: config.goVersion || "1.22",
        subDir: config.subDir,
        port: config.port,
      };
    default:
      return {
        runtime: "unknown",
        subDir: config.subDir,
        port: config.port,
      };
  }
}

/** Normalize framework string from RepoConfig to the Node.js DetectedStack union */
function normalizeNodeFramework(
  framework: string,
): "nextjs" | "nuxt" | "sveltekit" | "spa" | "angular" | "astro" | "generic" {
  switch (framework) {
    case "nextjs":
    case "nuxt":
    case "sveltekit":
    case "spa":
    case "angular":
    case "astro":
    case "generic":
      return framework;
    default:
      return "generic";
  }
}

/** Normalize framework string from RepoConfig to the Python DetectedStack union */
function normalizePythonFramework(
  framework: string,
): "django" | "fastapi" | "flask" | "generic" {
  switch (framework) {
    case "django":
    case "fastapi":
    case "flask":
      return framework;
    default:
      return "generic";
  }
}

/**
 * Detect the tech stack of a repository.
 * Delegates to the unified deploy/repo-analyzer module and converts
 * the result to the unified DetectedStack type.
 */
export function detectStack(repoDir: string): DetectedStack {
  const config = analyzeRepoConfig(repoDir);
  return repoConfigToDetectedStack(config);
}

/**
 * Generate a Dockerfile for the given detected stack.
 * Delegates to the unified deploy/repo-analyzer Dockerfile generators.
 */
export function generateDockerfile(stack: DetectedStack, repoDir: string): string {
  // The repo-analyzer's generateDockerfile expects a RepoConfig.
  // Convert the DetectedStack back to a RepoConfig for the bridge.
  const config = detectedStackToRepoConfig(stack);
  return repoAnalyzerGenerateDockerfile(config, repoDir);
}

/**
 * Convert a DetectedStack back to a RepoConfig for use with the
 * repo-analyzer's generateDockerfile function.
 */
function detectedStackToRepoConfig(stack: DetectedStack): RepoConfig {
  const base: RepoConfig = {
    runtime: stack.runtime,
    runtimeVersion: "",
    packageManager: "unknown",
    packageManagerVersion: "",
    framework: "",
    frameworkVersion: "",
    buildCommand: "",
    startCommand: "",
    port: stack.port,
    nodeVersion: "",
    hasStandalone: false,
    nativeDeps: [],
    nextConfig: {},
    phpVersion: "",
    phpExtensions: [],
    composerScripts: [],
    pythonVersion: "",
    goVersion: "",
    subDir: stack.subDir,
    features: new Set(),
  };

  switch (stack.runtime) {
    case "node":
      base.framework = stack.framework;
      base.packageManager = stack.packageManager;
      base.packageManagerVersion = stack.packageManagerVersion;
      base.nodeVersion = stack.nodeVersion;
      base.hasStandalone = stack.hasStandalone;
      base.nativeDeps = stack.nativeDeps;
      base.startCommand = stack.startCommand;
      if (stack.isStatic) base.features.add("static");
      break;
    case "php":
      base.framework = stack.framework;
      base.phpVersion = stack.phpVersion;
      base.phpExtensions = stack.phpExtensions;
      if (stack.hasNodeAssets) base.features.add("node-assets");
      break;
    case "python":
      base.framework = stack.framework;
      base.pythonVersion = stack.pythonVersion;
      break;
    case "go":
      base.goVersion = stack.goVersion;
      break;
  }

  return base;
}
