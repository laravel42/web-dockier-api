// ─── Unified DetectedStack Type ───
// Discriminated union on `runtime` field. Used by both Dockerfile generators and provider adapters.
// This is the canonical type — all consumers import from here.

export type DetectedStack =
  | {
      runtime: "node";
      framework: "nextjs" | "nuxt" | "sveltekit" | "spa" | "angular" | "astro" | "generic";
      packageManager: "npm" | "pnpm" | "yarn" | "bun";
      packageManagerVersion: string;
      nodeVersion: string;
      hasStandalone: boolean;
      isStatic: boolean;
      subDir: string;
      port: number;
      nativeDeps: NativeDep[];
      startCommand: string;
    }
  | {
      runtime: "php";
      framework: "laravel" | "generic";
      phpVersion: string;
      phpExtensions: string[];
      hasNodeAssets: boolean;
      subDir: string;
      port: number;
    }
  | {
      runtime: "python";
      framework: "django" | "fastapi" | "flask" | "generic";
      pythonVersion: string;
      subDir: string;
      port: number;
    }
  | {
      runtime: "go";
      goVersion: string;
      subDir: string;
      port: number;
    }
  | {
      runtime: "unknown";
      subDir: string;
      port: number;
    };

// ─── Legacy RepoConfig (kept for backward compatibility during migration) ───

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

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Create a RepoConfig with sensible defaults, overriding specific fields.
 * Use this when constructing synthetic configs (e.g. template deploys)
 * to avoid hard-coding every field and breaking when new fields are added.
 */
export function createRepoConfig(overrides: Partial<RepoConfig> = {}): RepoConfig {
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
    ...overrides,
  };
}
