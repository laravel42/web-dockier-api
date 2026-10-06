# Requirements Document — Custom Domain UX (static deploys)

**Status:** Draft — two open decisions (D1, D2) must be resolved in design before implementation.
**Scope anchor:** `AGENTS.md` → *Custom domains for static deployments* is the binding design record for this subsystem. Nothing here may contradict it without amending it.
**Grounded in:** `.agents/tasks/cert-state-write-failure-2026-10-06.md` and `.agents/tasks/iam-policy-static-domains-2026-10-06.md` — two completed, empirically verified investigations. Their findings are treated here as established fact and are not re-derived.

## Introduction

Attaching a custom domain to a static-strategy project works, but only for a user who is willing to debug it. The feature shipped with the mechanics correct and the experience absent.

The incident that motivates this spec is a single real attachment: `www.skmdesignstudio.com` onto a static project on AWS (distribution `d3d8fr298zex5t.cloudfront.net`, stack `image-builder-app-web-inky`, account `251486138355`, DNS at DonDominio). It took four rounds of manual intervention, two of which required reading backend source to understand:

1. **An apex domain was accepted that can never work.** The user added the zone root `skmdesignstudio.com`. The add succeeded. Only later, during DNS verification, did the system instruct them to *"Add a CNAME pointing at d3d8fr298zex5t.cloudfront.net"* — a record DNS forbids at a zone root. Their registrar rejected it with `La zona DNS tiene un formato incorrecto [CNAME Err 1]`. `AGENTS.md` states apex domains are refused with an actionable message on AWS; the refusal exists (`static/aws.ts:86-106`, `apex.ts:apexRefusalMessage`) but fires during *reconcile*, not at the moment of input, and the verification path emits generic CNAME guidance with no awareness that the host is an apex.
2. **A permanent failure was reported as retryable.** With `www`, DNS verification passed, and `Sync now` returned *"Could not record certificate state for www.skmdesignstudio.com. Try Sync again."* Migration `0075_static_domain_certificates.sql` had never been applied to the live database (the ledger topped out at `0073`), so the insert in `ensureStaticCertRow` could not succeed on any attempt. The real PostgREST error was logged at `warn` and never surfaced. Tests passed throughout, because `static/__tests__/aws.test.ts:74` mocks `../certs.js` wholesale and the DB write has zero coverage.
3. **IAM gaps were discovered one `AccessDenied` at a time.** After the migration and a redeploy, Sync failed with `acm:RequestCertificate` denied. `docs/operations/aws-static-hosting-iam.md` still closes with *"Custom domains are not covered"*, so there was no document to configure against.
4. **A true statement was not true.** Sync finally returned *"Certificate requested for 1 domain(s) … HTTPS goes live automatically once AWS validates them."* There is no background poller. `isPastCertDeadline` (`static/aws.ts:537`) is exported and has no production caller. The user had to keep clicking `Sync now` at an undisclosed interval, with no indication of which stage they were in or how long it should take.

The user's own summary — *"all of this config is a bit confused, I think users should not do a lot of difficult steps, at least should be clear"* — is the requirement this spec serves. Five items were approved: input-time validation (R1), background certificate polling (R2), an explicit progress view (R3), honest failure classification (R4), and a migration readiness probe (R5). Two supporting items follow directly from the investigations: the IAM document (R6) and regression coverage for the write path that had none (R7).

## Glossary

- **Static deploy strategy** — `deployStrategy: "static"`: built output published to object storage behind a CDN, bypassing Dokploy. Not Dokploy's `static` *build type*, which is a different thing with the same name (see `AGENTS.md`).
- **AWS branch / GCP branch / legacy VPS branch** — the three branches of the domains service, selected in `domains/domain/applier.ts` in the order Dokploy → static → legacy VPS nginx/certbot. "Static" splits again per cloud: `static/aws.ts` (ACM + CloudFront) and `static/gcp.ts` (Google-managed certificate + HTTPS LB).
- **Attachment** — the whole multi-step handshake from "user typed a domain" to "the domain serves over HTTPS".
- **Routing record** — the DNS record that sends visitors to the CDN. CNAME → `distributionDomain` on AWS; A → `cdnIp` on GCP.
- **Validation record** — the DNS record that proves ownership so a certificate can be issued. AWS/ACM only; GCP validates by reaching the load balancer at the domain, so it has none.
- **`verification_state`** — per-certificate attachment state on `ssl_certificates` (migration `0075`). The CHECK permits `pending`, `awaiting_dns`, `provisioning`, `attaching`, `live`, `failed`, `timed_out`. The AWS branch writes only `pending`, `awaiting_dns`, `attaching`, `live`, `failed` today; `provisioning` and `timed_out` are reachable on GCP / unused.
- **Permanent failure** — a failure that cannot succeed on a later identical attempt: schema drift (`PGRST204`, Postgres `42703`, `23514`), IAM `AccessDenied`, ACM `LimitExceeded`, `CNAMEAlreadyExists`, apex-on-CloudFront. Distinct from a transient failure (throttling, a stack mid-update, a dependency briefly down).

## Constraints

- `GET /healthz` MUST NOT change. It is a static literal and existing platform probes depend on its exact payload (`AGENTS.md` → *Health vs readiness*).
- No job may block on a CDN update. A CloudFront distribution update takes 5-20 minutes and `config-apply` jobs expire in 300s (`shared/workers/config-apply.ts`). The update is started and observed on a later invocation.
- ACM certificates are always requested in `us-east-1` regardless of stack region (`ACM_REGION`, `static/aws.ts:42`). CloudFront accepts no other region.
- One certificate per project domain set, not one per domain: a distribution has exactly one `ViewerCertificate`, and ACM/Google-managed certificates are immutable in their name lists.
- Dockier does not manage the user's DNS. Every design here produces instructions and verification, never a record write.
- Existing response contracts are kept: `POST /projects/:projectId/domains/apply` keeps returning `applyDomainResponseSchema` (`{ success, message, ... }`). Additive fields are allowed; removing or renaming existing ones is not.
- The legacy VPS nginx/certbot branch and the Dokploy branch MUST keep behaving exactly as they do today unless a requirement names them explicitly.
- Changes must not require a second migration to `ssl_certificates` unless a requirement names one. `0075` already carries the columns and the index this work needs.

## Requirements

### Requirement 1: Validate the domain at the moment it is added

**User Story:** As a user adding a custom domain, I want to be told immediately if the name cannot work on this project's platform, and what to use instead, so I never publish a DNS record my registrar will reject.

**Per-cloud scope:** Apex refusal is **AWS-static only** (subject to D1). Format/typo validation and the conflicting-record warning apply to **all branches** (AWS static, GCP static, legacy VPS, Dokploy), because they are properties of the hostname, not the platform.

#### Acceptance Criteria

1. Adding a domain to an AWS static project SHALL be evaluated against the apex rule (`isApexDomain`, `static/apex.ts`) **during the add request**, before any certificate row or job is created — not during a later reconcile or verification.
2. When an apex domain is refused, the response SHALL name the specific limitation (CloudFront is reachable only by CNAME; DNS forbids a CNAME at a zone root) and SHALL list every legal alternative: a `www.` (or other) subdomain; an ALIAS/ANAME/CNAME-flattening record if the registrar supports one; a Route 53 A-ALIAS record; or the GCP static path, which supports apex natively via its dedicated anycast IP.
3. The refusal SHALL be surfaced in the Domains tab add form as a field-level error on the domain input, not as a transient toast and not only as a certificate-row state the user must go looking for.
4. Hostname format validation SHALL reject, with a message naming the specific problem: an empty or whitespace-only name, a scheme or path (`https://`, trailing `/...`), a name with no dot, a leading or trailing dot or hyphen, a label longer than 63 characters, a total length over 253 characters, and characters outside `a-z0-9-` after normalization. The current regex in `createDomainBodySchema` (`domains/schemas.ts:16-21`) rejects most of these with the single generic message `"Invalid domain name format"`; that message SHALL be replaced with a specific one.
5. The name SHALL be normalized before storage using the existing `normalizeHost` (lowercase, trailing dot stripped) so that `WWW.Example.com.` and `www.example.com` are the same domain.
6. Adding a domain that already exists on the same project SHALL be refused with a message saying so, rather than creating a second row.
7. When a record already exists at the requested name and does not point at this project's CDN, the user SHALL be warned at add time that publishing the routing record will replace it. The warning SHALL be **advisory and non-blocking** — the add proceeds — because a pre-existing record is a legitimate migration scenario and a DNS lookup is not authoritative about the user's intent.
8. A DNS lookup failure during the add (timeout, `SERVFAIL`) SHALL NOT block the add. The conflicting-record check is best-effort; its failure SHALL be logged at `warn` and the add SHALL succeed.
9. Every refusal in this requirement SHALL be returned as a `400`-class error carrying a user-facing message, consistent with the existing `DomainsError("…", "bad_request")` pattern.
10. Validation SHALL be enforced in the backend route/domain layer, not only in the frontend form, so the API cannot be used to bypass it.

### Requirement 2: Advance certificate state in the background

**User Story:** As a user who has published the DNS records, I want HTTPS to go live on its own, so that the message telling me it will is true and I never have to click `Sync now` again to make progress.

**Per-cloud scope:** **AWS static and GCP static.** GCP needs it at least as much as AWS: a Google-managed certificate stays `PROVISIONING` until Google can reach the load balancer at the domain, typically 15-60 minutes (`static/gcp.ts` header). The legacy VPS branch is excluded — certbot there is driven by the existing `certificate-issue` job and is out of scope.

#### Acceptance Criteria

1. A background poller SHALL advance every certificate row whose `verification_state` is not terminal, without any user interaction, and SHALL be the mechanism that makes the existing message *"HTTPS goes live automatically once AWS validates them"* (`static/aws.ts:186-192`) true.
2. The poller SHALL be built on the existing pg-boss infrastructure (`shared/database/queue.ts` → `createWorker`), inheriting its retry backoff (30s base, exponential) and its `correlationId` tracing. It SHALL NOT introduce a second scheduling mechanism such as a bare `setInterval` in the Fastify process.
3. The poller's candidate query SHALL use the partial index `idx_ssl_certificates_pending_verification` (`verification_state NOT IN ('live','failed')`, migration `0075`), which exists for this purpose, and SHALL be scoped to the platform-owned types `acm` and `gcp_managed`.
4. A single poll invocation SHALL NOT block on a CDN update. When `verification_state` is `attaching`, the poller SHALL observe the result using the persisted `attach_started_at` and return, re-checking on a later invocation.
5. On AWS, when `DescribeCertificate` reports `ISSUED`, the poller SHALL start the alias attach (`UpdateStack` with `DomainAliases` + `CertificateArn`), set `verification_state = attaching`, and stamp `attach_started_at`.
6. When the distribution update completes and the domain serves over TLS, the poller SHALL set `verification_state = live` and clear `verification_message`.
7. A certificate that has been waiting past the existing 2-hour deadline SHALL be moved to `timed_out` using the already-present `isPastCertDeadline` (`static/aws.ts:537`), with a `verification_message` naming the most likely cause (the validation record is not published or not yet visible) and the action that resumes progress. `isPastCertDeadline` SHALL gain a production caller; it currently has none.
8. A `timed_out` certificate SHALL be resumable: once the user publishes the missing record, an explicit user action (the R3 progress view's retry affordance, or re-adding the domain) SHALL return it to the active set, and the poller SHALL pick it up again.
9. Poll failures SHALL be non-fatal to the poller: one project's failure SHALL NOT stop the sweep for other projects, and each failure SHALL be recorded on that project's certificate row rather than only in logs.
10. The poller SHALL be idempotent and safe to run concurrently with a user-initiated apply. Concurrent writes SHALL NOT produce duplicate certificate rows (the partial unique index `idx_ssl_certificates_static_unique` is the integrity guard) and SHALL NOT request a second ACM certificate for an unchanged domain set (the existing adoption scan, `findAdoptableCertificate`, is the guard).
11. Polling SHALL stop for a project with no non-terminal certificate rows, so a steady-state installation performs no provider calls.
12. The poller's provider calls SHALL stay inside the IAM surface documented in R6 and SHALL NOT introduce an AWS action not listed there.

### Requirement 3: Show the attachment as an explicit, staged progress view

**User Story:** As a user attaching a domain, I want to see the ordered stages, which one I am in, what the system is waiting for, what I personally must do next, and roughly how long it takes, so I am never guessing whether to wait or to act.

**Per-cloud scope:** **AWS static and GCP static**, with per-cloud stage content — the two clouds have *different stage orders* and GCP has no validation record. The legacy VPS and Dokploy branches keep their current UI; the progress view SHALL degrade to today's behaviour for them rather than showing an inapplicable stage list.

#### Acceptance Criteria

1. The Domains tab SHALL present, per domain, the ordered stages of attachment with the current stage clearly marked. `Sync now` (`ProjectDomainsTab.tsx:819-829`, message rendered at `:886`) SHALL no longer be the primary mechanism for making or observing progress.
2. The AWS stage sequence SHALL be: **(a)** domain added and accepted; **(b)** certificate requested from ACM; **(c)** *your action* — publish the ACM validation CNAME; **(d)** AWS validating the certificate; **(e)** *your action* — publish the routing CNAME to the distribution domain; **(f)** attaching the certificate to CloudFront; **(g)** live over HTTPS. This mirrors the verified sequence in section 7 of the IAM report.
3. The GCP stage sequence SHALL reflect its opposite ordering: **(a)** domain added; **(b)** HTTPS front end created on the existing anycast IP; **(c)** *your action* — publish the A record to `cdnIp`; **(d)** Google validating by reaching the load balancer at the domain (this cannot begin until the A record is live); **(e)** live over HTTPS. It SHALL NOT display a validation-record stage, because GCP has none.
4. Each stage SHALL be labelled with its owner — **you** or **Dockier/AWS/Google** — so it is unambiguous whether the user is blocking progress or waiting on a provider.
5. Each waiting stage SHALL carry a realistic time estimate drawn from verified behaviour: ACM validation completes within minutes of the record becoming visible; a CloudFront distribution update takes 5-20 minutes; a Google-managed certificate takes 15-60 minutes after the A record is live. No stage SHALL be presented as instantaneous when it is not.
6. Every stage requiring user action SHALL show the exact record to publish — name, type, value — copyable, sourced from the existing `GET /projects/:projectId/domains/:domainId/dns-instructions` (served fresh, never stored stale).
7. The view SHALL state that the ACM validation record should be left published permanently, because it is what allows automatic renewal (already in `awsDnsInstructions`' `purpose` text, `static/aws.ts:561`).
8. The current stage SHALL be derived from persisted state (`verification_state`, `verification_message`, `validation_record`, `attach_started_at`, `provider_ref`) and refresh without a manual click, so the view reflects poller progress from R2.
9. A failed or timed-out attachment SHALL render as a distinct terminal stage showing the R4 message and, when the failure is recoverable by a user action, the single action that resumes it.
10. A manual re-check SHALL remain available for the impatient user, but SHALL be presented as "check now", not as the thing that drives the process. Clicking it SHALL be safe to repeat and SHALL NOT duplicate certificates or stack updates.
11. The stage model SHALL be computed on the backend and returned to the frontend, so the Domains tab does not re-implement provider-specific sequencing. `frontend/src/services/domains.ts` and `ProjectDomainsTab.tsx` consume it.
12. The view SHALL be keyboard navigable, SHALL convey stage status by text and icon rather than colour alone, and SHALL announce stage changes to assistive technology.
13. When a project's CDN cannot be resolved, the view SHALL show the existing actionable message ("Redeploy the project and try again" / "deployed before custom domains were supported — redeploy once") as a pre-stage blocker rather than an empty stage list.

### Requirement 4: Make failures honest — permanent ones non-retryable and self-describing

**User Story:** As a user hitting an error, I want to be told whether retrying can possibly help and what the actual problem is, so I do not click the same button fifteen times against a failure that is structurally impossible to succeed.

**Per-cloud scope:** Failure classification and log promotion apply to the **whole static branch** — `certs.ts` is shared by AWS and GCP, and both reconcilers map `null` into a user-facing outcome. IAM/permission-gap naming is **AWS-specific** in content. The legacy VPS branch is unchanged.

#### Acceptance Criteria

1. `ensureStaticCertRow` (`static/certs.ts:83`) SHALL propagate enough of the underlying failure for the caller to classify it, instead of collapsing every failure to `null` (`certs.ts:109-117`).
2. Database failures SHALL be classified as **permanent** when the error indicates schema drift or a constraint the data can never satisfy: PostgREST `PGRST204` (unknown column against the schema cache), Postgres `42703` (undefined column), Postgres `23514` (check violation). These SHALL be returned with `retryable: false`.
3. Postgres `23505` (unique violation) SHALL remain handled as it is today — a concurrent insert, re-read rather than reported.
4. A permanent database failure SHALL produce a user-facing message that states the cause in plain terms (the database is missing a required change for custom domains) and the operator action that fixes it (apply pending migrations), and SHALL NOT say "Try Sync again". The exact string `"Could not record certificate state for … Try Sync again."` (`static/aws.ts:151-157`) SHALL no longer be emitted for this class of failure.
5. An AWS `AccessDenied` / `UnauthorizedOperation` failure SHALL be classified as **permanent**, SHALL be named as a permissions gap, SHALL identify the missing action (e.g. `acm:RequestCertificate`) when AWS reports it, and SHALL point at `docs/operations/aws-static-hosting-iam.md`. The current generic `"Could not request a certificate: <raw AWS error>"` with `retryable: true` (`static/aws.ts:325`) SHALL NOT be used for this class.
6. The already-correct permanent classifications SHALL be preserved: ACM `LimitExceeded`, `CNAMEAlreadyExists`, the pre-parameters stack message, and the apex refusal all remain `retryable: false`.
7. Transient failures SHALL remain retryable: stack `*_IN_PROGRESS`, throttling, and network errors.
8. The three swallowed `warn` logs in `certs.ts` SHALL be promoted to `error`: the list failure (`certs.ts:68`), the create failure (`certs.ts:115`), and the read failure (`certs.ts:136`). A failure that aborts a user's action is not a warning.
9. The promoted logs SHALL preserve the diagnostic payload (`code`, `details`, `hint`) that the raw `PostgrestError` carries. `deleteStaticCertRows` currently uses `getErrMsg(error)` (`certs.ts:198`), which discards those fields; the four call sites SHALL be made consistent.
10. A failed `listStaticCertRows` SHALL NOT be silently coerced to `[]` and treated as "no orphans to clean up". The caller SHALL be able to distinguish "no rows" from "could not read rows" and SHALL skip destructive orphan cleanup in the latter case.
11. `retryable` SHALL be honoured by the job layer as well as the UI: a permanent failure SHALL NOT be re-thrown into pg-boss to burn retries. `isRetryableFailure` in `domains/domain/worker.ts` currently decides by substring-matching one message; it SHALL use the structured flag.
12. Every message introduced by this requirement SHALL follow the project's error-message rule: user-facing and descriptive, never a raw driver string as the whole message.

### Requirement 5: Detect pending migrations as a readiness problem

**User Story:** As an operator, I want the platform to tell me when the deployed code expects a migration the database does not have, so a missing migration cannot silently disable a feature until a user reports it.

**Per-cloud scope:** Cloud-agnostic — this is a platform readiness concern, not a domains concern. It is included here because a missing migration is what broke this attachment.

#### Acceptance Criteria

1. `GET /readyz` SHALL report whether the database has every migration the running code expects, alongside the existing queue state. It already exists as the place to express "serving, but degraded" (`app.ts:119-127`).
2. The check SHALL compare the canonical migration set in `supabase/migrations/` against the applied ledger `supabase_migrations.schema_migrations` — the same two sources that proved `0075` was missing while the ledger topped out at `0073`.
3. When migrations are pending, `/readyz` SHALL respond `503` with a `degraded` status and SHALL name the pending versions, so the response alone is enough to act on.
4. When no migrations are pending and the queue is ready, `/readyz` SHALL respond `200 ready` exactly as it does today. Existing `/readyz` tests (`shared/http/__tests__/app-hardening.test.ts:98-113`) SHALL continue to pass, extended rather than rewritten.
5. `GET /healthz` SHALL remain a static literal and SHALL NOT gain this check. Platform probes depend on its exact payload.
6. `/readyz` SHALL remain unwired from any platform probe. Failing closed would pull traffic from an instance that is still serving HTTP correctly (`AGENTS.md` → *Health vs readiness*).
7. The check SHALL fail open on its own errors: if the ledger cannot be read (permissions, pooler hiccup), `/readyz` SHALL report the migration state as unknown and SHALL NOT report `degraded` on that basis alone. A diagnostic that invents outages is worse than none.
8. The check SHALL be cheap enough to run per request or SHALL be cached with a bounded TTL; it SHALL NOT add a heavy query to a probe endpoint that may be polled frequently.
9. A gap in the migration numbering (such as the deliberately reserved `0074`) SHALL NOT be reported as pending. Only a migration file that exists and is absent from the ledger counts.
10. The pending-migration signal SHALL be the thing an operator can correlate with the R4 permanent-failure message, so the two together identify the problem without reading source.

### Requirement 6: Document the IAM policy custom domains actually require

**User Story:** As an operator setting up a tenant's AWS credentials, I want one document that lists every permission the custom-domain path needs, so I configure it once instead of discovering gaps one `AccessDenied` at a time.

**Per-cloud scope:** **AWS only.** GCP's required scopes are a separate concern and are not in this document.

#### Acceptance Criteria

1. `docs/operations/aws-static-hosting-iam.md` SHALL be extended — not replaced, and not duplicated into a new file. Its own instruction ("if any of those change, update this document") makes it the right home, as established in section 6 of the IAM report.
2. The final bullet *"Custom domains are not covered. They additionally need ACM in `us-east-1` plus DNS — Phase 4 of `.kiro/specs/static-deploy-targets/`"* SHALL be removed and replaced with the actual coverage.
3. The policy block SHALL gain the two statements verified in section 2.1 of the IAM report: `StaticDomainCertificates` (`acm:RequestCertificate`, `acm:AddTagsToCertificate`, `acm:DescribeCertificate`, `acm:ListTagsForCertificate`) scoped to `arn:aws:acm:us-east-1:<account>:certificate/*`, and `StaticDomainCertificateDiscovery` (`acm:ListCertificates`) on `"*"` because a list operation has no resource in scope.
4. The document SHALL state that ACM is the **only** new service the custom-domain path needs, and that its CloudFormation and CloudFront usage is a subset of what a static deploy already exercises.
5. The document SHALL state that **no Route 53 permission is required** — DNS verification is public resolution through `node:dns` (`static/index.ts`), including the ALIAS-flattening fallback, with no AWS call in that path.
6. The document SHALL carry the region note: certificates are always requested in `us-east-1` (`ACM_REGION`), so the ACM statements can be region-pinned, while the CloudFormation statement cannot, because a project's stack can live in any region.
7. The "what the adapter does" table SHALL gain rows for the ACM actions and for the `UpdateStack`-driven alias attach, so each permission is traceable to a step.
8. The document SHALL record the operational consequence that no ACM certificate is ever deleted (see the flagged follow-up below), so an operator is not surprised by accumulating `PENDING_VALIDATION` certificates.
9. `acm:AddTagsToCertificate` SHALL be included and SHALL be annotated as inferred from the ACM tag-on-create contract rather than from a distinct SDK call, matching the honesty of section 9 of the IAM report.
10. The R4 permission-gap message SHALL reference this document by path, so the error and the fix are connected.

### Requirement 7: Cover the certificate write path that has none

**User Story:** As a developer changing this code, I want the database write path under test, so a schema or classification regression fails in CI rather than in a user's domain attachment.

**Per-cloud scope:** Tests cover the **shared `certs.ts` layer plus both static reconcilers**. No legacy VPS coverage is added.

#### Acceptance Criteria

1. `static/__tests__/aws.test.ts:74` mocks `../certs.js` wholesale, which is why every test passed while production could not insert a single row. The DB write path SHALL gain direct coverage that does not depend on that mock.
2. A test SHALL exercise `ensureStaticCertRow` against a faithfully-faked PostgREST failure for each permanent code — `PGRST204`, `42703`, `23514` — and SHALL assert a non-retryable outcome with a message that does not say "Try Sync again".
3. A test SHALL assert that `23505` still results in a re-read rather than a reported failure.
4. A test SHALL assert that an AWS `AccessDenied` on `RequestCertificate` produces a non-retryable, permission-named outcome referencing the IAM document.
5. Tests SHALL cover the R1 validation matrix: apex accepted on GCP, apex refused on AWS (per D1), each rejected format case, normalization, and duplicate-on-same-project.
6. Tests SHALL cover the R2 poller state machine with the provider calls mocked: `awaiting_dns` → `issued` → `attaching` → `live`; the `attaching` path returning without blocking; the deadline path producing `timed_out`; and a per-project failure not aborting the sweep.
7. A test SHALL assert that `/readyz` reports `degraded` with the pending versions named when the ledger lags the migration directory, and `ready` when it does not.
8. The existing `aws.test.ts` and `gcp.test.ts` suites SHALL continue to pass, extended rather than rewritten.
9. `pnpm backend:typecheck` SHALL report zero new errors, `pnpm test` SHALL pass, and `cd frontend && pnpm lint` SHALL report no new errors for any frontend file touched by R3.
10. Where a behaviour can only be verified against a live provider or a live database (actual ACM issuance timing, actual CloudFront propagation, actual migration application), it SHALL be documented as integration-only and SHALL NOT be faked into a unit test that asserts something it cannot know.

## Non-functional requirements

1. **No additional dependencies.** R2 uses the existing pg-boss worker factory; R5 uses the existing Supabase client; R3 uses the existing shadcn/ui primitives and the token system in `frontend/src/index.css`. Anything new must be justified against `AGENTS.md` → *Things to avoid*.
2. **No new migration** unless the design proves `0075`'s columns and indexes are insufficient. The investigation found no column the code writes that `0075` lacks.
3. **Polling cost is bounded.** The poller performs provider calls only for non-terminal certificate rows and performs none in steady state (R2.11). Its cadence is D2.
4. **No secrets in messages.** Error messages may name an IAM action and a document path; they may not echo credentials, ARNs containing account-sensitive context beyond what AWS itself returned, or raw tokens.
5. **Backward compatibility.** A project mid-attachment when this ships SHALL continue from its current `verification_state` without manual repair.
6. **Accessibility.** The R3 progress view meets the project's existing accessibility bar: semantic structure, keyboard reachability, status conveyed by more than colour.

## Open decisions for the design phase

### D1 — Is apex-on-AWS refused outright, or conditionally supported?

The two halves of the code disagree, and the requirements cannot resolve it without a design decision.

- **Refusal exists.** `reconcileAwsStaticDomains` rejects any apex host up front and writes `apexRefusalMessage` onto the certificate row (`static/aws.ts:86-106`). `AGENTS.md` states apex domains are refused with an actionable message.
- **Partial support also exists.** `verifyDomainDnsStatic` has an ALIAS-flattening fallback (`static/index.ts:228`, called at `:151`, `dns.resolve4` on both the host and the CDN hostname) specifically so that *a correctly flattened apex is not reported as broken*. `AGENTS.md` records that fallback as deliberate.

A blanket input-time refusal (R1.1) would make that fallback dead code and would block a user whose registrar supports ALIAS/ANAME — including Route 53 A-ALIAS, which works. A blanket acceptance reproduces the original incident. Candidate resolutions for the design to choose between, with reasoning:

- **(a) Refuse at input, always.** Simplest and safest; removes the flattening fallback as dead code; loses a legitimate working configuration.
- **(b) Refuse by default, allow an explicit confirmed override** ("my DNS provider supports ALIAS/ANAME"), with the flattening fallback as the verification path for that case.
- **(c) Accept, but gate progress on verification** — the domain is added in a clearly-labelled "needs ALIAS/ANAME" state and no certificate is requested until flattening is verified.

The design MUST pick one, state what happens to `verifyFlattenedAlias`, and state whether `AGENTS.md`'s apex wording needs amending.

### D2 — Poll cadence, and when to stop

R2 requires a poller but deliberately does not fix its numbers. The design MUST specify:

- **Cadence**, and whether it is uniform or per-state. The stages have very different natural durations: ACM validation resolves in minutes once the record is visible, a CloudFront update takes 5-20 minutes, a Google-managed certificate takes 15-60 minutes. A single interval is either wasteful at one end or sluggish at the other; a backoff schedule per state is the obvious alternative.
- **Scheduling mechanism** — a pg-boss recurring sweep over the `idx_ssl_certificates_pending_verification` index versus per-certificate self-rescheduling jobs. The index's existence suggests a sweep; the design must confirm and justify.
- **Give-up policy.** `CERT_DEADLINE_MS` is 2 hours (`static/aws.ts:45`), which is shorter than GCP's documented 15-60 minute (and sometimes longer) provisioning window plus DNS propagation. The design MUST state whether the deadline is per-cloud, how `timed_out` is resumed (R2.8), and whether a timed-out row keeps consuming poll slots.
- **Interaction with the manual check** in R3.10, so a user clicking "check now" during an in-flight poll cannot double-request a certificate or double-submit a stack update.

## Flagged follow-up (not approved, not in scope)

**No ACM certificate is ever deleted.** Changing a project's domain set requests a new certificate (`static/aws.ts:270-275`); removing a domain deletes only the database row (`static/certs.ts:187-199`); nothing in `backend/src` calls `acm:DeleteCertificate`. Unused `PENDING_VALIDATION` certificates therefore accumulate in `us-east-1` until the account hits its ACM quota, at which point `static/aws.ts:317-327` tells the user to clean up manually. That message exists because the leak is real, not theoretical. A cleanup path would need `acm:DeleteCertificate` added to R6's policy, plus correct ordering (ACM refuses to delete a certificate a distribution is using, so the alias must come off first). Recorded here so it is tracked; **not** part of the five approved items. R6.8 documents the consequence without fixing it.

## Out of scope

- **Changing `GET /healthz`.** Its payload is a contract with existing platform probes.
- **Managing the user's DNS.** No registrar API integration, no Route 53 record writes, no automatic validation-record publication. Dockier instructs and verifies.
- **The Dokploy deploy path** and its Traefik/Let's Encrypt domain handling (`domains/domain/dokploy-applier.ts`).
- **The legacy native/CloudFormation Dockerfile pipeline** and its AI review layer.
- **The legacy VPS nginx/certbot domain branch**, except where a requirement explicitly includes it (R1's format validation) or explicitly excludes it (R2, R3, R4, R7).
- **Deleting orphaned ACM certificates** — see the flagged follow-up.
- **GCP IAM scope documentation.** R6 covers AWS only.
- **Re-investigating the two root causes.** The cert-state write failure and the IAM gap are settled by the two reports cited at the top; this spec implements responses to them.
