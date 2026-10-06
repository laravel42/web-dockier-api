/**
 * Failure classification for static-hosting custom domains.
 *
 * Exists because the incident this module was written for reported a permanent
 * schema mismatch as `retryable: true` with "Try Sync again" — so the user
 * retried, forever, an operation that could never succeed, while the real
 * Postgres error sat in a `warn` log they had no access to.
 *
 * Two rules hold everything together:
 *
 *   1. `retryable` is DERIVED from `kind` inside this module and is never a
 *      parameter. A caller cannot produce a failure whose kind and retryability
 *      disagree.
 *   2. `message` is user-facing and never carries provider identifiers. An AWS
 *      authorization error quotes the full principal ARN — account id and IAM
 *      path included — which belongs in `detail.raw` for the operator log only.
 */

import { getErrMsg } from "../../../../shared/utils/error-message.js";

/**
 * Why an operation failed, at the granularity that changes what the user or
 * operator must do about it.
 */
export type FailureKind =
  | "schema_drift"
  | "permissions"
  | "quota"
  | "conflict"
  | "stale_stack"
  | "transient"
  | "unknown";

/** Diagnostic detail for logs. Never rendered to a user. */
export interface FailureDetail {
  code?: string;
  details?: string;
  hint?: string;
  raw?: string;
}

export interface StaticFailure {
  kind: FailureKind;
  /** Derived from `kind`. Never set by a caller. */
  retryable: boolean;
  /** User-facing, descriptive, and free of provider identifiers. */
  message: string;
  detail: FailureDetail;
}

/**
 * The single source of truth for retryability.
 *
 * `unknown` is retryable on purpose: an unrecognised error is more often a
 * transient blip than a permanent misconfiguration, and the cost of one wasted
 * retry is lower than stranding a recoverable attachment in `failed`.
 */
const RETRYABLE_BY_KIND: Record<FailureKind, boolean> = {
  schema_drift: false,
  permissions: false,
  quota: false,
  conflict: false,
  stale_stack: false,
  transient: true,
  unknown: true,
};

function failure(kind: FailureKind, message: string, detail: FailureDetail = {}): StaticFailure {
  return { kind, retryable: RETRYABLE_BY_KIND[kind], message, detail };
}

/** The shape of a supabase-js `PostgrestError`, structurally. */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** PostgREST: a column named in the request is absent from its schema cache. */
const PGRST_UNDEFINED_COLUMN = "PGRST204";
/** Postgres: undefined column. */
const PG_UNDEFINED_COLUMN = "42703";
/** Postgres: check-constraint violation. */
const PG_CHECK_VIOLATION = "23514";

const SCHEMA_DRIFT_CODES = new Set<string>([
  PGRST_UNDEFINED_COLUMN,
  PG_UNDEFINED_COLUMN,
  PG_CHECK_VIOLATION,
]);

const SCHEMA_DRIFT_MESSAGE =
  "A database change that custom domains depend on has not been applied to this " +
  "environment, so the certificate state could not be saved. Retrying will not " +
  "help. An operator needs to run `pnpm db:migrate`; `GET /readyz` reports which " +
  "migrations are missing.";

function detailOf(error: DbErrorLike): FailureDetail {
  return {
    code: error.code ?? undefined,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
    raw: error.message ?? undefined,
  };
}

/**
 * Classify a database error.
 *
 * `23505` (unique violation) is deliberately NOT handled here: it means a
 * concurrent insert won the race, which `ensureStaticCertRow` resolves by
 * re-reading rather than by reporting a failure.
 */
export function classifyDbError(
  error: DbErrorLike,
  ctx: { operation: string; domainName?: string },
): StaticFailure {
  const code = error.code ?? "";

  if (SCHEMA_DRIFT_CODES.has(code)) {
    return failure("schema_drift", SCHEMA_DRIFT_MESSAGE, detailOf(error));
  }

  const subject = ctx.domainName ? ` for ${ctx.domainName}` : "";
  return failure(
    "transient",
    `The certificate state${subject} could not be saved (${ctx.operation}). This is usually temporary and will be retried.`,
    detailOf(error),
  );
}

/** Pull the denied action out of an AWS authorization message, if it names one. */
function deniedAction(raw: string): string | null {
  const match = /not authorized to perform:\s*([a-z0-9]+:[A-Za-z]+)/.exec(raw);
  return match?.[1] ?? null;
}

const PERMISSION_NAMES =
  /^(AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationError)$/i;

function errorName(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  const candidate = err as { name?: unknown; Code?: unknown };
  if (typeof candidate.name === "string") return candidate.name;
  if (typeof candidate.Code === "string") return candidate.Code;
  return "";
}

/**
 * Classify an AWS SDK error.
 *
 * The classifications here were previously spread across `updateStackDomainParameters`
 * and `ensureCertificateForDomains` as inline regex branches with their own
 * messages. Those messages are preserved verbatim — this moves them, it does not
 * rewrite them.
 */
export function classifyAwsError(err: unknown, ctx: { operation: string }): StaticFailure {
  const raw = getErrMsg(err);
  const name = errorName(err);
  const detail: FailureDetail = { code: name || undefined, raw };

  if (PERMISSION_NAMES.test(name) || /is not authorized to perform/i.test(raw)) {
    const action = deniedAction(raw) ?? ctx.operation;
    return failure(
      "permissions",
      `The AWS credentials for this project are not allowed to perform \`${action}\`. ` +
        "Retrying will not help until the permission is granted. Add the ACM statements from " +
        "`docs/operations/aws-static-hosting-iam.md` to the IAM user or role these credentials " +
        "belong to, then run Sync again.",
      detail,
    );
  }

  if (/LimitExceeded/i.test(raw)) {
    return failure(
      "quota",
      "Your AWS account has reached its ACM certificate limit. Remove unused certificates in " +
        "AWS Certificate Manager (us-east-1), or request a quota increase, then try again.",
      detail,
    );
  }

  if (/CNAMEAlreadyExists/i.test(raw)) {
    return failure(
      "conflict",
      "One of these domains is already attached to another CloudFront distribution. " +
        "Remove it there first, or use a different subdomain.",
      detail,
    );
  }

  if (/(Parameters?: \[)?(DomainAliases|CertificateArn)/i.test(raw) && /do not exist|not exist|invalid/i.test(raw)) {
    return failure(
      "stale_stack",
      "This site was deployed before custom domains were supported. Redeploy the project once, " +
        "then add the domain again — the redeploy adds the CloudFront settings a domain needs.",
      detail,
    );
  }

  if (/_IN_PROGRESS|is in .* state and can not be updated/i.test(raw)) {
    return failure("transient", "The site is already being updated. This will be retried shortly.", detail);
  }

  if (/Throttl|TooManyRequests|RequestLimitExceeded|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|NetworkingError|TimeoutError/i.test(
    `${name} ${raw}`,
  )) {
    return failure(
      "transient",
      `AWS could not be reached while running ${ctx.operation}. This will be retried shortly.`,
      detail,
    );
  }

  return failure("unknown", `${ctx.operation} failed: ${raw}`, detail);
}
