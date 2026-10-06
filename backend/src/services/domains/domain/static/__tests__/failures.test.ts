import { describe, expect, it } from "vitest";

import { classifyAwsError, classifyDbError, type FailureKind } from "../failures.js";

/** An AWS SDK error carries its discriminator on `name`, sometimes on `Code`. */
function awsError(name: string, message: string): Error & { name: string } {
  const err = new Error(message);
  err.name = name;
  return err as Error & { name: string };
}

describe("classifyDbError", () => {
  it("treats PostgREST's unknown-column error as permanent schema drift", () => {
    const failure = classifyDbError(
      {
        code: "PGRST204",
        message: "Could not find the 'verification_state' column of 'ssl_certificates'",
      },
      { operation: "create certificate row", domainName: "www.example.com" },
    );

    expect(failure.kind).toBe<FailureKind>("schema_drift");
    expect(failure.retryable).toBe(false);
    // The whole point: never tell the user to retry something that cannot work.
    expect(failure.message).not.toMatch(/try .*again/i);
    expect(failure.message).toMatch(/pnpm db:migrate/);
    expect(failure.message).toMatch(/readyz/);
  });

  it("treats Postgres undefined-column as permanent schema drift", () => {
    const failure = classifyDbError(
      { code: "42703", message: 'column "attach_started_at" does not exist' },
      { operation: "read certificate row" },
    );

    expect(failure.kind).toBe<FailureKind>("schema_drift");
    expect(failure.retryable).toBe(false);
  });

  it("treats a check-constraint violation as permanent schema drift", () => {
    // The incident's second constraint: the pre-0075 `type` CHECK rejects 'acm'.
    const failure = classifyDbError(
      {
        code: "23514",
        message: 'new row violates check constraint "ssl_certificates_type_check"',
      },
      { operation: "create certificate row" },
    );

    expect(failure.kind).toBe<FailureKind>("schema_drift");
    expect(failure.retryable).toBe(false);
  });

  it("treats anything else as transient and names the domain", () => {
    const failure = classifyDbError(
      { code: "08006", message: "connection terminated unexpectedly" },
      { operation: "create certificate row", domainName: "www.example.com" },
    );

    expect(failure.kind).toBe<FailureKind>("transient");
    expect(failure.retryable).toBe(true);
    expect(failure.message).toContain("www.example.com");
  });

  it("carries code, details and hint into detail rather than the message", () => {
    const failure = classifyDbError(
      {
        code: "PGRST204",
        message: "Could not find the column",
        details: "some details",
        hint: "some hint",
      },
      { operation: "create certificate row" },
    );

    expect(failure.detail).toEqual({
      code: "PGRST204",
      details: "some details",
      hint: "some hint",
      raw: "Could not find the column",
    });
  });

  it("does not classify a unique violation — that is a concurrent insert", () => {
    // 23505 is resolved by re-reading in ensureStaticCertRow, so if it ever
    // does reach the classifier it must not be reported as permanent.
    const failure = classifyDbError(
      { code: "23505", message: "duplicate key value violates unique constraint" },
      { operation: "create certificate row" },
    );

    expect(failure.kind).not.toBe<FailureKind>("schema_drift");
    expect(failure.retryable).toBe(true);
  });
});

describe("classifyAwsError", () => {
  it("classifies an authorization failure and names the denied action", () => {
    // The exact shape of the incident's third blocker.
    const failure = classifyAwsError(
      awsError(
        "AccessDeniedException",
        "User: arn:aws:iam::251486138355:user/dockier-dev is not authorized to perform: " +
          "acm:RequestCertificate on resource: arn:aws:acm:us-east-1:251486138355:certificate/* " +
          "because no identity-based policy allows the acm:RequestCertificate action",
      ),
      { operation: "acm:RequestCertificate" },
    );

    expect(failure.kind).toBe<FailureKind>("permissions");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("acm:RequestCertificate");
    expect(failure.message).toContain("docs/operations/aws-static-hosting-iam.md");
    expect(failure.message).not.toMatch(/try .*again/i);
  });

  it("never leaks the principal ARN into the user-facing message", () => {
    const failure = classifyAwsError(
      awsError(
        "AccessDenied",
        "User: arn:aws:iam::251486138355:user/dockier-dev is not authorized to perform: acm:DescribeCertificate",
      ),
      { operation: "acm:DescribeCertificate" },
    );

    // The ARN carries the account id and the IAM path — log only.
    expect(failure.message).not.toContain("arn:aws:iam::");
    expect(failure.message).not.toContain("251486138355");
    expect(failure.detail.raw).toContain("arn:aws:iam::");
  });

  it("falls back to the operation when the message names no action", () => {
    const failure = classifyAwsError(awsError("AccessDenied", "forbidden"), {
      operation: "cloudformation:UpdateStack",
    });

    expect(failure.kind).toBe<FailureKind>("permissions");
    expect(failure.message).toContain("cloudformation:UpdateStack");
  });

  it("classifies an ACM quota failure as permanent", () => {
    const failure = classifyAwsError(
      awsError("LimitExceededException", "LimitExceeded: too many certificates"),
      { operation: "acm:RequestCertificate" },
    );

    expect(failure.kind).toBe<FailureKind>("quota");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/us-east-1/);
  });

  it("classifies an alias already claimed elsewhere as a permanent conflict", () => {
    const failure = classifyAwsError(
      awsError("InvalidParameterValueException", "CNAMEAlreadyExists: one of the CNAMEs is already in use"),
      { operation: "cloudformation:UpdateStack" },
    );

    expect(failure.kind).toBe<FailureKind>("conflict");
    expect(failure.retryable).toBe(false);
  });

  it("classifies a pre-parameters stack as permanent and says to redeploy", () => {
    const failure = classifyAwsError(
      awsError(
        "ValidationError",
        "Parameters: [DomainAliases, CertificateArn] do not exist in the template",
      ),
      { operation: "cloudformation:UpdateStack" },
    );

    expect(failure.kind).toBe<FailureKind>("stale_stack");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/redeploy/i);
  });

  it("classifies a stack mid-update as transient", () => {
    const failure = classifyAwsError(
      awsError(
        "ValidationError",
        "Stack:arn is in UPDATE_IN_PROGRESS state and can not be updated",
      ),
      { operation: "cloudformation:UpdateStack" },
    );

    expect(failure.kind).toBe<FailureKind>("transient");
    expect(failure.retryable).toBe(true);
  });

  it("classifies throttling and network errors as transient", () => {
    const throttled = classifyAwsError(awsError("ThrottlingException", "Rate exceeded"), {
      operation: "acm:RequestCertificate",
    });
    expect(throttled.kind).toBe<FailureKind>("transient");
    expect(throttled.retryable).toBe(true);

    const network = classifyAwsError(awsError("TimeoutError", "socket hang up ETIMEDOUT"), {
      operation: "acm:RequestCertificate",
    });
    expect(network.kind).toBe<FailureKind>("transient");
    expect(network.retryable).toBe(true);
  });

  it("falls back to unknown, which stays retryable", () => {
    const failure = classifyAwsError(awsError("WeirdError", "something nobody predicted"), {
      operation: "acm:RequestCertificate",
    });

    expect(failure.kind).toBe<FailureKind>("unknown");
    // An unrecognised error is more often a blip than a misconfiguration, and
    // stranding a recoverable attachment in `failed` is the worse mistake.
    expect(failure.retryable).toBe(true);
    expect(failure.message).toContain("something nobody predicted");
  });
});
