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

import type { ContextualLogger } from "../../../../lib/logging.js";
import type { RepoConfig } from "../../../../lib/repo-analyzer/types.js";
import type { RunCmdFn } from "../run-cmd.js";
import type { DeployAdapter } from "../adapters/types.js";
import type { AdapterContext, ProvisionResult } from "../adapters/types.js";
import type { TemplateConfig } from "../planning/project-templates.js";
import { deriveRepoName, stackNameFor } from "../../../../lib/naming.js";
import type { PipelineInput } from "./shared.js";
import type { CloudProvider, InfraMetadata } from "../../types.js";
import type { ProviderCredential } from "../../../../lib/provider-credentials.js";

export class PipelineContext {
  // ─── Immutable inputs (set at construction) ───────────────────
  readonly event: PipelineInput;
  readonly deploymentId: string;
  readonly repoName: string;
  readonly shortId: string;
  readonly logger: ContextualLogger;
  readonly runCmd: RunCmdFn;

  // ─── Template config (set before stages if template deploy) ───
  templateConfig: TemplateConfig | null = null;

  // ─── Stage 1: Provider Credentials ────────────────────────────
  provider!: CloudProvider;
  region!: string;
  credential!: ProviderCredential;

  // ─── Stage 2: Clone ───────────────────────────────────────────
  repoDir = "";
  workDir = "";
  commitHash = "";

  // ─── Stage 3: Project Context ─────────────────────────────────
  envVars: Array<{ name: string; value: string }> = [];
  deployScript = "";
  knownPlatform = "";
  healthCheckEnabled = false;
  healthCheckUrl = "";
  /**
   * Infra recorded by this project's last successful deployment, when there is
   * one. Read so a redeploy acts on the resources the project already owns
   * instead of whatever its current repo name happens to derive to.
   */
  priorInfra: InfraMetadata | null = null;

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

  get isTemplate(): boolean {
    return this.templateConfig !== null;
  }

  get deployStrategy(): string {
    if (this.isTemplate) return this.event.deployStrategy || "vps";
    return this.event.deployStrategy || "managed";
  }

  get isStaticDeploy(): boolean {
    return this.deployStrategy === "static";
  }

  /**
   * The stack this deployment acts on.
   *
   * Prefers the name the project's last successful deployment recorded, and only
   * derives a fresh one when there is nothing to inherit. `stackNameFor` is a
   * pure function of the repo name, so deriving unconditionally means a repo
   * rename silently points the deploy at a stack that does not exist: a second
   * stack gets created, the first keeps the CDN distribution serving the live
   * domain, and nothing reports a problem.
   *
   * Must be read AFTER stageLoadProjectContext, which populates `priorInfra`.
   */
  get stackName(): string {
    return this.priorInfra?.stackName || stackNameFor(this.repoName);
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
