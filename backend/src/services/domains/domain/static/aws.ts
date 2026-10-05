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
import { isApexDomain, apexRefusalMessage, normalizeHost } from "./apex.js";
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

/** How long we keep waiting for a certificate before calling it timed out. */
const CERT_DEADLINE_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface StaticApplyOutcome {
  success: boolean;
  retryable?: boolean;
  message: string;
  /** True when at least one domain is serving over TLS. */
  anyLive?: boolean;
}

interface AcmClientBundle {
  acm: InstanceType<Awaited<ReturnType<typeof getAcm>>["ACMClient"]>;
  mod: Awaited<ReturnType<typeof getAcm>>;
}

async function acmClient(target: AwsStaticTarget): Promise<AcmClientBundle> {
  const mod = await getAcm();
  const acm = new mod.ACMClient({ region: ACM_REGION, credentials: target.credentials });
  return { acm, mod };
}

/** Sorted, normalized, de-duplicated — the canonical form of a domain set. */
function canonicalDomains(names: string[]): string[] {
  return [...new Set(names.map(normalizeHost).filter(Boolean))].sort();
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

    for (const d of domains) {
      const name = normalizeHost(d.name);
      if (isApexDomain(name)) {
        apexRejected.push(name);
        const row = await ensureStaticCertRow({
          tenantId,
          projectId,
          domainName: name,
          domainId: d.id,
          type: "acm",
        });
        if (row) {
          await setCertState(row.id, {
            status: "failed",
            verificationState: "failed",
            verificationMessage: apexRefusalMessage(name),
          });
        }
        continue;
      }
      usable.push({ id: d.id, name });
    }

    // ── Drop certificate rows for domains no longer configured ──
    const existingRows = await listStaticCertRows(projectId);
    const configured = new Set([...usable.map((d) => d.name), ...apexRejected]);
    const orphaned = existingRows.filter((r) => !configured.has(normalizeHost(r.domainName)));
    if (orphaned.length > 0) {
      // Detach first: ACM refuses to delete a certificate a distribution is
      // using, so the alias must come off before the certificate goes.
      await deleteStaticCertRows(projectId, orphaned.map((r) => r.domainName));
    }

    if (usable.length === 0) {
      // Nothing left to serve — clear the aliases off the distribution.
      const detached = await updateStackDomainParameters({ target, aliases: [], certificateArn: "" });
      const apexNote = apexRejected.length > 0 ? ` ${apexRefusalMessage(apexRejected[0])}` : "";
      if (!detached.ok) {
        return { success: false, retryable: detached.retryable, message: detached.message };
      }
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
      const row = await ensureStaticCertRow({
        tenantId,
        projectId,
        domainName: d.name,
        domainId: d.id,
        type: "acm",
      });
      if (!row) {
        return {
          success: false,
          retryable: true,
          message: `Could not record certificate state for ${d.name}. Try Sync again.`,
        };
      }
      rows.set(d.name, row);
    }

    // ── One certificate covering every usable domain ──
    const cert = await ensureCertificateForDomains({ target, projectId, wanted, rows: [...rows.values()] });
    if (!cert.ok) {
      return { success: false, retryable: cert.retryable, message: cert.message };
    }

    // Persist the ARN and each domain's own validation record.
    for (const [name, row] of rows) {
      const record = cert.validationRecords.get(name) ?? null;
      await setCertState(row.id, {
        providerRef: cert.arn,
        validationRecord: record,
        status: cert.issued ? "active" : "pending",
        verificationState: cert.issued ? "attaching" : "awaiting_dns",
        verificationMessage: cert.issued
          ? "Certificate issued. Attaching it to the CDN — this usually takes 5-20 minutes."
          : record
            ? "Publish the validation record shown here, then the certificate will be issued automatically."
            : "Waiting for the certificate validation record from AWS.",
        issuedAt: cert.issued ? nowIso() : undefined,
      });
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
      for (const row of rows.values()) {
        await setCertState(row.id, {
          verificationState: "failed",
          verificationMessage: attach.message,
        });
      }
      return { success: false, retryable: attach.retryable, message: attach.message };
    }

    for (const row of rows.values()) {
      await setCertState(row.id, {
        verificationState: attach.inProgress ? "attaching" : "live",
        verificationMessage: attach.inProgress
          ? "Certificate issued. The CDN update is in progress — usually 5-20 minutes."
          : null,
        attachStartedAt: attach.inProgress ? nowIso() : undefined,
      });
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
type CertificateFailure = { ok: false; retryable: boolean; message: string };

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
      return { ok: false, retryable: true, message: "AWS did not return a certificate ARN. Try Sync again." };
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
    const msg = getErrMsg(err);
    logger.error({ err: msg, projectId }, "[domains:static:aws] RequestCertificate failed");
    if (/LimitExceeded/i.test(msg)) {
      return {
        ok: false,
        retryable: false,
        message:
          "Your AWS account has reached its ACM certificate limit. Remove unused certificates in " +
          "AWS Certificate Manager (us-east-1), or request a quota increase, then try again.",
      };
    }
    return { ok: false, retryable: true, message: `Could not request a certificate: ${msg}` };
  }
}

/**
 * ACM's IdempotencyToken: max 32 chars, and must differ when the request
 * differs. Derived from the project and the domain set so a retry of the SAME
 * request dedupes while a changed set does not.
 */
function idempotencyToken(projectId: string, wanted: string[]): string {
  const raw = `${projectId}-${wanted.join(",")}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36);
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

interface StackUpdateResult {
  ok: boolean;
  retryable: boolean;
  /** The CloudFront update is running; observe it later rather than waiting. */
  inProgress: boolean;
  message: string;
}

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

    return { ok: true, retryable: false, inProgress: true, message: "CloudFront update started." };
  } catch (err) {
    const msg = getErrMsg(err);

    // Nothing to change — the distribution already has these aliases.
    if (/No updates are to be performed/i.test(msg)) {
      return { ok: true, retryable: false, inProgress: false, message: "Distribution already up to date." };
    }

    // The stack was created before the template gained these parameters.
    if (/(Parameters?: \[)?(DomainAliases|CertificateArn)/i.test(msg) && /do not exist|not exist|invalid/i.test(msg)) {
      return {
        ok: false,
        retryable: false,
        inProgress: false,
        message:
          "This site was deployed before custom domains were supported. Redeploy the project once, " +
          "then add the domain again — the redeploy adds the CloudFront settings a domain needs.",
      };
    }

    if (/CNAMEAlreadyExists/i.test(msg)) {
      return {
        ok: false,
        retryable: false,
        inProgress: false,
        message:
          `One of these domains is already attached to another CloudFront distribution. ` +
          `Remove it there first, or use a different subdomain.`,
      };
    }

    if (/_IN_PROGRESS|is in .* state and can not be updated/i.test(msg)) {
      return {
        ok: false,
        retryable: true,
        inProgress: false,
        message: "The site is already being updated. This will be retried shortly.",
      };
    }

    logger.error({ err: msg, stackName: target.stackName }, "[domains:static:aws] stack update failed");
    return { ok: false, retryable: true, inProgress: false, message: `Could not update the CDN: ${msg}` };
  }
}

/** True when a certificate has been waiting past the point worth waiting. */
export function isPastCertDeadline(startedAtIso: string | null, now = Date.now()): boolean {
  if (!startedAtIso) return false;
  const started = Date.parse(startedAtIso);
  if (Number.isNaN(started)) return false;
  return now - started > CERT_DEADLINE_MS;
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
