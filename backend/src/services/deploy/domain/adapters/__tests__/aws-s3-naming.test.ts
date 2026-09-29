import { describe, expect, it, vi } from "vitest";

// aws-s3 imports provider-credentials, which pulls in the Supabase client and
// reads config at module load. Stub it — these are pure-function tests.
vi.mock("../../../../../lib/provider-credentials.js", () => ({
  toAwsCredentials: vi.fn(() => ({ accessKeyId: "", secretAccessKey: "" })),
}));

const { staticSiteBucketName, templateBucketName } = await import("../aws-s3.js");

const ACCOUNT = "251486138355"; // 12 digits, as AWS account ids always are

/**
 * S3 bucket naming for static sites.
 *
 * Two properties matter and neither is obvious from reading the call site:
 *
 * 1. STABILITY. `destroy()` recomputes the bucket name to delete it, and the
 *    CloudFormation origin points at it. Anything per-deploy in the name (a
 *    deployment id, a commit sha) would create a new bucket every deploy,
 *    orphan the previous one, and leave teardown deleting the wrong thing.
 *
 * 2. THE `dockier-` PREFIX. Bucket names are globally unique across all of AWS,
 *    so the account id is what stops a generic repo name colliding with a
 *    stranger's bucket. It also lets the tenant IAM policy scope S3 to
 *    `arn:aws:s3:::dockier-*` instead of a wildcard matching unrelated buckets.
 */
describe("staticSiteBucketName", () => {
  it("is namespaced and account-scoped", () => {
    expect(staticSiteBucketName(ACCOUNT, "web-inky")).toBe("dockier-251486138355-web-inky-static");
  });

  it("is stable for the same account and repo", () => {
    const a = staticSiteBucketName(ACCOUNT, "web-inky");
    const b = staticSiteBucketName(ACCOUNT, "web-inky");
    expect(a).toBe(b);
  });

  it("differs per account, so two tenants deploying the same repo do not collide", () => {
    expect(staticSiteBucketName("111111111111", "site")).not.toBe(
      staticSiteBucketName("222222222222", "site"),
    );
  });

  it("differs per repo within an account", () => {
    expect(staticSiteBucketName(ACCOUNT, "site-a")).not.toBe(staticSiteBucketName(ACCOUNT, "site-b"));
  });

  describe("S3 naming rules", () => {
    const cases: Array<[string, string]> = [
      ["My_Repo.Name", "underscores and dots"],
      ["UPPERCASE", "uppercase"],
      ["--leading-and-trailing--", "stray hyphens"],
      ["a__b..c", "consecutive separators"],
      ["x", "very short names"],
      ["", "an empty repo name"],
      ["a".repeat(120), "very long names"],
    ];

    for (const [repo, label] of cases) {
      it(`produces a valid bucket name for ${label}`, () => {
        const name = staticSiteBucketName(ACCOUNT, repo);
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(name.length).toBeLessThanOrEqual(63);
        // Lowercase alphanumerics and single hyphens, starting and ending alphanumeric.
        expect(name).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
        expect(name).not.toMatch(/--/);
        expect(name.startsWith("dockier-")).toBe(true);
      });
    }

    it("stays within 63 characters even with a very long repo name", () => {
      // The previous scheme truncated the repo to 51 chars to leave room for
      // "-static-site". The prefix and account id changed that budget, so this
      // guards the recomputed value.
      const name = staticSiteBucketName(ACCOUNT, "a".repeat(200));
      expect(name.length).toBe(63);
      expect(name.endsWith("-static")).toBe(true);
    });
  });
});

describe("templateBucketName", () => {
  it("is one bucket per account, under the same namespace", () => {
    expect(templateBucketName(ACCOUNT)).toBe("dockier-251486138355-templates");
  });

  it("is within the S3 length limit", () => {
    expect(templateBucketName(ACCOUNT).length).toBeLessThanOrEqual(63);
  });

  it("no longer uses the legacy image-builder prefix", () => {
    // Was `image-builder-templates-<account>`, which fell outside a dockier-*
    // scoped IAM policy.
    expect(templateBucketName(ACCOUNT)).not.toContain("image-builder");
  });
});
