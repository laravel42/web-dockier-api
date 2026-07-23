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
  section(title: string): Promise<void> | void;
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
    async section(title: string) {
      await appendLog(deploymentId, `[${logTimestamp()}]`);
      await appendLog(deploymentId, `[${logTimestamp()}] ── ${title} ───────────────`);
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
    section(title: string) {
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
