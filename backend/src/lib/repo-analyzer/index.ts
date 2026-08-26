import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "./types.js";
import { detectSubDir } from "./detect-subdir.js";
import { analyzeNodeProject } from "./analyzers/node.js";
import { analyzePhpProject } from "./analyzers/php.js";
import { analyzePythonProject } from "./analyzers/python.js";
import { analyzeGoProject } from "./analyzers/go.js";
import { generateNodeDockerfile } from "./dockerfiles/node.js";
import { generatePhpDockerfile, resolvePhpVersion } from "./dockerfiles/php.js";
import { generatePythonDockerfile } from "./dockerfiles/python.js";
import { generateGoDockerfile } from "./dockerfiles/go.js";
import { finalizeNodeVersion } from "./utils.js";

// Re-export everything for public API
export type { DetectedStack, RepoConfig, NativeDep, DockerFix } from "./types.js";
export { configSummary } from "./utils.js";
export { resolvePhpVersion } from "./dockerfiles/php.js";
export { patchDockerfile } from "./docker-fixer.js";
export { buildWithRailpack, isRailpackAvailable, buildWithNixpacks, isNixpacksAvailable } from "./builders.js";
export type { CliBuildResult, RailpackBuildResult, NixpacksBuildResult } from "./builders.js";

export function analyzeRepoConfig(repoDir: string): RepoConfig {
  const config: RepoConfig = {
    runtime: "unknown",
    runtimeVersion: "",
    packageManager: "unknown",
    packageManagerVersion: "",
    framework: "",
    frameworkVersion: "",
    buildCommand: "",
    startCommand: "",
    port: 3000,
    nodeVersion: "",
    hasStandalone: false,
    nativeDeps: [],
    nextConfig: {},
    phpVersion: "",
    phpExtensions: [],
    composerScripts: [],
    pythonVersion: "",
    goVersion: "",
    subDir: "",
    features: new Set(),
  };

  const subDir = detectSubDir(repoDir);
  config.subDir = subDir;
  const appDir = subDir ? join(repoDir, subDir) : repoDir;

  if (existsSync(join(appDir, "package.json"))) analyzeNodeProject(appDir, repoDir, config);
  if (existsSync(join(appDir, "composer.json"))) analyzePhpProject(appDir, config);
  if (existsSync(join(appDir, "requirements.txt")) || existsSync(join(appDir, "pyproject.toml")) || existsSync(join(appDir, "Pipfile")) || existsSync(join(appDir, "manage.py"))) {
    analyzePythonProject(appDir, config);
  }
  if (existsSync(join(appDir, "go.mod"))) analyzeGoProject(appDir, config);

  for (const f of [".nvmrc", ".node-version"]) {
    const p = join(appDir, f);
    if (!existsSync(p)) continue;
    try {
      const v = readFileSync(p, "utf-8").trim().replace(/^v/, "");
      if (v && /^\d+/.test(v)) config.nodeVersion = v.split(".")[0];
    } catch {}
  }

  finalizeNodeVersion(config);

  return config;
}

/** Convert a RepoConfig to the discriminated-union DetectedStack type. */
export function toDetectedStack(config: RepoConfig): import("./types.js").DetectedStack {
  switch (config.runtime) {
    case "node":
      return {
        runtime: "node",
        framework: normalizeNodeFramework(config.framework),
        packageManager: config.packageManager as "npm" | "pnpm" | "yarn" | "bun",
        packageManagerVersion: config.packageManagerVersion,
        nodeVersion: config.nodeVersion || "20",
        hasStandalone: config.hasStandalone,
        isStatic: config.features.has("static-export"),
        subDir: config.subDir,
        port: config.port,
        nativeDeps: config.nativeDeps,
        startCommand: config.startCommand,
      };
    case "php":
      return {
        runtime: "php",
        framework: config.framework?.toLowerCase() === "laravel" ? "laravel" : "generic",
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

function normalizeNodeFramework(
  framework: string,
): "nextjs" | "nuxt" | "sveltekit" | "spa" | "angular" | "astro" | "generic" {
  const normalized = framework.toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  switch (normalized) {
    case "nextjs":
      return "nextjs";
    case "nuxt":
      return "nuxt";
    case "sveltekit":
      return "sveltekit";
    case "spa":
      return "spa";
    case "angular":
      return "angular";
    case "astro":
      return "astro";
    case "generic":
      return "generic";
    default:
      return "generic";
  }
}

function normalizePythonFramework(
  framework: string,
): "django" | "fastapi" | "flask" | "generic" {
  switch (framework) {
    case "django": case "fastapi": case "flask":
      return framework;
    default:
      return "generic";
  }
}

export function generateDockerfile(config: RepoConfig, repoDir?: string): string {
  switch (config.runtime) {
    case "node": return generateNodeDockerfile(config);
    case "php": return generatePhpDockerfile(config, repoDir);
    case "python": return generatePythonDockerfile(config);
    case "go": return generateGoDockerfile(config);
    default: return generateNodeDockerfile(config);
  }
}
