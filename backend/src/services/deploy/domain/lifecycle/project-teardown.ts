/**
 * Project-level infrastructure teardown.
 *
 * Infrastructure is per-project: every deployment of a project shares one
 * stack (derived deterministically via `stackNameFor`). This module resolves
 * every distinct live stack a project created and tears each one down via the
 * existing per-provider adapter `destroy()` logic — without mutating any
 * deployment record's status.
 */

import { supabaseAdmin } from "../../../../shared/supabase/client.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { env } from "../../../../shared/config.js";
import { deriveRepoName, stackNameFor, sanitizeEcrRepoName } from "../../../../lib/naming.js";
import { getProviderCredentialsSafe } from "../../../../lib/provider-credentials.js";
import { parseInfra } from "../../types.js";
import { getAdapter } from "../adapters/index.js";
import type { DestroyContext, DestroyResult } from "../adapters/types.js";
import { teardownDokployProject, type DokployTeardownResult } from "./dokploy-teardown.js";

/**
 * A distinct live stack belonging to a project, with everything needed to
 * tear it down via the appropriate adapter.
 */
export interface ResolvedStack {
  /** Cloud provider: "aws" | "gcp" */
  provider: string;
  /** Deploy strategy: "managed" | "vps" | "static" */
  deployStrategy: string;
  /** CloudFormation / Pulumi stack name */
  stackName: string;
  /** Cloud region */
  region: string;
  /** Provider credential id (server_providers.id) */
  providerId: string;
  /** Repo path (owner/name) */
  repo: string;
  /** Full tofu_script column value (Pulumi program + optional state) */
  tofuScript: string;
  /** A deployment id that references this stack (satisfies DestroyContext) */
  sampleDeploymentId: string;
}

interface DeploymentStackRow {
  id: string;
  provider_id: string | null;
  deploy_strategy: string | null;
  repo: string;
  tofu_script: string | null;
  infra: Record<string, unknown> | null;
  status: string;
}

/**
 * Resolve the set of distinct live stacks for a project.
 *
 * Reads the project's non-destroyed deployments, preferring the structured
 * `infra` metadata written on successful deploys. Legacy rows without infra
 * metadata fall back to deriving the stack name from the repo. Results are
 * deduped by `(provider, stackName)`, keeping the most recent occurrence.
 */
export async function resolveProjectStacks(projectId: string, tenantId: string): Promise<ResolvedStack[]> {
  const { data, error } = await supabaseAdmin
    .from("deployments")
    .select("id,provider_id,deploy_strategy,repo,tofu_script,infra,status")
    .eq("project_id", projectId)
    .eq("organization_id", tenantId)
    .neq("status", "destroyed")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error({ err: error, projectId }, "[teardown] Failed to query deployments for stack resolution");
    throw new Error(`Failed to resolve project stacks: ${error.message}`);
  }

  const rows = (data ?? []) as DeploymentStackRow[];
  const byKey = new Map<string, ResolvedStack>();
  // Cache provider_id → provider string for legacy rows lacking infra metadata.
  const providerCache = new Map<string, { provider: string; region: string } | null>();

  for (const row of rows) {
    const resolved = await resolveRowStack(row, providerCache);
    if (!resolved) continue;

    const key = `${resolved.provider}:${resolved.stackName}`;
    // Rows are ordered newest-first, so the first occurrence wins.
    if (!byKey.has(key)) {
      byKey.set(key, resolved);
    }
  }

  return [...byKey.values()];
}

/**
 * Resolve a single deployment row into a ResolvedStack, or null when the
 * stack cannot be determined (e.g. missing provider credentials on a legacy row).
 */
async function resolveRowStack(
  row: DeploymentStackRow,
  providerCache: Map<string, { provider: string; region: string } | null>,
): Promise<ResolvedStack | null> {
  const infra = parseInfra(row.infra);

  if (infra) {
    return {
      provider: infra.provider,
      deployStrategy: row.deploy_strategy || "managed",
      stackName: infra.stackName || stackNameFor(deriveRepoName(row.repo)),
      region: infra.region,
      providerId: row.provider_id ?? "",
      repo: row.repo,
      tofuScript: row.tofu_script ?? "",
      sampleDeploymentId: row.id,
    };
  }

  // Legacy fallback: resolve provider from credentials, derive the stack name.
  const providerId = row.provider_id ?? "";
  if (!providerId) return null;

  let creds = providerCache.get(providerId);
  if (creds === undefined) {
    const fetched = await getProviderCredentialsSafe(providerId);
    creds = fetched ? { provider: fetched.provider, region: fetched.region || "us-east-1" } : null;
    providerCache.set(providerId, creds);
  }
  if (!creds) return null;

  return {
    provider: creds.provider,
    deployStrategy: row.deploy_strategy || "managed",
    stackName: stackNameFor(deriveRepoName(row.repo)),
    region: creds.region,
    providerId,
    repo: row.repo,
    tofuScript: row.tofu_script ?? "",
    sampleDeploymentId: row.id,
  };
}

// ─── Single-stack destroy ──────────────────────────────────────────

/**
 * Destroy a single resolved stack via the appropriate provider adapter.
 *
 * This is the shared adapter-dispatch used by project teardown. It intentionally
 * does NOT mutate any deployment record's status (design Property 1) — teardown
 * keeps deployment history immutable so redeploy/rollback remain available.
 * Teardown progress is routed to the application logger rather than persisted
 * onto a historical deployment row.
 */
export async function destroyStack(resolved: ResolvedStack): Promise<DestroyResult> {
  const creds = await getProviderCredentialsSafe(resolved.providerId);
  if (!creds) {
    const message = `No provider credentials available for stack ${resolved.stackName}`;
    return { success: false, message, errors: [message] };
  }

  let adapter;
  try {
    adapter = getAdapter(resolved.provider, resolved.deployStrategy);
  } catch (err) {
    const message = getErrMsg(err);
    return { success: false, message, errors: [message] };
  }

  if (!adapter.destroy) {
    const message = `Adapter ${adapter.id} does not support destroy for stack ${resolved.stackName}`;
    return { success: false, message, errors: [message] };
  }

  const repoName = deriveRepoName(resolved.repo);
  const ctx: DestroyContext = {
    deploymentId: resolved.sampleDeploymentId,
    repoName,
    appName: sanitizeEcrRepoName(repoName),
    region: resolved.region || "us-east-1",
    credential: creds.credential,
    tofuScript: resolved.tofuScript,
    deployStrategy: resolved.deployStrategy,
    // Route teardown logs to the app logger — do not mutate historical records.
    appendLog: async (line: string) => {
      logger.info(`[teardown] ${resolved.stackName}: ${line}`);
    },
  };

  try {
    return await adapter.destroy(ctx);
  } catch (err) {
    const message = getErrMsg(err);
    logger.error({ err, stackName: resolved.stackName }, "[teardown] Adapter destroy threw");
    return { success: false, message: `Destroy failed: ${message}`, errors: [message] };
  }
}

// ─── Project infra-state writes ────────────────────────────────────

type InfraState = "none" | "live" | "torn_down";

async function setProjectInfraState(projectId: string, tenantId: string, state: InfraState): Promise<void> {
  const { error } = await supabaseAdmin
    .from("projects")
    .update({ infra_state: state })
    .eq("id", projectId)
    .eq("organization_id", tenantId);
  if (error) {
    logger.warn({ err: error, projectId, state }, "[teardown] Failed to update project infra_state");
  }
}

/**
 * Mark a project's infrastructure as live. Invoked whenever a deployment is
 * finalized as `success`. No-op when the deployment has no associated project
 * (e.g. ad-hoc deploys).
 */
export async function markProjectInfraLive(projectId?: string | null): Promise<void> {
  if (!projectId) return;
  const { error } = await supabaseAdmin
    .from("projects")
    .update({ infra_state: "live" })
    .eq("id", projectId);
  if (error) {
    logger.warn({ err: error, projectId }, "[teardown] Failed to mark project infra live");
  }
}

// ─── Teardown orchestrator ─────────────────────────────────────────

export interface TeardownStackResult {
  stackName: string;
  success: boolean;
  message: string;
  errors: string[];
}

export interface TeardownResult {
  status: "torn_down" | "partial" | "nothing_to_tear_down";
  message: string;
  perStack: TeardownStackResult[];
}

/**
 * Tear down all of a project's live infrastructure.
 *
 * Resolves every distinct live stack, destroys each via `destroyStack`, and
 * aggregates the outcome:
 *  - no stacks           → `nothing_to_tear_down` (project infra_state unchanged)
 *  - all stacks succeed  → `torn_down` (project infra_state = torn_down)
 *  - any stack fails     → `partial` (project infra_state stays `live` — resources may remain)
 *
 * Never mutates deployment record status (history stays immutable).
 */
export interface TeardownDeps {
  /** Override stack resolution (testing). Defaults to `resolveProjectStacks`. */
  resolve?: (projectId: string, tenantId: string) => Promise<ResolvedStack[]>;
  /** Override single-stack destroy (testing). Defaults to `destroyStack`. */
  destroy?: (stack: ResolvedStack) => Promise<DestroyResult>;
}

/** Map Dokploy teardown steps into the shared per-stack result shape. */
function dokployPerStack(result: DokployTeardownResult): TeardownStackResult[] {
  return result.steps.map((step) => ({
    stackName: step.resource,
    success: step.success,
    message: step.message,
    errors: step.success ? [] : [step.message],
  }));
}

/**
 * Whether a resolved stack must be torn down through the native adapters even
 * when the Dokploy provider is active.
 *
 * Static sites always DEPLOY through the native path whatever DEPLOY_PROVIDER
 * says (see `routePipeline` in ../worker.ts): object storage + CDN is cheaper
 * and faster than nginx on a VPS, and Dokploy has no equivalent target. So they
 * must also be TORN DOWN through the native path. Routing on the provider flag
 * alone sent these projects to the Dokploy teardown, which found no dokploy_*
 * rows, reported "nothing to tear down", and left the bucket, the CDN
 * distribution and the CloudFormation stack running — then project deletion
 * dropped the rows that named them, making them unreachable from the product.
 */
function isNativeOnlyStack(stack: ResolvedStack): boolean {
  return stack.deployStrategy === "static";
}

export async function teardownProjectInfrastructure(
  projectId: string,
  tenantId: string,
  deps: TeardownDeps = {},
): Promise<TeardownResult> {
  const resolve = deps.resolve ?? resolveProjectStacks;
  const destroy = deps.destroy ?? destroyStack;
  const dokployActive = env.DEPLOY_PROVIDER === "dokploy";

  // Dokploy deploys create no Pulumi/CFN stack — their infrastructure is a VPS
  // plus Dokploy records in the dokploy_* tables. When Dokploy is active the
  // only stacks worth resolving are the ones it never owned (static sites); a
  // project whose strategy changed between deploys can legitimately have both,
  // so the two paths are additive rather than exclusive.
  const resolved = await resolve(projectId, tenantId);
  const stacks = dokployActive ? resolved.filter(isNativeOnlyStack) : resolved;

  const stackResults: TeardownStackResult[] = [];
  for (const stack of stacks) {
    const result = await destroy(stack);
    stackResults.push({
      stackName: stack.stackName,
      success: result.success,
      message: result.message,
      errors: result.errors,
    });
  }

  const dokployResult = dokployActive ? await teardownDokployProject(projectId, tenantId) : null;
  const perStack: TeardownStackResult[] = [
    ...stackResults,
    ...(dokployResult ? dokployPerStack(dokployResult) : []),
  ];

  const foundDokployInfra = dokployResult !== null && dokployResult.status !== "nothing_to_tear_down";
  if (stacks.length === 0 && !foundDokployInfra) {
    logger.info({ projectId }, "[teardown] No provisioned infrastructure to tear down");
    return {
      status: "nothing_to_tear_down",
      message: "No provisioned infrastructure found for this project.",
      perStack,
    };
  }

  const failed = perStack.filter((s) => !s.success).map((s) => s.stackName);
  const stacksSucceeded = stackResults.every((s) => s.success);
  // Dokploy decides its own status: it reports `torn_down` when every billable
  // cloud resource is gone even if some of its own records could not be removed,
  // so that verdict is carried through rather than recomputed from the steps.
  const dokploySucceeded = dokployResult === null || dokployResult.status !== "partial";

  if (stacksSucceeded && dokploySucceeded) {
    await setProjectInfraState(projectId, tenantId, "torn_down");
    logger.info({ projectId, stacks: stacks.length, dokploy: dokployResult?.status ?? "skipped" }, "[teardown] Project infrastructure torn down");
    return {
      status: "torn_down",
      message: [
        stacks.length > 0 ? `Tore down ${stacks.length} stack(s).` : "",
        dokployResult && foundDokployInfra ? dokployResult.message : "",
      ].filter(Boolean).join(" ") || `Tore down ${perStack.length} resource(s).`,
      perStack,
    };
  }

  // Partial failure — leave infra_state as "live" since live resources may remain.
  logger.warn({ projectId, failed }, "[teardown] Project infrastructure teardown partially failed");
  return {
    status: "partial",
    message: `Some resources could not be removed: ${failed.join(", ")}. Check logs and retry, or remove them manually.`,
    perStack,
  };
}
