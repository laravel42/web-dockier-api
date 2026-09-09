/**
 * Dokploy project teardown.
 *
 * Complements the native (Pulumi/CFN) teardown in `project-teardown.ts`. When
 * a project was deployed via Dokploy (`DEPLOY_PROVIDER=dokploy`), its
 * infrastructure is a VPS launched on the tenant's own cloud account plus the
 * Dokploy application/server records that point at it.
 *
 * This tears down, best-effort and idempotently:
 *   1. The Dokploy application (`application.remove`)
 *   2. The Dokploy remote server (`server.remove`)
 *   3. The cloud VM on the tenant's account (EC2 terminate / GCE delete)
 *   4. The Dockier mapping rows (`dokploy_applications`, `dokploy_servers`)
 *
 * Nothing here throws to the caller — every step is captured as a per-resource
 * result so a single failure (e.g. an already-deleted server) never blocks the
 * rest of the cleanup.
 */

import { logger } from "../../../../shared/logger.js";
import { getProviderCredentialsSafe, toAwsCredentials } from "../../../../lib/provider-credentials.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { createDokployClient } from "../dokploy/client.js";
import {
  getServer,
  getApplication,
  deleteServerMapping,
  deleteApplicationMapping,
} from "../dokploy/mappings.js";
import { terminateEc2Instance } from "../dokploy/provisioning/aws-ec2.js";
import { terminateGceInstance } from "../dokploy/provisioning/gcp-gce.js";

export interface DokployTeardownStep {
  resource: string;
  success: boolean;
  message: string;
}

export interface DokployTeardownResult {
  status: "torn_down" | "partial" | "nothing_to_tear_down";
  message: string;
  steps: DokployTeardownStep[];
}

/**
 * Tear down all Dokploy-provisioned infrastructure for a project.
 */
export async function teardownDokployProject(
  projectId: string,
  _tenantId: string,
): Promise<DokployTeardownResult> {
  const [server, application] = await Promise.all([
    getServer(projectId),
    getApplication(projectId),
  ]);

  if (!server && !application) {
    return {
      status: "nothing_to_tear_down",
      message: "No Dokploy infrastructure found for this project.",
      steps: [],
    };
  }

  const steps: DokployTeardownStep[] = [];

  // ─── 1. Remove the Dokploy application ─────────────────────────
  if (application) {
    steps.push(await runStep(
      `dokploy application ${application.dokployApplicationId}`,
      async () => {
        const client = createDokployClient();
        await client.deleteApplication(application.dokployApplicationId);
      },
    ));
  }

  // ─── 2. Remove the Dokploy remote server ───────────────────────
  if (server) {
    steps.push(await runStep(
      `dokploy server ${server.dokployServerId}`,
      async () => {
        const client = createDokployClient();
        await client.deleteServer(server.dokployServerId);
      },
    ));

    // ─── 3. Terminate the cloud VM on the tenant's account ───────
    if (server.instanceId) {
      steps.push(await terminateCloudInstance(server.providerId, server.instanceId));
    }
  }

  // ─── 4. Delete the mapping rows ────────────────────────────────
  if (application) {
    steps.push(await runStep("mapping dokploy_applications", () => deleteApplicationMapping(projectId)));
  }
  if (server) {
    steps.push(await runStep("mapping dokploy_servers", () => deleteServerMapping(projectId)));
  }

  const allSucceeded = steps.every((s) => s.success);
  if (allSucceeded) {
    logger.info({ projectId, steps: steps.length }, "[dokploy-teardown] Torn down");
    return { status: "torn_down", message: `Tore down ${steps.length} Dokploy resource(s).`, steps };
  }

  const failed = steps.filter((s) => !s.success).map((s) => s.resource);
  logger.warn({ projectId, failed }, "[dokploy-teardown] Partial teardown");
  return {
    status: "partial",
    message: `Some Dokploy resources could not be removed: ${failed.join(", ")}. They may need manual cleanup.`,
    steps,
  };
}

// ─── Cloud instance termination ────────────────────────────────────

/**
 * Terminate the tenant's cloud VM by resolving the provider from the server's
 * providerId and dispatching to the AWS or GCP teardown path.
 */
async function terminateCloudInstance(providerId: string, instanceId: string): Promise<DokployTeardownStep> {
  const resource = `cloud instance ${instanceId}`;

  const creds = await getProviderCredentialsSafe(providerId);
  if (!creds) {
    return { resource, success: false, message: `No provider credentials for ${providerId}; VM may still be running.` };
  }

  const provider = creds.provider.toLowerCase();

  if (provider === "aws") {
    return runStep(resource, () => terminateEc2Instance(
      toAwsCredentials(creds, creds.region || "us-east-1"),
      instanceId,
    ));
  }

  if (provider === "gcp") {
    // instanceId is the GCE instance name. No zone is recorded in the mapping,
    // so terminateGceInstance locates it across zones before deleting.
    return runStep(resource, () => terminateGceInstance(creds.apiKey, instanceId));
  }

  return { resource, success: false, message: `Unsupported provider "${creds.provider}" for VM termination.` };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Run a teardown step, capturing success/failure without throwing.
 */
async function runStep(resource: string, fn: () => Promise<void>): Promise<DokployTeardownStep> {
  try {
    await fn();
    return { resource, success: true, message: "removed" };
  } catch (err) {
    const message = getErrMsg(err);
    logger.warn({ err, resource }, "[dokploy-teardown] Step failed");
    return { resource, success: false, message };
  }
}
