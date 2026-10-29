/**
 * Dokploy project teardown.
 *
 * Complements the native (Pulumi/CFN) teardown in `project-teardown.ts`. When
 * a project was deployed via Dokploy (`DEPLOY_PROVIDER=dokploy`), its
 * infrastructure is a VPS launched on the tenant's own cloud account plus the
 * Dokploy application/server records that point at it.
 *
 * This tears down, best-effort and idempotently:
 *   1. The Dokploy application (`application.delete`)
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
import { DokployError } from "../dokploy/types.js";
import {
  getServer,
  getApplication,
  getCompose,
  listDatabases,
  deleteServerMapping,
  deleteApplicationMapping,
  deleteComposeMapping,
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
  // A project is deployed as EITHER an application or a compose stack, never
  // both — but both are fetched unconditionally, because a project that
  // switched kinds could have left the other row behind and a leftover
  // resource still bills.
  const [server, application, compose, databases] = await Promise.all([
    getServer(projectId),
    getApplication(projectId),
    getCompose(projectId),
    listDatabases(projectId),
  ]);

  if (!server && !application && !compose && databases.length === 0) {
    return {
      status: "nothing_to_tear_down",
      message: "No managed infrastructure found for this project.",
      steps: [],
    };
  }

  const steps: DokployTeardownStep[] = [];
  const client = createDokployClient();

  // ─── 1. Remove the application's domains ───────────────────────
  //
  // MUST happen before the application: once it is gone its domains can no
  // longer be enumerated. Whether Dokploy cascades domain rows on
  // `application.delete` is undocumented, and a Traefik host can only be
  // claimed by one application — so a domain left behind makes the NEXT deploy's
  // `domain.create` fail on a host that is still held by a deleted app, and the
  // project's custom domain silently never comes back.
  // A compose stack's domains are enumerated by composeId, not applicationId —
  // `domain.byApplicationId` would return nothing for one and silently leave
  // every host claimed.
  const domainsToRemove = application
    ? await client.listDomains(application.dokployApplicationId)
    : compose
      ? await client.listComposeDomains(compose.dokployComposeId)
      : [];

  for (const domain of domainsToRemove) {
    if (!domain.domainId) continue;
    steps.push(
      await runStep(
        `domain ${domain.host || domain.domainId}`,
        () => client.deleteDomain(domain.domainId),
        "record",
      ),
    );
  }

  // ─── 2. Remove the application ─────────────────────────────────
  //
  // Verified: the provider's delete can return OK while the app lingers, and a
  // lingering app blocks the server removal. The verify re-checks that the app
  // is actually gone and turns a no-op delete into an honest failure.
  let applicationRemoved = true;
  if (application) {
    const appId = application.dokployApplicationId;
    const step = await runStep(
      `application ${appId}`,
      () => client.deleteApplication(appId),
      "record",
      () => client.applicationExists(appId),
    );
    steps.push(step);
    applicationRemoved = step.success;
  }

  // ─── 2b. Remove the compose stack ──────────────────────────────
  //
  // `deleteVolumes: true` is NOT the Dokploy default. Without it the stack's
  // named volumes survive the teardown and keep consuming disk on a server the
  // user believes is gone — and a later deploy of the same project would
  // silently adopt that stale data.
  //
  // Verified the same way as the application: the delete can return OK while
  // the stack lingers, and a lingering stack blocks the server removal with
  // "Server has active services".
  let composeRemoved = true;
  if (compose) {
    const composeId = compose.dokployComposeId;
    const step = await runStep(
      `compose stack ${composeId}`,
      () => client.deleteCompose(composeId, true),
      "record",
      () => client.composeExists(composeId),
    );
    steps.push(step);
    composeRemoved = step.success;
  }

  // ─── 3. Remove provisioned database services ───────────────────
  //
  // MUST happen before the server: Dokploy rejects `server.remove` while the
  // server still hosts services ("Server has active services, please delete
  // them first"). Skipping this step is what made server removal fail.
  let databasesRemoved = true;
  for (const db of databases) {
    const step = await runStep(
      `${db.engine} service ${db.dokployDatabaseId}`,
      () => client.deleteDatabase(db.engine, db.dokployDatabaseId),
      "record",
      () => client.databaseExists(db.engine, db.dokployDatabaseId),
    );
    steps.push(step);
    if (!step.success) databasesRemoved = false;
  }

  // ─── 4. Remove the remote server ───────────────────────────────
  let serverRemoved = true;
  // Tracks whether the cloud VM is gone. Starts null = "no VM involved", which
  // is distinct from true/false: a BYO/pre-provisioned server (instanceId null)
  // has no VM to terminate, and must NOT be treated as "cloud resource removed"
  // — otherwise its mapping row would be deleted even when the Dokploy record
  // removal failed, orphaning it exactly like the bug this gating prevents.
  let vmRemoved: boolean | null = null;
  if (server) {
    // The provider rejects a server removal while it still hosts an application
    // or a database ("active services"). Only attempt it when those are
    // actually gone; otherwise report an honest skip rather than firing a call
    // that is guaranteed to fail and leaking the provider's raw error.
    if (applicationRemoved && composeRemoved && databasesRemoved) {
      const step = await runStep(
        `managed server ${server.dokployServerId}`,
        () => client.deleteServer(server.dokployServerId),
        "record",
      );
      steps.push(step);
      serverRemoved = step.success;
    } else {
      serverRemoved = false;
      steps.push({
        resource: `managed server ${server.dokployServerId}`,
        success: false,
        message:
          "skipped — the server still hosts a service that could not be removed; " +
          "retry the teardown once that is cleared",
        kind: "record",
      });
    }

    // ─── 5. Terminate the cloud VM on the tenant's account ───────
    // Runs even if the server-record removal failed or was skipped: the VM is
    // the billable resource, so stopping it is the priority and is independent
    // of the provider-side record.
    if (server.instanceId) {
      const vmStep = await terminateCloudInstance(server.providerId, server.instanceId);
      steps.push(vmStep);
      vmRemoved = vmStep.success;
    }
  }

  // ─── 6. Delete the mapping rows ────────────────────────────────
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
    steps.push(await runStep("application record", () => deleteApplicationMapping(projectId), "mapping"));
  }
  if (compose && composeRemoved) {
    steps.push(await runStep("compose record", () => deleteComposeMapping(projectId), "mapping"));
  }
  if (databases.length > 0 && databasesRemoved) {
    steps.push(await runStep("database records", () => deleteDatabaseMappings(projectId), "mapping"));
  }
  // With a VM: drop the row once the VM is gone (the billable resource).
  // Without a VM (BYO server): there is nothing billable, so the row may only be
  // dropped once the Dokploy record itself is gone.
  const serverRowClear = vmRemoved === null ? serverRemoved : vmRemoved;
  if (server && serverRowClear) {
    steps.push(await runStep("server record", () => deleteServerMapping(projectId), "mapping"));
  }

  const failedSteps = steps.filter((s) => !s.success);
  if (failedSteps.length === 0) {
    logger.info({ projectId, steps: steps.length }, "[dokploy-teardown] Torn down");
    return { status: "torn_down", message: `Tore down ${steps.length} resource(s).`, steps };
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
        `Infrastructure destroyed. Some provider records could not be removed automatically ` +
        `(${failedNames.join(", ")}) — they hold no cloud resources and cost nothing; an ` +
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
 * "Already gone" signals from the CLOUD provider (AWS/GCP) only. Teardown must
 * be idempotent: a VM deleted out-of-band is a SUCCESS, not a failure.
 *
 * This is deliberately NOT used for the deploy provider's own records — those
 * use the HTTP status code (`isAlreadyGoneError`) instead. The previous
 * string-matching version matched the bare token `404` / `not found` ANYWHERE
 * in a provider error body, so a FAILED `application.remove` whose error merely
 * mentioned "404" was misread as "already removed": the app was never deleted,
 * its mapping row was dropped, and the still-attached app then made the server
 * removal fail. Matching the real status code closes that hole.
 */
const CLOUD_ALREADY_GONE = /not found|notfound|does not exist|no longer exists|already (deleted|terminated)|InvalidInstanceID\.NotFound/i;

/**
 * Is this error a genuine "the targeted resource is already gone" signal?
 *
 * For a provider API call that is a real 404 on the resource we asked to
 * delete. For a cloud call it is the provider's not-found text. Crucially, a
 * 4xx that is NOT 404 (e.g. the 400 "Server has active services") is NOT
 * "already gone" — it is a real failure that must be reported honestly.
 */
function isAlreadyGoneError(err: unknown): boolean {
  if (err instanceof DokployError) return err.statusCode === 404;
  return CLOUD_ALREADY_GONE.test(getErrMsg(err));
}

/**
 * Run a teardown step, capturing success/failure without throwing.
 *
 * `verify`, when provided, is called AFTER a seemingly-successful `fn` to
 * confirm the resource is actually gone — the deploy provider's delete can
 * return without error while leaving the resource in place. A `verify` that
 * reports the resource still present turns the step into an honest failure.
 */
async function runStep(
  resource: string,
  fn: () => Promise<void>,
  kind: DokployTeardownStep["kind"] = "record",
  verify?: () => Promise<boolean>,
): Promise<DokployTeardownStep> {
  try {
    await fn();
    if (verify) {
      const stillPresent = await verify();
      if (stillPresent) {
        logger.warn({ resource }, "[dokploy-teardown] Delete returned OK but resource is still present");
        return {
          resource,
          success: false,
          message: "the delete did not take effect — the resource is still present",
          kind,
        };
      }
    }
    return { resource, success: true, message: "removed", kind };
  } catch (err) {
    if (isAlreadyGoneError(err)) {
      // A 404 from the delete is only trustworthy if the resource is really
      // gone. The deploy provider returns 404 both for "resource already
      // deleted" (the idempotent case we want to treat as success) AND for
      // "procedure not found" when the delete is addressed to the wrong path —
      // in which case the resource was never touched and still exists. When a
      // `verify` is available, confirm with it before trusting the 404 so a
      // misrouted or no-op delete becomes an honest failure instead of
      // silently dropping the mapping row and orphaning the resource.
      if (verify) {
        const stillPresent = await verify();
        if (stillPresent) {
          logger.warn({ resource }, "[dokploy-teardown] Delete reported gone but resource is still present");
          return {
            resource,
            success: false,
            message: "the resource could not be removed; retry the teardown",
            kind,
          };
        }
      }
      logger.info({ resource }, "[dokploy-teardown] Resource already gone — treating as removed");
      return { resource, success: true, message: "already removed", kind };
    }
    logger.warn({ err, resource }, "[dokploy-teardown] Step failed");
    return { resource, success: false, message: neutralizeProviderError(err), kind };
  }
}

/**
 * Map a raw provider error to a neutral, resource-scoped message for the API
 * response. The deploy provider's raw error bodies name the provider and expose
 * internal tRPC paths (e.g. `"path":"server.remove"`); neither may reach an API
 * consumer. The real error is still logged for operators (see the `logger.warn`
 * above, which keeps the original `err`).
 */
function neutralizeProviderError(err: unknown): string {
  if (err instanceof DokployError) {
    return "the deploy provider could not remove this resource; retry the teardown";
  }
  return getErrMsg(err);
}
