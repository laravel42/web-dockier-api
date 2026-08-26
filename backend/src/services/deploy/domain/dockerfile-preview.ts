/**
 * Pre-deploy Dockerfile preview (Phase 2).
 *
 * Stateless: clones the repo into a temp dir, delegates generation + optional
 * AI review to `analyzeAndGenerate` (in capture mode — the SAME code path the
 * deploy pipeline uses), maps the captured result, and always removes the temp
 * dir. Performs no database writes.
 *
 * Parity with the real deploy is structural: this file contains no generation
 * or review logic of its own.
 */

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { cloneRepo, analyzeAndGenerate } from "../../../lib/build-pipeline.js";
import { createConsoleLogger } from "../../../lib/logging.js";
import { getConnectionForTenant } from "../../../shared/service-clients/git-connections.js";
import { getProjectDeployConfig } from "../../../shared/service-clients/projects.js";
import { DeployError } from "./providers.js";

export interface PreviewDockerfileInput {
  tenantId: string;
  gitConnectionId: string;
  repo: string;
  branch: string;
  projectId?: string;
  useRepoDockerfile?: boolean;
}

export interface DockerfilePreviewResult {
  aiEnabled: boolean;
  source: "generated" | "repo";
  mechanicalDockerfile: string;
  finalDockerfile: string;
  revised: boolean;
  changes: Array<{ what: string; why: string }>;
  skipReason?: string;
  runtime: string;
  framework: string;
}

export async function previewDockerfile(input: PreviewDockerfileInput): Promise<DockerfilePreviewResult> {
  const { tenantId, gitConnectionId, repo, branch, projectId, useRepoDockerfile } = input;

  if (!gitConnectionId) {
    throw new DeployError("A git connection is required to preview a Dockerfile", "bad_request");
  }

  // Tenant-scoped credential resolution (throws forbidden/not_found).
  const conn = await getConnectionForTenant(gitConnectionId, tenantId);

  // Resolve the platform override server-side, exactly as the pipeline does.
  let knownPlatform = "";
  if (projectId) {
    const cfg = await getProjectDeployConfig(projectId);
    if (cfg?.platform) knownPlatform = cfg.platform;
  }

  const logger = createConsoleLogger("dockerfile-preview");
  const shortId = randomUUID().slice(0, 8);

  let workDir: string | undefined;
  try {
    const clone = await cloneRepo({
      git: {
        provider: conn.provider,
        token: conn.personal_token,
        repo,
        endpoint: conn.endpoint,
      },
      branch,
      shortId,
      logger,
    });
    workDir = clone.workDir;

    const result = await analyzeAndGenerate({
      repoDir: clone.repoDir,
      logger,
      knownPlatform,
      skipExistingDockerfile: !!useRepoDockerfile,
      // Seeds the review cache so the deploy that follows reuses this exact
      // outcome instead of making a second, independent OpenAI call.
      commitHash: clone.commitHash,
      capture: true,
    });

    const mechanicalDockerfile = result.mechanicalDockerfile ?? "";
    const finalDockerfile = result.finalDockerfile ?? mechanicalDockerfile;

    return {
      aiEnabled: result.aiEnabled ?? false,
      source: result.source ?? "generated",
      mechanicalDockerfile,
      finalDockerfile,
      revised: result.aiRevised ?? false,
      changes: result.reviewChanges ?? [],
      skipReason: result.reviewSkipReason,
      runtime: result.repoConfig.runtime,
      framework: result.repoConfig.framework || "generic",
    };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
