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
export type { RepoConfig, NativeDep, DockerFix } from "./types";
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

export function generateDockerfile(config: RepoConfig): string {
  switch (config.runtime) {
    case "node": return generateNodeDockerfile(config);
    case "php": return generatePhpDockerfile(config);
    case "python": return generatePythonDockerfile(config);
    case "go": return generateGoDockerfile(config);
    default: return generateNodeDockerfile(config);
  }
}
