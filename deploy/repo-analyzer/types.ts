export interface RepoConfig {
  runtime: "node" | "php" | "python" | "go" | "ruby" | "java" | "rust" | "dotnet" | "unknown";
  runtimeVersion: string;
  packageManager: "pnpm" | "yarn" | "npm" | "bun" | "composer" | "pip" | "go" | "cargo" | "bundle" | "unknown";
  packageManagerVersion: string;
  framework: string;
  frameworkVersion: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  nodeVersion: string;
  hasStandalone: boolean;
  nativeDeps: NativeDep[];
  nextConfig: { output?: string; experimental?: Record<string, unknown> };
  phpVersion: string;
  phpExtensions: string[];
  composerScripts: string[];
  pythonVersion: string;
  goVersion: string;
  subDir: string;
  features: Set<string>;
}

export interface NativeDep {
  name: string;
  aptPackages: string[];
  alpinePackages: string[];
  reason: string;
}

export interface DockerFix {
  patched: string;
  description: string;
}
