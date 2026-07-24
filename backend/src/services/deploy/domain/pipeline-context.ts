/**
 * Typed pipeline context accumulated across deploy stages.
 *
 * Created once per pipeline execution. Each stage reads what it needs
 * and writes its results. The orchestrator passes the same instance
 * to every stage function.
 *
 * Properties use definite assignment assertions (!) for stage outputs
 * that are guaranteed to be set before downstream stages access them.
 * If a stage runs out of order, the assertion fails immediately with
 * a clear runtime error.
 */

import type { ContextualLogger } from "../../../lib/logging.js";
import type { RepoConfig } from "../../../lib/repo-analyzer/types.js";
import type { RunCmdFn } from "./run-cmd.js";
import type { DeployAdapter } from "./adapters/types.js";
import type { AdapterContext, ProvisionResult } from "./adapters/types.js";
import { deriveRepoName } from "../../../lib/naming.js";
import type { PipelineInput } from "./pipeline.js";

export class PipelineContext {
  // ─── Immutable inputs (set at construction) ───────────────────
  readonly event: PipelineInput;
  readonly deploymentId: string;
  readonly repoName: string;
  readonly shortId: string;
  readonly logger: ContextualLogger;
  readonly runCmd: RunCmdFn;

  // ─── Stage 1: Provider Credentials ────────────────────────────
  provider!: string;
  region!: string;
  credentials!: { api_key: string; api_secret: string };

  // ─── Stage 2: Clone ───────────────────────────────────────────
  repoDir!: string;
  workDir!: string;
  commitHash!: string;

  // ─── Stage 3: Project Context ─────────────────────────────────
  envVars: Array<{ name: string; value: string }> = [];
  deployScript = "";
  knownPlatform = "";

  // ─── Stage 4: Analyze ─────────────────────────────────────────
  repoConfig!: RepoConfig;

  // ─── Stage 5: Build ───────────────────────────────────────────
  actualImage!: string;
  skippedBuild = false;

  // ─── Stage 6: Provision ───────────────────────────────────────
  adapter!: DeployAdapter;
  adapterCtx!: AdapterContext;
  provision!: ProvisionResult;

  // ─── Computed ─────────────────────────────────────────────────

  get deployStrategy(): string {
    return this.event.deployStrategy || "managed";
  }

  get isStaticDeploy(): boolean {
    return this.deployStrategy === "static";
  }

  // ─── Constructor ──────────────────────────────────────────────

  constructor(event: PipelineInput, logger: ContextualLogger, runCmd: RunCmdFn) {
    this.event = event;
    this.deploymentId = event.deploymentId;
    this.repoName = deriveRepoName(event.repo);
    this.shortId = event.deploymentId.slice(0, 8);
    this.logger = logger;
    this.runCmd = runCmd;
  }
}
