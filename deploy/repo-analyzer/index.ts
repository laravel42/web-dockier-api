import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "./types";
import { detectSubDir } from "./detect-subdir";
import { analyzeNodeProject } from "./analyzers/node";
import { analyzePhpProject } from "./analyzers/php";
import { analyzePythonProject } from "./analyzers/python";
import { analyzeGoProject } from "./analyzers/go";
import { generateNodeDockerfile } from "./dockerfiles/node";
import { generatePhpDockerfile } from "./dockerfiles/php";
import { generatePythonDockerfile } from "./dockerfiles/python";
import { generateGoDockerfile } from "./dockerfiles/go";

// Re-export everything for public API
export type { DetectedStack, RepoConfig, NativeDep, DockerFix } from "./types";
export { configSummary } from "./utils";
export { patchDockerfile } from "./docker-fixer";
export { buildWithRailpack, isRailpackAvailable, buildWithNixpacks, isNixpacksAvailable } from "./builders";
export type { RailpackBuildResult, NixpacksBuildResult } from "./builders";

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

  return config;
}

/** Convert a RepoConfig to the discriminated-union DetectedStack type. */
export function toDetectedStack(config: RepoConfig): import("./types").DetectedStack {
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

function normalizeNodeFramework(
  framework: string,
): "nextjs" | "nuxt" | "sveltekit" | "spa" | "angular" | "astro" | "generic" {
  switch (framework) {
    case "nextjs": case "nuxt": case "sveltekit": case "spa":
    case "angular": case "astro": case "generic":
      return framework;
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
