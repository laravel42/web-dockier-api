import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { loadAwsSecretsIfConfigured } from "./load-aws-secrets.js";
import { loadCloudflareSecretsIfConfigured } from "./load-cloudflare-secrets.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Resolve the monorepo workspace root.
 */
export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

/**
 * Load gitignored env files from the repo root into process.env.
 * Does not overwrite variables already set (e.g. ECS task env, remote secrets).
 */
export function loadDockierEnvFiles(): void {
  const envPath = resolve(workspaceRoot, ".env");
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }

  const localPath = resolve(workspaceRoot, ".env.local");
  if (existsSync(localPath) && process.env.NODE_ENV !== "production") {
    loadEnv({ path: localPath, override: true });
  }
}

/**
 * Bootstrap environment: local env files, then Cloudflare or AWS secrets.
 * Call via initConfig() before importing modules that read config at load time.
 */
export async function bootstrapEnv(): Promise<void> {
  loadDockierEnvFiles();
  await loadCloudflareSecretsIfConfigured();
  await loadAwsSecretsIfConfigured();
}
