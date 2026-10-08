/**
 * AWS static-hosting custom domains: ACM certificates + CloudFront aliases.
 *
 * Shape of the flow, which is asynchronous by nature and must never block a job:
 *
 *   1. apply  → request (or adopt) ONE ACM certificate covering every domain,
 *               persist the per-domain validation CNAMEs, return immediately.
 *   2. user   → publishes the validation CNAME(s) and the domain CNAME.
 *   3. poll   → DescribeCertificate until ISSUED (minutes to hours).
 *   4. attach → UpdateStack with Aliases + ViewerCertificate, started here and
 *               observed on a LATER poll; a CloudFront update takes 5-20 min.
 *
 * ONE certificate, not one per domain. A CloudFront distribution has exactly
 * one `ViewerCertificate`, so every alias must be covered by a single
 * multi-SAN certificate. ACM certificates are immutable in their name list, so
 * changing the domain set means requesting a new certificate and swapping it in
 * once issued.
 *
 * Certificates are ALWAYS requested in us-east-1: CloudFront accepts
 * certificates from no other region, whatever region the stack lives in.
 */

import { getAcm, getCfn } from "../../../../lib/aws-sdk.js";
import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";
import { nowIso } from "../../../../shared/utils/time.js";
import type { DnsValidationRecord } from "../mappers.js";
import { isApexDomain, apexRefusalMessage, normalizeHost, canonicalDomains, stableHash36 } from "./apex.js";
import { listApexAcks } from "../apex-ack.js";
import { isValidationRecordVisible, verifyRoutingRecordAws } from "./routing.js";
import { classifyAwsError, type StaticFailure } from "./failures.js";
import {
  deleteStaticCertRows,
  ensureStaticCertRow,
  listStaticCertRows,
  setCertState,
  type StaticCertRow,
} from "./certs.js";
import type { AwsStaticTarget } from "./target.js";

/**
 * CloudFront only accepts ACM certificates from us-east-1, whatever region the
 * stack lives in. Do NOT "fix" this to target.region.
 */
const ACM_REGION = "us-east-1";

// The flat 2-hour certificate deadline that used to live here is gone. It is
// superseded by the per-cloud, per-state tables in ./deadlines.js, which the
// sweep in ./poll-sweep.js applies.

import type { StaticApplyOutcome } from "../mappers.js";
export type { StaticApplyOutcome } from "../mappers.js";

interface AcmClientBundle {
  acm: InstanceType<Awaited<ReturnType<typeof getAcm>>["ACMClient"]>;
  mod: Awaited<ReturnType<typeof getAcm>>;
}

async function acmClient(target: AwsStaticTarget): Promise<AcmClientBundle> {
  const mod = await getAcm();
  const acm = new mod.ACMClient({ region: ACM_REGION, credentials: target.credentials });
  return { acm, mod };
}



/**
 * Record a failure on every certificate row the reconcile holds.
 *
 * Two halves of one rule, and both matter:
 *
 *   - A PERMANENT failure (`retryable: false`) writes `verification_state =
 *     'failed'`, because no amount of retrying will move it on.
 *   - A TRANSIENT failure writes the message ONLY. Writing `failed` for a
 *     CloudFormation `*_IN_PROGRESS` would turn a 30-second wait into a dead
 *     end, and would move the phase clock on a state that has not changed.
 */
async function writeFailureToRows(
  rows: Iterable<StaticCertRow>,
  failure: StaticFailure,
): Promise<void> {
  for (const row of rows) {
    await setCertState(
      row.id,
      {
        ...(failure.retryable ? {} : { verificationState: "failed" as const }),
        verificationMessage: failure.message,
      },
      row.verificationState,
    );
  }
}

/**
 * Reconcile a project's domains onto its CloudFront distribution.
 *
 * Never throws: returns an outcome the caller reports verbatim.
 */
export async function reconcileAwsStaticDomains(params: {
  tenantId: string;
  projectId: string;
  target: AwsStaticTarget;
  domains: Array<{ id: string; name: string }>;
}): Promise<StaticApplyOutcome> {
  const { tenantId, projectId, target, domains } = params;

  try {
    // ── Separate the domains we can serve from the ones we cannot ──
    const usable: Array<{ id: string; name: string }> = [];
    const apexRejected: string[] = [];

    // Two enforcement points is correct: the route owns the conversation with
    // the user, this owns the invariant for a row created by any other path.
    const acked = new Set(await listApexAcks(tenantId, projectId));

    for (const d of domains) {
      const name = normalizeHost(d.name);
      if (isApexDomain(name) && !acked.has(name)) {
        apexRejected.push(name);
        const ensured = await ensureStaticCertRow({
          tenantId,
          projectId,
          domainName: name,
          domainId: d.id,
          type: "acm",
        });
        if (ensured.ok) {
          await setCertState(
            ensured.row.id,
            {
              status: "failed",
              verificationState: "failed",
              verificationMessage: apexRefusalMessage(name, "persisted"),
            },
            ensured.row.verificationState,
          );
        }
        continue;
      }
      usable.push({ id: d.id, name });
    }

    // ── Drop certificate rows for domains no longer configured ──
    //
    // A FAILED read is not an empty table. If the list could not be read, skip
    // orphan cleanup entirely and carry on: deriving "orphaned" from `[]` would
    // delete every certificate row the project has.
    const existingRows = await listStaticCertRows(projectId);
    if (!existingRows.ok) {
      logger.warn(
        { projectId, kind: existingRows.failure.kind },
        "[domains:static:aws] skipping orphan cleanup — certificate rows could not be read",
      );
    } else {
      const configured = new Set([...usable.map((d) => d.name), ...apexRejected]);
      const orphaned = existingRows.rows.filter((r) => !configured.has(normalizeHost(r.domainName)));
      if (orphaned.length > 0) {
        // Detach first: ACM refuses to delete a certificate a distribution is
        // using, so the alias must come off before the certificate goes.
        await deleteStaticCertRows(projectId, orphaned.map((r) => r.domainName));
      }
    }

    if (usable.length === 0) {
      // Nothing left to serve — clear the aliases off the distribution.
      const detached = await updateStackDomainParameters({ target, aliases: [], certificateArn: "" });
      // "persisted": an apply response has no checkbox to point the user at.
      const apexNote =
        apexRejected.length > 0 ? ` ${apexRefusalMessage(apexRejected[0], "persisted")}` : "";
      if (!detached.ok) {
        // No rows to write onto: the orphan sweep above has just removed them.
        return {
          success: false,
          retryable: detached.failure.retryable,
          message: detached.failure.message,
        };
      }
      // Nothing is kept, so every project cert is now a candidate to reap. The
      // one just detached may still be in use until CloudFront finishes (5-20
      // min); it is skipped this pass and reaped on a later reconcile.
      await reapOrphanedCertificates({ target, projectId, keepArn: "" });
      return {
        success: apexRejected.length === 0,
        retryable: false,
        message:
          apexRejected.length > 0
            ? `No domain could be attached.${apexNote}`
            : "No custom domains configured. The site is served on its CloudFront domain.",
      };
    }

    const wanted = canonicalDomains(usable.map((d) => d.name));

    // ── Ensure a row per usable domain ──
    const rows = new Map<string, StaticCertRow>();
    for (const d of usable) {
      const ensured = await ensureStaticCertRow({
        tenantId,
        projectId,
        domainName: d.name,
        domainId: d.id,
        type: "acm",
      });
      if (!ensured.ok) {
        // No row exists to carry the message, so it travels in the apply
        // response and `GET /readyz` is the operator surface.
        return {
          success: false,
          retryable: ensured.failure.retryable,
          message: ensured.failure.message,
        };
      }
      rows.set(d.name, ensured.row);
    }

    // ── One certificate covering every usable domain ──
    const cert = await ensureCertificateForDomains({ target, projectId, wanted, rows: [...rows.values()] });
    if (!cert.ok) {
      // Write the classified failure onto every row we hold. Without this a
      // permanently denied RequestCertificate leaves each row at `pending`
      // with a null message — visibly stuck, with no explanation anywhere.
      await writeFailureToRows(rows.values(), cert.failure);
      return { success: false, retryable: cert.failure.retryable, message: cert.failure.message };
    }

    // Reap any OTHER project certificate now that we know which one is current.
    // A changed domain set leaves the previous (differently-named) cert behind;
    // this deletes it. The current cert is kept. Runs on every reconcile — the
    // sweep's repeated reconciles are what eventually catch a cert still held by
    // an in-flight CloudFront update.
    await reapOrphanedCertificates({ target, projectId, keepArn: cert.arn });

    // Persist the ARN and each domain's own validation record.
    for (const [name, row] of rows) {
      const record = cert.validationRecords.get(name) ?? null;
      await setCertState(
        row.id,
        {
          providerRef: cert.arn,
          validationRecord: record,
          status: cert.issued ? "active" : "pending",
          verificationState: cert.issued ? "attaching" : "awaiting_dns",
          verificationMessage: cert.issued
            ? "Certificate issued. Attaching it to the CDN — this usually takes 5-20 minutes."
            : record
              ? "Publish the validation record shown here, then the certificate will be issued automatically."
              : "Waiting for the certificate validation record from AWS.",
          // WRITE-ONCE. Re-stamping on every reconcile of an already-issued
          // certificate would make the post-attach 72-hour routing deadline
          // as unreachable as a re-stamped phase clock, because that deadline
          // reads `issued_at`.
          issuedAt: cert.issued && !row.issuedAt ? nowIso() : undefined,
        },
        row.verificationState,
      );
    }

    // Distinguish "the user has not published the validation record" from
    // "AWS has it and is validating". ACM's API cannot tell these apart —
    // ValidationStatus stays PENDING_VALIDATION for both until it flips — so
    // resolving the record's own name is the only signal available, and it is
    // what makes `provisioning` reachable at all.
    if (!cert.issued) {
      for (const [name, row] of rows) {
        const record = cert.validationRecords.get(name);
        if (!record) continue;
        const visible = await isValidationRecordVisible(record.name);
        if (!visible) continue;
        await setCertState(
          row.id,
          {
            verificationState: "provisioning",
            verificationMessage: `The validation record for ${name} is visible. AWS usually issues the certificate within a few minutes.`,
          },
          "awaiting_dns",
        );
      }
    }

    if (!cert.issued) {
      const apexNote = apexRejected.length > 0 ? ` ${apexRejected.length} root domain(s) were rejected.` : "";
      return {
        success: true,
        message:
          `Certificate requested for ${wanted.length} domain(s). Publish the DNS validation record ` +
          `shown for each domain; HTTPS goes live automatically once AWS validates them.${apexNote}`,
      };
    }

    // ── Issued: attach to the distribution ──
    const attach = await updateStackDomainParameters({
      target,
      aliases: wanted,
      certificateArn: cert.arn,
    });
    if (!attach.ok) {
      await writeFailureToRows(rows.values(), attach.failure);
      return { success: false, retryable: attach.failure.retryable, message: attach.failure.message };
    }

    for (const [name, row] of rows) {
      // No explicit `attachStartedAt`: the phase-clock invariant in
      // setCertState stamps it only if the state actually changes. The old
      // unconditional `attach.inProgress ? nowIso() : undefined` re-stamped on
      // every `attaching` write, which under a repeating sweep means the
      // 90-minute attach deadline never fires.
      if (attach.inProgress) {
        await setCertState(
          row.id,
          {
            verificationState: "attaching",
            verificationMessage:
              "Certificate issued. The CDN update is in progress — usually 5-20 minutes.",
          },
          row.verificationState,
        );
        continue;
      }

      // The CDN is updated. `live` must mean SERVING, so it is gated on the
      // routing record actually pointing here — otherwise a user with a
      // certificate attached but no CNAME sees a green "live" for a domain
      // that serves nothing.
      const check = await verifyRoutingRecordAws(name, target.distributionDomain);

      // An inconclusive check on an APEX resolves to `live`, never to
      // awaiting_dns. `verifyFlattenedAlias` returns null on a miss by design
      // because CloudFront's edges rotate, so for the one configuration the
      // apex acknowledgement enables, "no overlap" means unknown. Calling it
      // awaiting_dns would strand a correctly configured apex and time it out
      // 72 hours later.
      const treatAsLive =
        check.outcome === "verified" ||
        (check.outcome === "inconclusive" && isApexDomain(name));

      await setCertState(
        row.id,
        treatAsLive
          ? {
              verificationState: "live",
              verificationMessage: check.outcome === "inconclusive" ? check.message : null,
            }
          : {
              // Post-attach awaiting_dns: the certificate is attached and
              // `status` is already active, which is what distinguishes this
              // from the pre-issuance wait.
              verificationState: "awaiting_dns",
              verificationMessage: check.message,
            },
        row.verificationState,
      );
    }

    return {
      success: true,
      anyLive: !attach.inProgress,
      message: attach.inProgress
        ? `Certificate issued for ${wanted.length} domain(s). The CloudFront update is in progress (5-20 minutes); point your DNS at ${target.distributionDomain} if you have not already.`
        : `${wanted.length} domain(s) are serving over HTTPS. Point your DNS at ${target.distributionDomain}.`,
    };
  } catch (err) {
    const msg = getErrMsg(err);
    logger.error({ err: msg, projectId }, "[domains:static:aws] reconcile failed");
    return { success: false, retryable: true, message: `Could not apply domains: ${msg}` };
  }
}

interface CertificateResult {
  ok: true;
  arn: string;
  issued: boolean;
  validationRecords: Map<string, DnsValidationRecord>;
}
type CertificateFailure = { ok: false; failure: StaticFailure };

/**
 * Get a certificate covering exactly `wanted`, requesting one if needed.
 *
 * Reuses an existing certificate when its name set already matches. ACM
 * certificates cannot be amended, so a changed domain set means a new request.
 */
async function ensureCertificateForDomains(params: {
  target: AwsStaticTarget;
  projectId: string;
  wanted: string[];
  rows: StaticCertRow[];
}): Promise<CertificateResult | CertificateFailure> {
  const { target, projectId, wanted, rows } = params;
  const { acm, mod } = await acmClient(target);

  // Every row should carry the same ARN; take the one they agree on.
  const existingArns = [...new Set(rows.map((r) => r.providerRef).filter((a): a is string => Boolean(a)))];

  for (const arn of existingArns) {
    const described = await describeCertificate(acm, mod, arn);
    if (!described) continue;
    if (sameDomainSet(described.names, wanted)) {
      return {
        ok: true,
        arn,
        issued: described.status === "ISSUED",
        validationRecords: described.validationRecords,
      };
    }
    // Domain set changed — this certificate can no longer serve the project.
    logger.info(
      { projectId, arn, had: described.names, wanted },
      "[domains:static:aws] domain set changed; requesting a new certificate",
    );
  }

  // Adopt an existing certificate for this project before creating another:
  // ACM's IdempotencyToken only dedupes a byte-identical request for about an
  // hour, while a user Sync can arrive days later.
  const adopted = await findAdoptableCertificate(acm, mod, projectId, wanted);
  if (adopted) {
    return { ok: true, arn: adopted.arn, issued: adopted.status === "ISSUED", validationRecords: adopted.validationRecords };
  }

  try {
    const [primary, ...sans] = wanted;
    const res = await acm.send(
      new mod.RequestCertificateCommand({
        DomainName: primary,
        SubjectAlternativeNames: sans.length > 0 ? sans : undefined,
        ValidationMethod: "DNS",
        IdempotencyToken: idempotencyToken(projectId, wanted),
        Tags: [
          { Key: "dockier:projectId", Value: projectId },
          { Key: "dockier:managed", Value: "static-domains" },
        ],
      }),
    );
    const arn = res.CertificateArn;
    if (!arn) {
      return {
        ok: false,
        failure: classifyAwsError(new Error("RequestCertificate returned no CertificateArn"), {
          operation: "acm:RequestCertificate",
        }),
      };
    }

    // ACM populates the validation records a few seconds after the request.
    const described = await describeCertificateWithRetry(acm, mod, arn);
    return {
      ok: true,
      arn,
      issued: described?.status === "ISSUED",
      validationRecords: described?.validationRecords ?? new Map(),
    };
  } catch (err) {
    const failure = classifyAwsError(err, { operation: "acm:RequestCertificate" });
    logger.error(
      { projectId, kind: failure.kind, detail: failure.detail },
      "[domains:static:aws] RequestCertificate failed",
    );
    return { ok: false, failure };
  }
}

/**
 * ACM's IdempotencyToken: max 32 chars, and must differ when the request
 * differs. Derived from the project and the domain set so a retry of the SAME
 * request dedupes while a changed set does not.
 */
function idempotencyToken(projectId: string, wanted: string[]): string {
  const suffix = stableHash36(`${projectId}-${wanted.join(",")}`);
  return `d${projectId.replace(/-/g, "").slice(0, 24)}${suffix}`.slice(0, 32);
}

function sameDomainSet(a: string[], b: string[]): boolean {
  const left = canonicalDomains(a);
  const right = canonicalDomains(b);
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

interface DescribedCertificate {
  status: string;
  names: string[];
  validationRecords: Map<string, DnsValidationRecord>;
}

async function describeCertificate(
  acm: AcmClientBundle["acm"],
  mod: AcmClientBundle["mod"],
  arn: string,
): Promise<DescribedCertificate | null> {
  try {
    const res = await acm.send(new mod.DescribeCertificateCommand({ CertificateArn: arn }));
    const cert = res.Certificate;
    if (!cert) return null;

    const names = [
      ...(cert.DomainName ? [cert.DomainName] : []),
      ...(cert.SubjectAlternativeNames ?? []),
    ];

    const validationRecords = new Map<string, DnsValidationRecord>();
    for (const opt of cert.DomainValidationOptions ?? []) {
      // Matched by domain, never by index: index 0 is only correct for a
      // single-name certificate, and these are multi-SAN.
      const domain = opt.DomainName ? normalizeHost(opt.DomainName) : "";
      const rr = opt.ResourceRecord;
      if (domain && rr?.Name && rr.Type && rr.Value) {
        validationRecords.set(domain, { name: rr.Name, type: rr.Type, value: rr.Value });
      }
    }

    return { status: cert.Status || "PENDING_VALIDATION", names, validationRecords };
  } catch (err) {
    logger.warn({ err: getErrMsg(err), arn }, "[domains:static:aws] DescribeCertificate failed");
    return null;
  }
}

/** DescribeCertificate, retried briefly — ACM fills in the records a few seconds late. */
async function describeCertificateWithRetry(
  acm: AcmClientBundle["acm"],
  mod: AcmClientBundle["mod"],
  arn: string,
  attempts = 5,
): Promise<DescribedCertificate | null> {
  for (let i = 0; i < attempts; i++) {
    const described = await describeCertificate(acm, mod, arn);
    if (described && described.validationRecords.size > 0) return described;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  return await describeCertificate(acm, mod, arn);
}

/**
 * Delete this project's ACM certificates that are no longer in use.
 *
 * Closes the certificate leak: changing a domain set requests a NEW certificate
 * (ACM certs are immutable in their name list), and nothing used to delete the
 * old one, so unused certs accumulated in us-east-1 until the account hit its
 * ACM quota.
 *
 * Reaps BY TAG rather than by a stored ARN, deliberately. The orphan sweep runs
 * `deleteStaticCertRows` before this, dropping `provider_ref`, so the ARN is no
 * longer on any row — and a tag scan also reaps certs leaked by PAST changes,
 * not just the one this reconcile caused.
 *
 * `keepArn` is the certificate the distribution is now using (empty on a full
 * detach). Everything else tagged for this project is fair game.
 *
 * Best-effort and never throws: a cert ACM refuses to delete because the
 * distribution still references it (ResourceInUseException, during the 5-20 min
 * CloudFront propagation window) is simply skipped and reaped on a later
 * reconcile. Scoped to `dockier:managed=static-domains` so it can never touch a
 * certificate from another system.
 */
async function reapOrphanedCertificates(params: {
  target: AwsStaticTarget;
  projectId: string;
  keepArn: string;
}): Promise<void> {
  const { target, projectId, keepArn } = params;
  const keep = keepArn.trim();

  try {
    const { acm, mod } = await acmClient(target);
    const list = await acm.send(
      new mod.ListCertificatesCommand({
        CertificateStatuses: ["ISSUED", "PENDING_VALIDATION"],
      }),
    );

    for (const summary of list.CertificateSummaryList ?? []) {
      const arn = summary.CertificateArn;
      if (!arn || arn === keep) continue;

      const tags = await acm.send(new mod.ListTagsForCertificateCommand({ CertificateArn: arn }));
      const tagList = tags.Tags ?? [];
      const ownedByProject = tagList.some(
        (t) => t.Key === "dockier:projectId" && t.Value === projectId,
      );
      const managedByStatic = tagList.some(
        (t) => t.Key === "dockier:managed" && t.Value === "static-domains",
      );
      if (!ownedByProject || !managedByStatic) continue;

      try {
        await acm.send(new mod.DeleteCertificateCommand({ CertificateArn: arn }));
        logger.info({ projectId, arn }, "[domains:static:aws] reaped orphaned certificate");
      } catch (err) {
        // ResourceInUseException while CloudFront is still detaching is
        // expected; a later reconcile reaps it. Any other error is logged and
        // left for next time.
        logger.warn(
          { err: getErrMsg(err), projectId, arn },
          "[domains:static:aws] could not delete orphaned certificate yet",
        );
      }
    }
  } catch (err) {
    // The scan itself failing just means we try again next reconcile.
    logger.warn({ err: getErrMsg(err), projectId }, "[domains:static:aws] certificate reap scan failed");
  }
}

/**
 * Find a certificate this project already owns that covers exactly `wanted`.
 *
 * Prevents a certificate leak across the many ways a second apply can arrive
 * (job retry, user Sync, redeploy) once the idempotency window has closed.
 */
async function findAdoptableCertificate(
  acm: AcmClientBundle["acm"],
  mod: AcmClientBundle["mod"],
  projectId: string,
  wanted: string[],
): Promise<{ arn: string; status: string; validationRecords: Map<string, DnsValidationRecord> } | null> {
  try {
    const list = await acm.send(
      new mod.ListCertificatesCommand({ CertificateStatuses: ["ISSUED", "PENDING_VALIDATION"] }),
    );
    for (const summary of list.CertificateSummaryList ?? []) {
      const arn = summary.CertificateArn;
      if (!arn) continue;
      if (!summary.DomainName || normalizeHost(summary.DomainName) !== wanted[0]) continue;

      const tags = await acm.send(new mod.ListTagsForCertificateCommand({ CertificateArn: arn }));
      const ownedByProject = (tags.Tags ?? []).some(
        (t) => t.Key === "dockier:projectId" && t.Value === projectId,
      );
      if (!ownedByProject) continue;

      const described = await describeCertificate(acm, mod, arn);
      if (described && sameDomainSet(described.names, wanted)) {
        logger.info({ projectId, arn }, "[domains:static:aws] adopted an existing certificate");
        return { arn, status: described.status, validationRecords: described.validationRecords };
      }
    }
  } catch (err) {
    // Adoption is an optimization; a failure just means we may request a new one.
    logger.warn({ err: getErrMsg(err), projectId }, "[domains:static:aws] certificate adoption scan failed");
  }
  return null;
}

type StackUpdateResult =
  | {
      ok: true;
      /** The CloudFront update is running; observe it later rather than waiting. */
      inProgress: boolean;
      message: string;
    }
  | { ok: false; failure: StaticFailure };

/**
 * Point the distribution at a new alias list and certificate.
 *
 * Uses `UsePreviousTemplate` so no template needs staging in S3 — this runs
 * outside a deploy, where there is no build context. Returns as soon as
 * CloudFormation accepts the update: a CloudFront distribution update takes
 * 5-20 minutes and no job may block on it.
 */
async function updateStackDomainParameters(params: {
  target: AwsStaticTarget;
  aliases: string[];
  certificateArn: string;
}): Promise<StackUpdateResult> {
  const { target, aliases, certificateArn } = params;

  try {
    const { CloudFormationClient, UpdateStackCommand } = await getCfn();
    const cfn = new CloudFormationClient({ region: target.region, credentials: target.credentials });

    await cfn.send(
      new UpdateStackCommand({
        StackName: target.stackName,
        UsePreviousTemplate: true,
        Capabilities: ["CAPABILITY_NAMED_IAM"],
        Parameters: [
          { ParameterKey: "DomainAliases", ParameterValue: aliases.join(",") },
          { ParameterKey: "CertificateArn", ParameterValue: certificateArn },
          // Everything else keeps its current value.
          { ParameterKey: "AppName", UsePreviousValue: true },
          { ParameterKey: "BuildId", UsePreviousValue: true },
          { ParameterKey: "SourceBucket", UsePreviousValue: true },
          { ParameterKey: "ErrorPagePath", UsePreviousValue: true },
          { ParameterKey: "ErrorResponseCode", UsePreviousValue: true },
          { ParameterKey: "CallbackUrl", UsePreviousValue: true },
        ],
      }),
    );

    return { ok: true, inProgress: true, message: "CloudFront update started." };
  } catch (err) {
    const msg = getErrMsg(err);

    // Nothing to change — the distribution already has these aliases. Not a
    // failure, so it is classified before anything else.
    if (/No updates are to be performed/i.test(msg)) {
      return { ok: true, inProgress: false, message: "Distribution already up to date." };
    }

    const failure = classifyAwsError(err, { operation: "cloudformation:UpdateStack" });
    logger.error(
      { stackName: target.stackName, kind: failure.kind, detail: failure.detail },
      "[domains:static:aws] stack update failed",
    );
    return { ok: false, failure };
  }
}

/** The DNS records a user must publish for an AWS static domain. */
export function awsDnsInstructions(params: {
  target: AwsStaticTarget;
  domainName: string;
  validationRecord: DnsValidationRecord | null;
}): {
  records: Array<{ name: string; type: string; value: string; purpose: string }>;
  note: string;
} {
  const { target, domainName, validationRecord } = params;
  const records: Array<{ name: string; type: string; value: string; purpose: string }> = [];

  if (validationRecord) {
    records.push({
      name: validationRecord.name,
      type: validationRecord.type,
      value: validationRecord.value,
      purpose: "Proves you own the domain so AWS can issue the certificate. Can be removed after issuance, but leaving it in place lets AWS renew automatically.",
    });
  }

  records.push({
    name: domainName,
    type: "CNAME",
    value: target.distributionDomain,
    purpose: "Routes visitors to the CDN.",
  });

  return {
    records,
    note:
      "Publish both records at your DNS provider. Certificate validation usually takes a few minutes " +
      "once the record is visible; attaching it to the CDN then takes 5-20 minutes.",
  };
}
