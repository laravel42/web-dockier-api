/**
 * Standardized logging interface and typed error classes for the deploy pipeline.
 *
 * Services implement ContextualLogger to provide consistent logging regardless
 * of the underlying transport (DB-persisted logs, console, etc.).
 */

// ─── Logger Interface ──────────────────────────────────────────────

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

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

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
      await appendLog(deploymentId, `[${ts()}] ℹ ${message}`);
    },
    async success(message: string) {
      await appendLog(deploymentId, `[${ts()}] ✓ ${message}`);
    },
    async warn(message: string) {
      await appendLog(deploymentId, `[${ts()}] ⚠ ${message}`);
    },
    async error(message: string) {
      await appendLog(deploymentId, `[${ts()}] ✗ ${message}`);
    },
    async section(title: string) {
      await appendLog(deploymentId, `[${ts()}]`);
      await appendLog(deploymentId, `[${ts()}] ── ${title} ───────────────`);
    },
  };
}

/**
 * Console logger used by the image-builder service.
 * Writes structured messages to stdout for server-side observability.
 */
export function createConsoleLogger(context?: string): ContextualLogger {
  const prefix = context ? `[${context}]` : "";
  return {
    info(message: string) {
      console.log(`${prefix} ${message}`);
    },
    success(message: string) {
      console.log(`${prefix} ✓ ${message}`);
    },
    warn(message: string) {
      console.warn(`${prefix} ⚠ ${message}`);
    },
    error(message: string) {
      console.error(`${prefix} ✗ ${message}`);
    },
    section(title: string) {
      console.log(`${prefix} ── ${title} ──`);
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
