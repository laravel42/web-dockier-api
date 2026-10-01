/**
 * Standardized logging interface and typed error classes for the deploy pipeline.
 *
 * Services implement ContextualLogger to provide consistent logging regardless
 * of the underlying transport (DB-persisted logs, console, etc.).
 */

// ─── Logger Interface ──────────────────────────────────────────────

import { logger } from "../shared/logger.js";

/**
 * A logger that can be threaded through pipeline steps.
 * Deploy service writes to DB (user-visible), image-builder writes to console.
 */
export interface ContextualLogger {
  info(message: string): Promise<void> | void;
  success(message: string): Promise<void> | void;
  warn(message: string): Promise<void> | void;
  error(message: string): Promise<void> | void;
  /**
   * Start a new log section.
   *
   * `stageId` tags the section with a `[stage:<id>]` marker that the frontend
   * deploy timeline parses. Omit it for sections that are informational only —
   * an untagged section is still a readable header, it just doesn't advance the
   * timeline.
   */
  section(title: string, stageId?: string): Promise<void> | void;
}

/**
 * Stage ids for the native pipeline (CloudFormation/Pulumi), emitted as
 * `[stage:<id>]` markers in the deploy log.
 *
 * This is a contract with the frontend: `DeployWizard/steps/StepDeploy.tsx`
 * renders its timeline from these markers. Renaming one without updating the
 * frontend's stage list leaves that step permanently pending, which is exactly
 * how the timeline came to show Dokploy's stages for a static deploy. The
 * Dokploy pipeline has its own separate vocabulary — see `DOKPLOY_STAGE` below.
 */
export const NATIVE_STAGE = {
  CLONE: "clone",
  ANALYZE: "analyze",
  /** Static only: install deps and run the site build. */
  BUILD_SITE: "build-site",
  /** Static only: sync the built output to object storage. */
  UPLOAD: "upload",
  /** Static only: provision the CDN distribution. */
  CDN: "cdn",
  /** Container builds: build the image. */
  BUILD_IMAGE: "build-image",
  /** Container builds: provision compute. */
  PROVISION: "provision",
  /** Shared: confirm the deployed app actually answers. */
  VERIFY: "verify",
} as const;

export type NativeStageId = (typeof NATIVE_STAGE)[keyof typeof NATIVE_STAGE];

/**
 * Stage ids for the Dokploy pipeline, emitted as `[stage:<id>]` markers in the
 * deploy log by `deploy/domain/dokploy/stages/*` and `dokploy/pipeline.ts`.
 *
 * Same contract warning as `NATIVE_STAGE`: the frontend deploy timeline
 * (`DeployWizard/steps/deployStages.ts`) renders itself from these markers, so
 * renaming one without updating the frontend's stage list leaves that step
 * permanently pending. The frontend timeline is deliberately a SUBSET of this
 * vocabulary — `POST_DEPLOY`, `AI_RECOVERY`, `NETWORK`, `DOMAINS` and
 * `PROVISION_DATABASES` are logged for the user but are not timeline steps.
 */
export const DOKPLOY_STAGE = {
  /** Map the tenant onto a Dokploy project. */
  ENSURE_PROJECT: "ensure-project",
  /** Prepare the git provider credentials Dokploy will clone with. */
  SYNC_GIT: "sync-git",
  /** Ensure a remote server is registered and healthy. */
  PROVISION_SERVER: "provision-server",
  /** Create any databases the app declared. */
  PROVISION_DATABASES: "provision-databases",
  /** Create/configure the Dokploy application (build type, env, git source). */
  CONFIGURE_APP: "configure-app",
  /** Trigger the deploy and poll it to completion. */
  DEPLOY: "deploy",
  /** Run the project's user-defined post-deploy commands. */
  POST_DEPLOY: "post-deploy",
  /** Dokploy's built-in AI diagnosing a failed deploy before a retry. */
  AI_RECOVERY: "ai-recovery",
  /** Apply the project's network/service links. */
  NETWORK: "network",
  /** Attach the project's domains. */
  DOMAINS: "domains",
  /** Shared with the native pipeline: confirm the deployed app answers. */
  VERIFY: "verify",
} as const;

export type DokployStageId = (typeof DOKPLOY_STAGE)[keyof typeof DOKPLOY_STAGE];

/**
 * Every stage id either pipeline can emit, deduplicated (`verify` is shared).
 * Exists so the marker contract can be asserted in one place.
 */
export const ALL_STAGE_IDS: readonly string[] = [
  ...new Set<string>([...Object.values(NATIVE_STAGE), ...Object.values(DOKPLOY_STAGE)]),
];

/** Format a stage marker for inclusion in a raw log line. */
export function stageMarker(stageId: string): string {
  return `[stage:${stageId}]`;
}

// ─── Logger Implementations ────────────────────────────────────────

import { logTimestamp } from "../shared/utils/time.js";

/**
 * DB-persisted logger used by the deploy service.
 * Writes timestamped lines to the deployments.logs column.
 */
export function createDeployLogger(
  appendLog: (deploymentId: string, line: string) => Promise<void>,
  deploymentId: string,
): ContextualLogger {
  return {
    async info(message: string) {
      await appendLog(deploymentId, `[${logTimestamp()}] ℹ ${message}`);
    },
    async success(message: string) {
      await appendLog(deploymentId, `[${logTimestamp()}] ✓ ${message}`);
    },
    async warn(message: string) {
      await appendLog(deploymentId, `[${logTimestamp()}] ⚠ ${message}`);
    },
    async error(message: string) {
      await appendLog(deploymentId, `[${logTimestamp()}] ✗ ${message}`);
    },
    async section(title: string, stageId?: string) {
      await appendLog(deploymentId, `[${logTimestamp()}]`);
      const marker = stageId ? `${stageMarker(stageId)} ` : "";
      await appendLog(deploymentId, `[${logTimestamp()}] ${marker}── ${title} ───────────────`);
    },
  };
}

/**
 * Console logger used by the image-builder service.
 * Routes structured messages through the shared pino logger so server-side
 * observability output matches the rest of the app.
 */
export function createConsoleLogger(context?: string): ContextualLogger {
  const prefix = context ? `[${context}] ` : "";
  return {
    info(message: string) {
      logger.info(`${prefix}${message}`);
    },
    success(message: string) {
      logger.info(`${prefix}✓ ${message}`);
    },
    warn(message: string) {
      logger.warn(`${prefix}⚠ ${message}`);
    },
    error(message: string) {
      logger.error(`${prefix}✗ ${message}`);
    },
    // stageId is deliberately ignored: these logs go to the server console, not
    // the user-visible deploy timeline.
    section(title: string, _stageId?: string) {
      logger.info(`${prefix}── ${title} ──`);
    },
  };
}

// ─── Typed Error Classes ───────────────────────────────────────────

/**
 * Error during the build phase (clone, analyze, Dockerfile generation, docker build).
 */
export class BuildError extends Error {
  public readonly phase: "clone" | "analyze" | "dockerfile" | "docker-build" | "bundle";

  constructor(message: string, phase: BuildError["phase"], cause?: unknown) {
    super(message, { cause });
    this.name = "BuildError";
    this.phase = phase;
  }
}

/**
 * Error during infrastructure provisioning (Pulumi, CloudFormation, etc.).
 */
export class ProvisionError extends Error {
  public readonly provider: string;
  public readonly resource?: string;

  constructor(message: string, provider: string, resource?: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ProvisionError";
    this.provider = provider;
    this.resource = resource;
  }
}
