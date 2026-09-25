import type { RepoConfig } from "./types.js";
import { detectSubDir } from "./detect-subdir.js";
import { analyzeNodeProject } from "./analyzers/node.js";
import { analyzePhpProject } from "./analyzers/php.js";
import { analyzePythonProject } from "./analyzers/python.js";
import { analyzeGoProject } from "./analyzers/go.js";
import { generateNodeDockerfile } from "./dockerfiles/node.js";
import { generatePhpDockerfile } from "./dockerfiles/php.js";
import { generatePythonDockerfile } from "./dockerfiles/python.js";
import { generateGoDockerfile } from "./dockerfiles/go.js";
import { finalizeNodeVersion } from "./utils.js";
import type { RepoFiles } from "./repo-files.js";
import { joinPath } from "./repo-files.js";
import { DiskRepoFiles } from "./repo-files-disk.js";

// Re-export everything for public API
export type { DetectedStack, RepoConfig, NativeDep, DockerFix } from "./types.js";
export type { RepoFiles } from "./repo-files.js";
export { MapRepoFiles } from "./repo-files.js";
export { DiskRepoFiles } from "./repo-files-disk.js";
export { configSummary } from "./utils.js";
export { resolvePhpVersion } from "./dockerfiles/php.js";
export { patchDockerfile } from "./docker-fixer.js";
export { buildWithRailpack, isRailpackAvailable, buildWithNixpacks, isNixpacksAvailable } from "./builders.js";
export type { CliBuildResult, RailpackBuildResult, NixpacksBuildResult } from "./builders.js";

function emptyRepoConfig(): RepoConfig {
  return {
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
}

/**
 * Analyze a repository from any file source (disk or fetched), producing a
 * RepoConfig. This is the filesystem-agnostic core: both the native pipeline
 * (via a cloned directory) and the Dokploy pipeline (via fetched files) run it.
 */
export function analyzeRepoFiles(files: RepoFiles): RepoConfig {
  const config = emptyRepoConfig();

  const subDir = detectSubDir(files);
  config.subDir = subDir;
  const appDir = subDir; // repo-root-relative; "" means root

  const inApp = (name: string) => joinPath(appDir, name);

  if (files.exists(inApp("package.json"))) analyzeNodeProject(files, appDir, config);
  if (files.exists(inApp("composer.json"))) analyzePhpProject(files, appDir, config);
  if (files.exists(inApp("requirements.txt")) || files.exists(inApp("pyproject.toml")) || files.exists(inApp("Pipfile")) || files.exists(inApp("manage.py"))) {
    analyzePythonProject(files, appDir, config);
  }
  if (files.exists(inApp("go.mod"))) analyzeGoProject(files, appDir, config);

  for (const f of [".nvmrc", ".node-version"]) {
    const raw = files.read(inApp(f));
    if (raw === null) continue;
    const v = raw.trim().replace(/^v/, "");
    if (v && /^\d+/.test(v)) config.nodeVersion = v.split(".")[0];
  }

  finalizeNodeVersion(config);

  return config;
}

/**
 * Analyze a cloned repository directory (native pipeline). Thin wrapper over
 * analyzeRepoFiles backed by the filesystem.
 */
export function analyzeRepoConfig(repoDir: string): RepoConfig {
  return analyzeRepoFiles(new DiskRepoFiles(repoDir));
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
