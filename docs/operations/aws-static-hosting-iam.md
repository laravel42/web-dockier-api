# AWS IAM policy for static site hosting

Static deploys (`deployStrategy: "static"`) run through `AwsS3Adapter`, which uses
the **tenant's own AWS credentials** from their configured server provider. Those
credentials need permissions beyond a VPS/ECS deploy, because the adapter creates
an S3 bucket and a CloudFront distribution directly.

Derived from `backend/src/services/deploy/domain/adapters/aws-s3.ts`, the
`s3.yml` CloudFormation template, and `infra/aws-helpers.ts`. If any of those
change, update this document.

## Resource namespace

Every bucket Dockier creates is `dockier-<account-id>-…`:

| Resource | Name |
|---|---|
| Built site | `dockier-<account-id>-<repo>-static` |
| CloudFormation template staging | `dockier-<account-id>-templates` |

Both are produced by `staticSiteBucketName()` / `templateBucketName()` in the
adapter — the naming rule lives there and nowhere else. `s3.yml` receives the
bucket name through its required `SourceBucket` parameter rather than deriving it,
so the two cannot drift.

Two reasons for this shape. S3 bucket names are **globally unique across all of
AWS**, so the account id is what stops a generic repo name colliding with a
stranger's bucket. And it lets the policy below scope S3 to
`arn:aws:s3:::dockier-*` instead of a pattern like `*-static-site`, which would
grant access to any similarly-named bucket in any account.

The site bucket name is deliberately **stable across deploys** — derived from the
account and repo only. `destroy()` recomputes it to delete the bucket and the
CloudFront origin points at it, so folding anything per-deploy into the name
would create a new bucket each deploy, orphan the previous one, and leave
teardown deleting the wrong thing.

> **Note:** CloudFormation **stack** names are still `image-builder-app-<name>`
> via `lib/naming.ts`. That prefix is legacy, shared with the EC2 and ECS
> adapters, and cannot be renamed without orphaning live stacks — see the
> namespace-migration task in `.kiro/specs/static-deploy-targets/tasks.md`.

## What the adapter does, and what each step needs

| Step | Code | Permission |
|---|---|---|
| Resolve account id | `getAwsAccountId()` | `sts:GetCallerIdentity` |
| Check / create the site bucket | `ensureS3Bucket()` → `HeadBucket`, `CreateBucket` | `s3:ListBucket`, `s3:CreateBucket` |
| Allow CloudFront OAC to read | `PutPublicAccessBlockCommand` | `s3:PutBucketPublicAccessBlock` |
| Upload the built site | `syncFilesToS3()` | `s3:PutObject` |
| Stage the CFN template | `ensureS3Bucket` + `PutObject` on the templates bucket | `s3:CreateBucket`, `s3:PutObject` |
| Create / update the stack | `createOrUpdateStack()`, `pollStackStatus()` | `cloudformation:CreateStack`, `UpdateStack`, `DescribeStacks` |
| Bucket policy for the distribution | `AWS::S3::BucketPolicy` in `s3.yml` | `s3:PutBucketPolicy`, `s3:GetBucketPolicy` |
| CDN + origin access | `AWS::CloudFront::Distribution`, `AWS::CloudFront::OriginAccessControl` | `cloudfront:*Distribution*`, `cloudfront:*OriginAccessControl*` |
| Clean-URL rewriting | `AWS::CloudFront::Function` in `s3.yml` | `cloudfront:CreateFunction`, `PublishFunction`, `UpdateFunction`, `DescribeFunction`, `GetFunction`, `DeleteFunction` |
| Teardown | `destroy()` | `s3:DeleteObject`, `s3:DeleteBucket`, `cloudformation:DeleteStack`, `cloudfront:DeleteDistribution` |

Without a CloudFormation service role, CloudFormation performs its operations
using the permissions of the **calling identity**. That is why the caller needs
the CloudFront and bucket-policy permissions even though CloudFormation makes
those calls. Introducing a dedicated service role later would move those
permissions onto the role and require only `iam:PassRole` here — a worthwhile
tightening, but out of scope for now.

## Policy

CloudFormation actions are limited to the five the code actually invokes:
`CreateStack`, `UpdateStack`, `DescribeStacks`, `DeleteStack`, and
`DescribeStackEvents`.

`DescribeStackEvents` is what makes a failed deploy diagnosable. A rolled-back
stack reports an empty `StackStatusReason`, so without events the log can only
say "UPDATE_ROLLBACK_COMPLETE" and the user has no idea which resource broke.
Diagnosis is best-effort — if the permission is missing, the deploy still fails
with the status alone plus a warning, rather than failing differently.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AccountIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "DockierBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketPublicAccessBlock",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:DeleteBucket"
      ],
      "Resource": "arn:aws:s3:::dockier-*"
    },
    {
      "Sid": "DockierBucketObjects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::dockier-*/*"
    },
    {
      "Sid": "StackManagement",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DeleteStack"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CdnDistribution",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:TagResource",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl",
        "cloudfront:DeleteOriginAccessControl",
        "cloudfront:CreateFunction",
        "cloudfront:PublishFunction",
        "cloudfront:UpdateFunction",
        "cloudfront:DescribeFunction",
        "cloudfront:GetFunction",
        "cloudfront:DeleteFunction",
        "cloudfront:ListTagsForResource"
      ],
      "Resource": "*"
    }
  ]
}
```

CloudFront does not support resource-level permissions for these actions, hence
`"Resource": "*"` there.

`cloudfront:CreateInvalidation` is **not** included. No code path calls
CloudFront directly today, so it would be an unused grant. It becomes necessary
when we add explicit invalidation — see the notes below.

## Notes

- **`s3:ListBucket` covers `HeadBucket`.** There is no `s3:HeadBucket` action —
  the existence check in `ensureS3Bucket` is authorized by `s3:ListBucket`. A
  missing bucket surfaces as a 404 and the adapter creates it; a *permissions*
  failure surfaces as a 403 and is rethrown.
- **Cache invalidation is not currently needed for correctness.** The
  distribution uses CloudFront's CachingOptimized policy
  (`658327ea-f89d-4fab-a63d-7e88639e58f6`), which respects origin
  `Cache-Control`. The adapter uploads HTML as `no-cache` and hashed assets as
  `immutable`, so a redeploy serves fresh content. Explicit invalidation is still
  worth adding for forced refreshes and for sites with unhashed assets.
- **First distribution is slow.** CloudFront takes 15–20 minutes to provision and
  about as long to delete. A deploy sitting in `deploying` is usually normal.
- **`us-east-1` is special.** `CreateBucket` omits `LocationConstraint` there and
  sets it everywhere else; handled in `lib/aws.ts`.
- **`cloudfront:ListTagsForResource` is required even though no Dockier code
  calls it.** CloudFormation's *read* handler for CloudFront resources looks up
  tags, and a `Fn::GetAtt` against a resource triggers that read. Without it,
  `!GetAtt UriRewriteFunction.FunctionMetadata.FunctionARN` fails with
  `Access denied for operation 'AWS::CloudFront::Function'` **after** the function
  has been created successfully, and the whole stack update rolls back. Using the
  alternative `FunctionARN` attribute does not avoid it — both go through the same
  read handler. This is the one permission that cannot be derived from the
  adapter's own SDK calls.
  If a future template change *removes* a tag rather than changing its value,
  `cloudfront:UntagResource` will be needed too; changing a value only needs
  `TagResource`, which is already granted.
- **Clean URLs need the CloudFront Function.** OAC requires an S3 *REST* origin,
  which resolves a request path to an object key verbatim — no `.html` suffixing
  and no directory index resolution beyond `DefaultRootObject` for `/`. Without
  the `UriRewriteFunction` in `s3.yml`, a site built to `editor.html` is
  unreachable at `/editor`: S3 answers no-such-key and the request falls through
  to `CustomErrorResponses`. If the new `cloudfront:*Function*` permissions are
  missing, stack creation fails outright rather than degrading.
- **Error responses are per-site-shape.** `ErrorPagePath` / `ErrorResponseCode`
  are set by the adapter from the build's object keys (`notFoundBehaviourFor()`):
  an SPA gets `/index.html` with 200 so its router can handle the route, a
  multi-page site gets `/404.html` with 404. The template previously hardcoded
  the SPA behaviour for everything, which made every sub-page of a multi-page
  site render the homepage with a success status.
- **Custom domains are not covered.** They additionally need ACM in `us-east-1`
  plus DNS — Phase 4 of `.kiro/specs/static-deploy-targets/`.
