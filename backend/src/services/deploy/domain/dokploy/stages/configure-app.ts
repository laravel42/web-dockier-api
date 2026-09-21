/**
 * Stage: Configure Application
 *
 * Creates or updates a Dokploy Application for the project.
 * Configures git source, build type, and environment variables.
 *
 * Depends on: ensure-project, sync-git, provision-server.
 */

import type { DokployClient } from "../client.js";
import type { DokployBuildType } from "../types.js";
import { getApplication, upsertApplication } from "../mappings.js";
import type { GitProviderConfig } from "./sync-git.js";

/**
 * Railpack version to pin for railpack builds. Dokploy tags the builder image
 * as `railpack-frontend:<version>`, so this must be a real published version.
 * Kept as a single constant so it's easy to bump when validating a newer
 * Railpack release.
 */
const RAILPACK_VERSION = "0.15.4";

export interface ConfigureAppResult {
  dokployApplicationId: string;
  buildType: DokployBuildType;
}

export interface RepoAnalysisInfo {
  hasDockerfile: boolean;
  isStaticSite: boolean;
  publishDirectory?: string;
  primaryLanguage?: string;
  techStack?: string[];
}

/**
 * Create or update the Dokploy Application, configure its source and build.
 */
export async function stageConfigureApp(params: {
  projectId: string;
  projectName: string;
  environmentId: string;
  serverId: string;
  gitConfig: GitProviderConfig;
  repoAnalysis: RepoAnalysisInfo;
  envVars: Array<{ name: string; value: string }>;
  client: DokployClient;
  log: (line: string) => Promise<void>;
}): Promise<ConfigureAppResult> {
  const { projectId, projectName, environmentId, serverId, gitConfig, repoAnalysis, envVars, client, log } = params;

  await log("[stage:configure-app] Checking for existing application...");

  // Check if application already exists
  let applicationId: string;
  const existing = await getApplication(projectId);

  if (existing) {
    applicationId = existing.dokployApplicationId;
    await log(`[stage:configure-app] Reusing existing application: ${applicationId}`);
  } else {
    // Create new application in Dokploy
    await log(`[stage:configure-app] Creating application "${projectName}"...`);
    const app = await client.createApplication({
      name: projectName,
      environmentId,
      serverId,
    });
    applicationId = app.applicationId;

    // Store mapping
    await upsertApplication({
      projectId,
      dokployApplicationId: applicationId,
      dokployServerId: serverId,
    });

    await log(`[stage:configure-app] Application created: ${applicationId}`);
  }

  // ─── Configure Git Source ────────────────────────────────────────
  await log(`[stage:configure-app] Configuring git source (${gitConfig.type})...`);

  switch (gitConfig.type) {
    case "github":
      await client.saveGithubProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
    case "gitlab":
      await client.saveGitlabProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
    case "custom":
      await client.saveGitProvider({
        applicationId,
        ...gitConfig.params,
      });
      break;
  }

  // ─── Configure Build Type ───────────────────────────────────────
  const buildType = determineBuildType(repoAnalysis);
  await log(`[stage:configure-app] Setting build type: ${buildType}`);

  // Dokploy's saveBuildType requires the full field set as non-optional, even
  // for build types that don't use them. Send empty-string defaults and
  // override only the fields relevant to the chosen build type.
  //
  // railpackVersion MUST be a concrete version for railpack builds: Dokploy
  // builds the frontend image tag as `railpack-frontend:<railpackVersion>`, so
  // an empty value produces `railpack-frontend:v` (v + nothing), which doesn't
  // exist in the registry and fails with "not found". Pin a known-good version.
  await client.saveBuildType({
    applicationId,
    buildType,
    dockerfile: buildType === "dockerfile" ? "./Dockerfile" : "",
    dockerContextPath: buildType === "dockerfile" ? "./" : "",
    dockerBuildStage: "",
    herokuVersion: "",
    railpackVersion: buildType === "railpack" ? RAILPACK_VERSION : "",
    publishDirectory: buildType === "static" ? (repoAnalysis.publishDirectory || "dist") : "",
    isStaticSpa: buildType === "static",
  });

  // Update stored build type
  await upsertApplication({
    projectId,
    dokployApplicationId: applicationId,
    dokployServerId: serverId,
    buildType,
  });

  // ─── Configure Environment Variables ────────────────────────────
  if (envVars.length > 0) {
    await log(`[stage:configure-app] Setting ${envVars.length} environment variables...`);
    const envString = envVars.map((v) => `${v.name}=${v.value}`).join("\n");
    await client.saveEnvironment({
      applicationId,
      env: envString,
      // Dokploy requires buildArgs/buildSecrets as non-optional; empty = none.
      buildArgs: "",
      buildSecrets: "",
      createEnvFile: true,
    });
  }

  await log(`[stage:configure-app] ✓ Application configured (build: ${buildType})`);
  return { dokployApplicationId: applicationId, buildType };
}

// ─── Build Type Detection ────────────────────────────────────────

function determineBuildType(analysis: RepoAnalysisInfo): DokployBuildType {
  // Priority 1: Existing Dockerfile
  if (analysis.hasDockerfile) return "dockerfile";

  // Priority 2: Static site
  if (analysis.isStaticSite) return "static";

  // Priority 3: Railpack-compatible languages.
  //
  // Railpack is the newer successor to Nixpacks and tracks current runtime
  // versions, so it avoids Nixpacks' stale-nixpkgs failures (e.g. Nixpacks
  // erroring with "undefined variable 'nodejs_24'" when a repo asks for a Node
  // version newer than its pinned package set). PHP is included because
  // Railpack supports it and modern PHP/Laravel apps (which pull in a Node
  // frontend build) frequently trip that Nixpacks limitation.
  const railpackLanguages = ["javascript", "typescript", "php", "ruby", "go", "rust", "python", "elixir"];
  const lang = analysis.primaryLanguage?.toLowerCase() ?? "";
  if (railpackLanguages.some((l) => lang.includes(l))) return "railpack";

  // Default: Nixpacks (zero-config, widest compatibility)
  return "nixpacks";
}
