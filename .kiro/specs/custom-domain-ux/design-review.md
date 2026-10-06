# Design Review — Custom Domain UX (static deploys)

Reviewed: `.kiro/specs/custom-domain-ux/design.md` against `.kiro/specs/custom-domain-ux/requirements.md`.
Grounded in `.agents/tasks/cert-state-write-failure-2026-10-06.md`, `.agents/tasks/iam-policy-static-domains-2026-10-06.md`, and `AGENTS.md` → *Custom domains for static deployments* / *Health vs readiness*.
Reviewed fresh, without the context that produced the design. Source was spot-checked only where a specific articulable doubt existed; the two reports' root causes were not re-derived.

**Verdict: CHANGES_REQUESTED** — 1 HIGH, 3 MEDIUM, 3 NIT.

The design is unusually complete and the per-cloud scoping, the stage matrices, the clock-selection table and the "only `retryable: false` may write `failed`" invariant all hold up against source. The findings below are concentrated in one place: **the sweep's treatment of a row that never leaves `pending` because the reconcile failed permanently**, plus three claims about existing helpers that are not true as written.

---

## Findings

### 1. HIGH — A permanently-failing attachment is re-enqueued every minute, forever: `pending` has no deadline and a permanent reconcile failure writes no state

*Where:* D2 → *Give-up policy* (deadline table has no `pending` row), D2 → cadence table (AWS/GCP `pending` = 1 min with no escalation), Item 2 → *Failure isolation and idempotency* (R2.11 claim).

The sweep's state filter admits `pending`, and `pending` is a reachable resting state for a **permanently** broken attachment. Verified in source (`static/aws.ts:155-162`): after `ensureStaticCertRow` succeeds, a failing `ensureCertificateForDomains` returns `{ success: false, retryable: cert.retryable, message }` **without any `setCertState` call**. So the incident's own step 3 — `acm:RequestCertificate` denied — leaves the row at `verification_state = 'pending'` with no `verification_message`, forever.

Under the sweep that becomes:

- the row is due every **1 minute** (the `pending` tier has no escalation),
- `certDeadlineMs("aws", "pending", …)` has no table row, so no deadline fires and the row never reaches `timed_out`,
- each look enqueues `domain-apply`, and each reconcile re-runs `GetCallerIdentity` + `DescribeStacks` + `ListCertificates` + a denied `RequestCertificate`.

That contradicts three things the design claims to satisfy: **R2.11** ("polling SHALL stop for a project with no non-terminal certificate rows… a steady-state installation performs no provider calls"), **NFR3** ("polling cost is bounded"), and **R2.9** ("each failure SHALL be recorded on that project's certificate row rather than only in logs"). It also reintroduces the exact failure shape Item 2 exists to delete — an attachment that is visibly stuck at a state carrying no explanation — and does it at one provider call per minute per project.

The design's own Item 4 work makes the fix available: `classifyAwsError` already decides `retryable: false` for the IAM case, and the Item 2 invariant already permits `failed` for exactly that class.

**Concrete fix (all three parts):**

1. State that a reconcile which returns `retryable: false` writes the classified message and `verificationState: "failed"` onto every row it holds, including the currently state-less `!cert.ok` branch:

   ```ts
   if (!cert.ok) {
     for (const row of rows.values()) {
       await setCertState(row.id, {
         ...(cert.retryable ? {} : { verificationState: "failed" }),
         verificationMessage: cert.message,
       });
     }
     return { success: false, retryable: cert.retryable, message: cert.message };
   }
   ```

   This is the mirror of *A transient attach failure is not a terminal state* and belongs in the same subsection so the two cannot drift.

2. Add a `pending` row to the deadline table for both clouds — e.g. **30 min on `created_at`** → `timed_out`, message *"Dockier has not been able to request a certificate for `<host>`. Check the Deployments tab for the project's last deploy, then choose Resume."* — so a row whose reconcile fails **transiently** forever still stops consuming the 1-minute tier.

3. Escalate the `pending` cadence the way `awaiting_dns` escalates (1 min for the first 5 min of the phase, then 5 min), so even the pre-terminal window is bounded.

---

### 2. MEDIUM — `resolveStaticCloud` cannot read `projects.settings` from the row it loads; `lookupActiveDeployment` never loads a project row

*Where:* D1 → *Where the acknowledgement is stored* (the snippet comment "one project read, no second query"), Item 1 → *Apex policy and cloud resolution*, and the first review's response row 7.

Verified in source (`shared/service-clients/deployments.ts:66-95`): `lookupActiveDeployment` issues exactly one query, `from("deployments").select("id, provider_id, deploy_strategy, app_url, docker_image, repo, infra")`. It touches the `projects` table not at all, and `settings` is not in the projection. The design asserts three times that `apexAliasAck` comes out of "the project row this function already loads" and that the add flow therefore has "exactly one project read and no separate settings query". That is not true, and the claim is load-bearing: it is the stated reason the D1 gate needs no extra query.

This is also the design's justification for putting `routeTarget` and `apexAliasAck` behind one call, so an implementer following it literally will either write `deployment.settings` (does not exist) or silently add an unstated query.

**Concrete fix:** say plainly that `resolveStaticCloud` performs **two** reads — the existing `lookupActiveDeployment`, plus

```ts
const { data } = await supabaseAdmin
  .from("projects")
  .select("settings")
  .eq("id", projectId)
  .eq("organization_id", tenantId)
  .maybeSingle();
```

— and state the failure behaviour for the second one specifically: a failed or missing settings read yields `apexAliasAck: []`, which means a stored acknowledgement is invisible and a previously-acked apex re-add is refused again. That is the safe direction (the user can re-tick the box) but it must be written down, because `cloud`'s fail-open rule says the opposite ("the apex check does not fire"). Correct the three "one project read" statements.

---

### 3. MEDIUM — The resume endpoint's rate limit names an option that does not exist and a keying the codebase does not provide, and the stated precedent is false

*Where:* D2 → *Resuming a `timed_out` row* → *Rate limit*, and the `routes.ts` row of *Files touched*.

Verified in source (`shared/http/rate-limit.ts:93-130`):

- the exported factory is `rateLimit(options: RateLimitOptions)` with `{ max, windowMs, prefix }` — there is **no `windowSeconds`**;
- `rateLimit` keys on `request.ip`, not on anything project-scoped;
- the only non-IP variant is `tenantRateLimit`, keyed on `request.auth?.tenantId`. **No project-keyed extractor exists.**

So `rateLimit({ max: 10, windowSeconds: 60 })`, "keyed per project", is not implementable as written. Separately, "matching the `apply` route's treatment" is false: `grep -rn "rateLimit(" backend/src/services/domains` returns nothing — `POST /projects/:projectId/domains/apply` has no rate limit at all. The only `rateLimit` call in the repo on this side is the deploy hook (`services/deploy/routes/git-push-webhook.ts:76`, `{ max: 5, windowMs: 60_000, prefix: "deploy-hook" }`), which is the `AGENTS.md` precedent the design cites — and that one is IP-keyed.

**Concrete fix:** pick one and write it out:

```ts
preHandler: tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" }),
```

and delete the "matching the `apply` route's treatment" clause (replace with the deploy-hook precedent, which is real). If per-project keying is genuinely wanted, say that a third extractor is being added to `shared/http/rate-limit.ts` and name it — that is a new shared primitive and should not be smuggled in as an existing one.

---

### 4. MEDIUM — `pollIntervalMs` and `certDeadlineMs` are not total over the states the sweep's own filter admits

*Where:* D2 → cadence table, deadline table, and the `certDeadlineMs` signature.

The sweep selects `verification_state IN ('pending','awaiting_dns','provisioning','attaching')` for `type IN ('acm','gcp_managed')` — eight (cloud, state) pairs, nine once AWS `awaiting_dns` splits on `status`. The tables cover: cadence 8 of 9 (**GCP `attaching` missing**), deadlines 6 of 9 (**AWS `pending`, GCP `pending`, GCP `attaching` missing**). `certDeadlineMs` is typed `… | null` but the design never says which inputs return `null` or what the sweep does with it, and `pollIntervalMs` has no stated default at all. GCP never writes `attaching` today (verified: `static/gcp.ts:216-223` writes only `live` / `failed` / `awaiting_dns` / `provisioning`), but the sweep's filter does not know that, and a row can hold `attaching` from any writer the CHECK permits.

Two valid interpretations exist for every missing cell — "unreachable, throw" versus "fall back to some interval / no deadline" — and the second silently produces finding 1's symptom.

**Concrete fix:** make both functions total and say so. Either exhaustive `switch` over a `(cloud, state)` discriminated union with `never` on the default (which forces the GCP `attaching` decision to be made explicitly), or an explicit default line under each table: *"any (cloud, state) pair not listed polls at 15 min and has no deadline; `certDeadlineMs` returns `null` only for … and the sweep treats `null` as 'no deadline, cadence only'."* State which it is, and add the "unlisted pair" case to `poll-sweep.test.ts`.

---

### 5. NIT — `apexRefusalMessage` has a third call site the two-surface signature does not assign

*Where:* D1 → *Consequences to carry out*; the `apex.ts` and `aws.ts` rows of *Files touched*.

The design names two consumers (the route → `"add-form"`, the reconcile backstop → `"persisted"`). Source has three: `static/aws.ts:124` uses `apexRefusalMessage(apexRejected[0])` inside the "no usable domains, detach everything" branch, whose output goes into an **apply response message**, not a persisted row and not a form. Adding a required second parameter breaks it at compile time and leaves the wording unassigned.

**Concrete fix:** add a line to *Consequences to carry out*: the `aws.ts:124` detach branch uses `"persisted"` — it has no checkbox, and "remove this domain and add it again" is the correct instruction there. Mention the site in the `aws.ts` row of *Files touched*.

---

### 6. NIT — The `updated_at` semantic change is user-visible and the design only names the sweep-side effect

*Where:* Item 2 → *The `updated_at` touch, and why no new column*.

`updated_at` is mapped onto the certificate API response (`services/domains/domain/mappers.ts:100`, `updatedAt: row.updated_at`) and `listCertificates` selects `*`, so after `touchCertPolled` every in-flight certificate reports `updatedAt` of roughly a minute ago, permanently. The design says "the only side effect is that a user-initiated apply also defers the next sweep by one interval", which misses this one.

**Concrete fix:** add a sentence confirming that no surface renders certificate `updatedAt` as "last changed" (and, if `ProjectDomainsTab` does, that the label is changed or the field dropped from that view) — then keep the no-new-column decision as is.

---

### 7. NIT — `CERT_DEADLINE_MS` is module-private, so "survives as the function's default third argument" needs a home

*Where:* D2 → *`isPastCertDeadline` is extended, not replaced*; the new `static/deadlines.ts` entry in *Files touched*.

Verified: `const CERT_DEADLINE_MS = 2 * 60 * 60 * 1000;` at `static/aws.ts:45` is not exported, and `isPastCertDeadline` lives in `aws.ts` while the deadline tables move to `static/deadlines.ts`. The design does not say whether the constant stays in `aws.ts`, is exported, or moves next to the tables — and `deadlines.ts` importing from `aws.ts` would invert the dependency direction the design sets up (pure table module consumed by the reconciler).

**Concrete fix:** one line — `CERT_DEADLINE_MS` moves to `static/deadlines.ts` and is exported from there; `aws.ts` imports it for the default argument. Keeps `deadlines.ts` dependency-free, which is what makes it unit-testable.

---

## Verified Assumptions

Checked against source/migrations and found accurate:

1. `ssl_certificates.created_at` is `NOT NULL DEFAULT now()` and `issued_at` exists (`0050_domains_certificates.sql:31-33`) — the clock fallback chain does terminate, and no migration is needed for the three timestamps.
2. `certs.ts`'s `SELECT_COLUMNS` and `StaticCertRow` genuinely **omit** `created_at`, `issued_at`, `updated_at` (`static/certs.ts:22-50`) — they are additions to the read path only, as claimed.
3. `idx_ssl_certificates_pending_verification` is partial on `verification_state NOT IN ('live','failed')` and `idx_ssl_certificates_static_unique` is partial unique on `(project_id, domain_name) WHERE type IN ('acm','gcp_managed')` (`0075`, lines ~103-113). The sweep's `IN` list is a strict subset, as claimed; `0075`'s own header also confirms the partial index is unusable as an upsert target, which is why the `23505` re-read stays.
4. The `0075` CHECK permits exactly the seven states the design uses, including `provisioning` and `timed_out` — **no new state and no schema widening**, as claimed.
5. `aws.ts:174-180` writes `status` and `verificationState` in one `setCertState` call, so `awaiting_dns` + `status === "active"` is only reachable after the attach ran — the non-monotonic stage row and the single `status` discriminator are correct.
6. `aws.ts:200-209` writes `verificationState: "failed"` for **any** `attach.ok === false`, and `aws.ts:216` re-stamps `attachStartedAt` on every `attaching` write. `gcp.ts:234` writes `attachStartedAt: nowIso()` **unconditionally** and `gcp.ts:233` re-stamps `issuedAt` on every active reconcile. All four are behaviour changes the design correctly identifies as required, not formalisations.
7. `isPastCertDeadline(startedAtIso, now = Date.now())` is two-argument at `aws.ts:537-542` and returns `false` on a null clock — appending `deadlineMs` in position three preserves existing callers and tests.
8. Both negative CNAME branches exist (`static/index.ts:133-137` empty-answer, `:168-180` post-flattening `ENODATA`/`ENOTFOUND`) and both emit "Add a CNAME pointing at …" with no apex awareness — the one-helper fix addresses the branch the incident actually hit **and** the other.
9. `verifyFlattenedAlias` is three-valued by design and `verifyDomainDnsStatic` returns `serverIp` on every post-resolution path — the four-variant `RoutingCheck` with `serverIp` on all variants is a faithful refactor, and the "inconclusive apex → `live`" rule is consistent with `AGENTS.md`'s record of the fallback as deliberate.
10. `verifyDomainDnsStatic` takes an `ActiveDeployment` and calls `resolveStaticTarget` first (`index.ts:91-99`), so the reconcile genuinely cannot reuse it — the pure `verifyRoutingRecordAws(host, distributionDomain)` extraction is necessary, and the "no AWS call in the DNS path" claim is then true (and matches IAM report §3.3 / R6.5).
11. `isApexDomain("*.example.com")` returns `false` (`static/apex.ts:51-53`), so rule 9's wildcard rejection at the route is what keeps a wildcard out of the apex gate. Consistent.
12. `idx_domains_name_unique` is `(organization_id, name)` — tenant-wide (`0050:19-20`), so the two-message duplicate design (per-project pre-check + `23505` for cross-project) is required rather than belt-and-braces.
13. `DomainError`'s constructor is `(message, code, cause?, metadata?)` and the shared handler already logs `metadata` (`shared/supabase/errors.ts:34-45`, `shared/http/error-handler.ts:23-28`). `DomainsError = createDomainErrorClass<"not_found"|"bad_request"|"conflict"|"internal">` (`domains/domain/domains.ts:13`) — so the "no `precondition_failed`, resume's 409 is `conflict`" statement is right, and the `clientCode` plumbing needs no error-class change. The `bad_request` arm today is `reply.badRequest(msg)`, so the proposed literal is payload-identical when `clientCode` is absent.
14. `createDomainBodySchema` is exactly the single-message regex described (`domains/schemas.ts:13-18`) and `applyDomainResponseSchema` is `{ success, message, generatedConfig? }` (`:93-97`) — `retryable?` is additive and the existing contract holds.
15. `/healthz` is a static literal and `/readyz` reports only the queue, with the "not wired to a platform probe" comment in place (`app.ts:107-124`); `backend/Dockerfile`'s `HEALTHCHECK` points at `/healthz`. R5.5/R5.6 and the `AGENTS.md` constraint are respected.
16. `backend/Dockerfile` copies only `backend` and `code-analysis` (lines 22-23) — `supabase/` is genuinely absent in production, so the checked-in manifest over a runtime directory read is justified, and the `pg.Client` precedent at `code-analysis/domain/scan-queue-reconcile.ts:16-28` with `getPostgresConnectionConfig` is real.
17. `getQueue()` returns `PgBoss | null` (`shared/database/queue.ts:29-37`), so `boss.schedule(...)` with the null guard is available where the design puts it; `isQueueReady()` exists for the extra guard.
18. `PERMISSIONS.PROJECT_VIEW` exists (`shared/permissions/constants.ts:13`), so the attachment endpoint's preHandler is available.
19. IAM report alignment: Item 6's two statements, action lists, `us-east-1` pin, "ACM is the only new service", "no Route 53 permission", the `acm:AddTagsToCertificate` inferred-not-verified annotation, and the never-deleted-certificate consequence all match report §2.1, §4, §5, §6 and §9 — including the deliberate omission of `acm:DeleteCertificate`.
20. Item 3's AWS stage order matches IAM report §7's verified sequence step for step (request → validation record → ACM validates → routing record → `UpdateStack` attach → 5-20 min → live), and GCP's inverted order matches `AGENTS.md`.
21. Per-cloud scope is stated for every item in the matrix and again inside each item; no AWS-only fix is implied as universal. The one shared-code change (`isRetryableFailure`) preserves the legacy VPS substring rule verbatim, and `domains/domain/worker.ts`'s fallback is the right place for it.
22. Item 5 honours both constraints; Item 2 honours "never block a job on a CDN update" (the sweep observes `attaching` later, never waits) and designs around the existing partial index; the `isPastCertDeadline` extend-not-replace decision is stated with its reasoning.
23. UI tokens are the current graphite/sand system plus `success-*` / `warning-*` / `danger-*`, with an explicit "no `dockier-*` berry class anywhere in this feature" — matches `AGENTS.md` → *Brand Commitments*.
24. The ACM certificate leak is kept as a **follow-up**, with an honest "cheaper than before, not free" analysis and a sizing, and is explicitly not folded into the five items. Correct call.
25. No production code is proposed inside the spec — every block is an illustrative snippet tied to a named file.
26. **D1** and **D2** each carry a recommendation, the rejected alternatives with reasons, and a **SIGN-OFF REQUIRED** marker; D1 coherently reconciles `verifyFlattenedAlias` (it becomes the verification path for the acked-apex case, and an inconclusive result resolves to `live`) with the GCP-apex asymmetry (no refusal there, because the anycast IP makes an apex A record normal).

## Unverified / Wrong Assumptions

1. **Wrong** — "`apexAliasAck` … read from the project row this function already loads"; `lookupActiveDeployment` loads no project row and no `settings` column. Finding 2.
2. **Wrong** — `rateLimit({ max, windowSeconds })` "keyed per project, matching the `apply` route's treatment": the option is `windowMs`, the limiter is IP-keyed, no project-keyed variant exists, and the apply route has no rate limit. Finding 3.
3. **Incomplete** — the cadence/deadline tables are not total over the sweep's own state filter, and `certDeadlineMs`'s `null` is unexplained. Finding 4.
4. **Incomplete** — `apexRefusalMessage` has a third call site (`aws.ts:124`). Finding 5.
5. **Unverified, flagged by the design itself and still open** (not re-derived here, and correctly listed under *Risks*): whether the runtime `DATABASE_URL` role can read `supabase_migrations.schema_migrations`; whether the Supabase CLI records the bare numeric prefix as `version`; `PgBoss.schedule` fan-out across split service instances; ACM's 72-hour `PENDING_VALIDATION` discard window; whether the live `dockier-dev` policy grants `cloudfront:UpdateDistribution` *with* aliases. Each has a stated consequence and a first-deploy check, which is the right treatment for a design document.
6. **Unverified here** — the `/readyz` assertions at `shared/http/__tests__/app-hardening.test.ts:98-113` use `toEqual` on the whole body. The design already concedes this and plans a one-key extension, so it was not re-checked.
