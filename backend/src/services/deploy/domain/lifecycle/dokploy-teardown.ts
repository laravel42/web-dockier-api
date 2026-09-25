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
import { getProviderCredentialsSafe, toAwsCredentials, toGcpServiceAccountKey } from "../../../../lib/provider-credentials.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { createDokployClient } from "../dokploy/client.js";
import {
  getServer,
  getApplication,
  listDatabases,
  deleteServerMapping,
  deleteApplicationMapping,
  deleteDatabaseMappings,
} from "../dokploy/mappings.js";
import { terminateEc2Instance } from "../dokploy/provisioning/aws-ec2.js";
import { terminateGceInstance } from "../dokploy/provisioning/gcp-gce.js";

export interface DokployTeardownStep {
  resource: string;
  success: boolean;
  message: string;
  /**
   * What the step removed:
   *  - "cloud"  → a billable cloud resource (the VM). Failures here matter most.
   *  - "record" → a Dokploy-side record. A leftover costs nothing.
   *  - "mapping"→ a Dockier tracking row.
   * Used to decide whether a partial failure still means "infrastructure gone".
   */
  kind?: "cloud" | "record" | "mapping";
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
  const [server, application, databases] = await Promise.all([
    getServer(projectId),
    getApplication(projectId),
    listDatabases(projectId),
  ]);

  if (!server && !application && databases.length === 0) {
    return {
      status: "nothing_to_tear_down",
      message: "No Dokploy infrastructure found for this project.",
      steps: [],
    };
  }

  const steps: DokployTeardownStep[] = [];
  const client = createDokployClient();

  // ─── 1. Remove the Dokploy application ─────────────────────────
  let applicationRemoved = true;
  if (application) {
    const step = await runStep(
      `dokploy application ${application.dokployApplicationId}`,
      () => client.deleteApplication(application.dokployApplicationId),
      "record",
    );
    steps.push(step);
    applicationRemoved = step.success;
  }

  // ─── 2. Remove provisioned database services ───────────────────
  //
  // MUST happen before the server: Dokploy rejects `server.remove` while the
  // server still hosts services ("Server has active services, please delete
  // them first"). Skipping this step is what made server removal fail.
  let databasesRemoved = true;
  for (const db of databases) {
    const step = await runStep(
      `dokploy ${db.engine} service ${db.dokployDatabaseId}`,
      () => client.deleteDatabase(db.engine, db.dokployDatabaseId),
      "record",
    );
    steps.push(step);
    if (!step.success) databasesRemoved = false;
  }

  // ─── 3. Remove the Dokploy remote server ───────────────────────
  let serverRemoved = true;
  // Tracks whether the cloud VM is gone. Starts null = "no VM involved", which
  // is distinct from true/false: a BYO/pre-provisioned server (instanceId null)
  // has no VM to terminate, and must NOT be treated as "cloud resource removed"
  // — otherwise its mapping row would be deleted even when the Dokploy record
  // removal failed, orphaning it exactly like the bug this gating prevents.
  let vmRemoved: boolean | null = null;
  if (server) {
    const step = await runStep(
      `dokploy server ${server.dokployServerId}`,
      () => client.deleteServer(server.dokployServerId),
      "record",
    );
    steps.push(step);
    serverRemoved = step.success;

    // ─── 4. Terminate the cloud VM on the tenant's account ───────
    // Runs even if the Dokploy record removal failed: the VM is the billable
    // resource, so stopping it is the priority.
    if (server.instanceId) {
      const vmStep = await terminateCloudInstance(server.providerId, server.instanceId);
      steps.push(vmStep);
      vmRemoved = vmStep.success;
    }
  }

  // ─── 5. Delete the mapping rows ────────────────────────────────
  //
  // A mapping row exists to keep a handle on something that still needs
  // cleanup, so it is dropped once that thing is gone. Deleting rows after a
  // FAILED removal orphaned resources permanently (the next teardown reported
  // "nothing to tear down" while the VM kept billing), so each row is gated on
  // its own resource.
  //
  // The server row is gated on the VM, NOT on the Dokploy record: once the VM is
  // terminated there is nothing billable left and no reason to keep tracking it.
  // Gating on the record would strand the project forever, because a Dokploy
  // record that cannot be removed (e.g. its server is already gone, so Dokploy
  // can no longer reach it) would never succeed.
  if (application && applicationRemoved) {
    steps.push(await runStep("mapping dokploy_applications", () => deleteApplicationMapping(projectId), "mapping"));
  }
  if (databases.length > 0 && databasesRemoved) {
    steps.push(await runStep("mapping dokploy_databases", () => deleteDatabaseMappings(projectId), "mapping"));
  }
  // With a VM: drop the row once the VM is gone (the billable resource).
  // Without a VM (BYO server): there is nothing billable, so the row may only be
  // dropped once the Dokploy record itself is gone.
  const serverRowClear = vmRemoved === null ? serverRemoved : vmRemoved;
  if (server && serverRowClear) {
    steps.push(await runStep("mapping dokploy_servers", () => deleteServerMapping(projectId), "mapping"));
  }

  const failedSteps = steps.filter((s) => !s.success);
  if (failedSteps.length === 0) {
    logger.info({ projectId, steps: steps.length }, "[dokploy-teardown] Torn down");
    return { status: "torn_down", message: `Tore down ${steps.length} Dokploy resource(s).`, steps };
  }

  const failedNames = failedSteps.map((s) => s.resource);

  // All billable cloud resources gone, only Dokploy-side records left behind.
  // The user's infrastructure IS destroyed and billing has stopped, so report
  // success rather than stranding the project in a partial state they cannot
  // resolve. The leftover records are logged for operator cleanup.
  //
  // Requires that a cloud resource was actually torn down: if there was none,
  // nothing was destroyed and a failed record removal should stay retryable
  // rather than claiming success.
  const hadCloudStep = steps.some((s) => s.kind === "cloud");
  const cloudClear = hadCloudStep && vmRemoved === true && failedSteps.every((s) => s.kind !== "cloud");
  if (cloudClear) {
    logger.warn({ projectId, failed: failedNames }, "[dokploy-teardown] Cloud resources gone; stale Dokploy records remain");
    return {
      status: "torn_down",
      message:
        `Infrastructure destroyed. Some Dokploy records could not be removed automatically ` +
        `(${failedNames.join(", ")}) — they hold no cloud resources and cost nothing, but an ` +
        `administrator may want to clear them.`,
      steps,
    };
  }

  logger.warn({ projectId, failed: failedNames }, "[dokploy-teardown] Partial teardown");
  return {
    status: "partial",
    message:
      `Some resources could not be removed: ${failedNames.join(", ")}. ` +
      `Dockier kept its record of them, so you can safely run the teardown again to retry — ` +
      `only the resources that failed are still tracked.`,
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
    return { resource, success: false, message: `No provider credentials for ${providerId}; VM may still be running.`, kind: "cloud" };
  }

  if (creds.credential.kind === "aws") {
    return runStep(resource, () => terminateEc2Instance(
      toAwsCredentials(creds.credential, creds.region || "us-east-1"),
      instanceId,
    ), "cloud");
  }

  if (creds.credential.kind === "gcp") {
    // instanceId is the GCE instance name. No zone is recorded in the mapping,
    // so terminateGceInstance locates it across zones before deleting.
    return runStep(resource, () => terminateGceInstance(toGcpServiceAccountKey(creds.credential), instanceId), "cloud");
  }

  return { resource, success: false, message: `Unsupported provider "${creds.provider}" for VM termination.`, kind: "cloud" };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * "Already gone" signals from Dokploy/AWS/GCP. Teardown must be idempotent: a
 * resource deleted out-of-band (or by a previous partial teardown) is a SUCCESS,
 * not a failure. Treating it as a failure would keep the mapping row forever and
 * make the project impossible to fully tear down.
 */
const ALREADY_GONE = /not found|notfound|404|does not exist|no longer exists|already (deleted|terminated)|InvalidInstanceID\.NotFound/i;

/**
 * Run a teardown step, capturing success/failure without throwing.
 */
async function runStep(
  resource: string,
  fn: () => Promise<void>,
  kind: DokployTeardownStep["kind"] = "record",
): Promise<DokployTeardownStep> {
  try {
    await fn();
    return { resource, success: true, message: "removed", kind };
  } catch (err) {
    const message = getErrMsg(err);
    if (ALREADY_GONE.test(message)) {
      logger.info({ resource }, "[dokploy-teardown] Resource already gone — treating as removed");
      return { resource, success: true, message: "already removed", kind };
    }
    logger.warn({ err, resource }, "[dokploy-teardown] Step failed");
    return { resource, success: false, message, kind };
  }
}
