# Custom Domain UX (static deploys) — Design

Companion to `requirements.md`. Every `file:line` is a point-in-time snapshot taken on 2026-10-06; verify against the current tree before implementing.

**Binding records this design must not contradict:** `AGENTS.md` → *Custom domains for static deployments* (amended in one place — see D1), `AGENTS.md` → *Health vs readiness*, and the two investigations cited in `requirements.md`.

**Status:** two decisions (**D1**, **D2**) are marked **SIGN-OFF REQUIRED**. Implementation of R1 depends on D1; implementation of R2 depends on D2. Everything else is decided here. Revised four times against design review; all four response logs are at the end of this document.

## Overview

The mechanics of attaching a custom domain to a static-strategy project already work. What is missing is everything around them: the system accepts names it can never serve, it reports a permanent failure as retryable, it promises automatic progress it has no mechanism to deliver, and it exposes a single `Sync now` button as both the progress indicator and the progress mechanism.

This design makes five changes, in dependency order:

1. **Validate at the door** (R1). A new pure validator plus an apex policy check run inside `POST /projects/:projectId/domains`, before a row exists. Refusals are `400`s carrying a specific, actionable message; a pre-existing DNS record at the name produces a non-blocking advisory.
2. **Advance state in the background** (R2). A pg-boss cron sweep over the existing `idx_ssl_certificates_pending_verification` index enqueues the **existing** `domain-apply` job for every project holding a non-terminal certificate row. The reconcilers already contain the whole state machine and are already idempotent; the poller is a scheduler, not a second state machine. Deadlines (the one genuinely new piece of logic) are computed in the sweep, which is pure and DB-only.
3. **Show the handshake** (R3). A new backend-computed stage model, served by a new read endpoint and rendered as an ordered, owner-labelled timeline in the Domains tab. It uses the existing `verification_state` values — **no new state is introduced**. Two values already in the `0075` CHECK become newly *reachable*: `provisioning` on AWS (it carries the "AWS is validating" stage; it was GCP-only), and `timed_out` on both clouds (D2's deadlines are its first writer).
4. **Classify failures** (R4). A new `StaticFailure` type carries `retryable` plus a structured cause out of `certs.ts` and the reconcilers, up through the apply response and into the pg-boss handler. Schema drift and IAM denials become permanent and self-describing. The three swallowed `warn` logs become `error` and keep `code`/`details`/`hint`.
5. **Surface schema drift** (R5). `GET /readyz` compares a checked-in migration manifest against `supabase_migrations.schema_migrations` and reports `degraded` when the database is behind. `GET /healthz` is untouched; `/readyz` stays unwired from any platform probe.

Plus the two supporting items: the IAM document (R6) and the regression coverage the write path never had (R7).

**Technology stack — locked on approval.** No new runtime dependency. Backend: TypeScript on Fastify, zod schemas via `fastify-type-provider-zod`, Supabase JS client for `public` tables, a bare `pg.Client` for the one query PostgREST cannot serve, pg-boss 12 (`createWorker` + `PgBoss.schedule`), `node:dns` for all DNS resolution, the existing `@aws-sdk/client-acm` and `@aws-sdk/client-cloudformation` seams in `lib/aws-sdk.ts`, and the existing Compute REST helpers in `deploy/domain/infra/gcp-static-lb.ts`. Frontend: React 19 + Tailwind v4 against the tokens in `frontend/src/index.css`, existing shadcn/ui primitives and `lucide-react` icons. Tests: Vitest.

## Per-cloud scope, stated once and per item

Four branches exist. `applier.ts:142` selects between them in the order Dokploy → static → legacy VPS, and the static branch splits again per cloud inside `static/index.ts:60`.

| | AWS static (`static/aws.ts`) | GCP static (`static/gcp.ts`) | Legacy VPS (nginx/certbot) | Dokploy (Traefik) |
|---|---|---|---|---|
| **R1** format / normalize / duplicate | ✅ | ✅ | ✅ | ✅ |
| **R1** apex refusal | ✅ (policy per D1) | ❌ — apex works natively on the anycast IP; refusing would be a regression | ❌ — A record at apex is fine | ❌ |
| **R1** conflicting-record advisory | ✅ | ✅ | ✅ | ✅ |
| **R2** background poller | ✅ | ✅ (different cadence + deadline) | ❌ — `certificate-issue`/certbot, out of scope | ❌ |
| **R3** staged progress view | ✅ (7 stages) | ✅ (5 stages, no validation record) | ❌ — degrades to today's sync bar | ❌ — degrades to today's sync bar |
| **R4** failure classification + log promotion | ✅ | ✅ (`certs.ts` is shared) | ⚠️ unchanged behaviour, see below | ⚠️ unchanged behaviour, see below |
| **R4** IAM-gap message content | ✅ AWS-specific | ❌ | ❌ | ❌ |
| **R5** `/readyz` migration check | cloud-agnostic platform concern | | | |
| **R6** IAM document | ✅ AWS only | ❌ (GCP scopes are a separate document, not in scope) | ❌ | ❌ |
| **R7** tests | ✅ | ✅ | ❌ | ❌ |

The one R4 change that touches shared code outside the static branch is `isRetryableFailure` in `domains/domain/worker.ts:39`. Behaviour is preserved for the VPS and Dokploy branches by construction: the new structured `retryable` flag is `undefined` on those paths, and the handler falls back to today's substring rule. That rule exists for the VPS string `"will be applied on next deployment"` and keeps working for it verbatim.

## Decisions requiring sign-off

### D1 — Apex on AWS: refuse by default, allow a confirmed override  **· SIGNED OFF 2026-10-06**

> **Decision: option (b), as recommended.** Implemented in tasks 6-8 and 11.
> `AGENTS.md` amended accordingly — apex is refused on AWS *unless* the user has
> acknowledged ALIAS/ANAME/flattening support, in which case the attachment
> proceeds and `verifyDomainDns` verifies it through the flattening fallback.

**Recommendation: option (b) from the requirements — refuse by default, allow an explicit per-domain acknowledgement that the user's DNS provider supports ALIAS/ANAME/CNAME-flattening.**

Why not the alternatives:

- **(a) refuse always** is the simplest code and the wrong product. Route 53 A-ALIAS and Cloudflare CNAME-flattening both work today against a CloudFront alias, and GCP static serves an apex natively. A blanket "apex is unsupported" would be false at the product level and would make `verifyFlattenedAlias` (`static/index.ts:228`, called from `:151`) dead code that `AGENTS.md` records as deliberate.
- **(c) accept, gate progress on verification** reproduces the incident's shape: the add succeeds, nothing visibly happens, and the user goes looking for why. The whole point of R1 is to move the conversation to the moment of input.

**What the override is.** A checkbox on the add form: *"My DNS provider supports ALIAS, ANAME, or CNAME flattening at the domain root."* It sends `apexAliasAck: true` in the add body. Unchecked (the default) → `400` with `apexRefusalMessage` **and a machine-readable `code: "apex_requires_ack"`**, now extended per R1.2 to name all four legal alternatives. Checked → the domain is accepted and treated like any other: ACM is happy to issue for an apex, CloudFront accepts an apex alias, and only the user's DNS needs the special record type. `verifyFlattenedAlias` becomes the verification path for exactly this case, which is what it was written for.

**The gate reads the request first, then the stored list.** The acknowledgement arrives in the body of the same request that is being gated, so the stored list cannot be the only input — on a first add it is always empty. The predicate is:

```ts
// `apexAliasAck` here is the stored list, returned by resolveStaticCloud
// alongside `cloud` and `routeTarget`. resolveStaticCloud performs TWO reads:
// lookupActiveDeployment (the `deployments` row) and a `projects.settings`
// read — see "Apex policy and cloud resolution" for both and their
// separate failure rules.
const { cloud, apexAliasAck } = await resolveStaticCloud(projectId, tenantId);
const acked = request.body.apexAliasAck === true || apexAliasAck.includes(normalized);
if (cloud === "aws" && isApexDomain(normalized) && !acked) {
  // DomainsError extends DomainError, whose signature is
  // (message, code, cause?, metadata?) — the discriminator rides in metadata,
  // which the shared handler already carries.
  throw new DomainsError(apexRefusalMessage(normalized, "add-form"), "bad_request", undefined, {
    clientCode: "apex_requires_ack",
  });
}
```

**Error class, stated once.** Every throw site in this design uses **`DomainsError`** (`domains/domain/domains.ts:15`), which is `createDomainErrorClass<"not_found" | "bad_request" | "conflict" | "internal">`. Those four codes are the only ones permitted in this service — there is no `precondition_failed`, so the resume endpoint's 409 is `"conflict"` and nothing else. The base class `DomainError` (`shared/supabase/errors.ts:33-44`) is referenced only when discussing the constructor signature it provides.

The flag is honoured **only** when the name really is an apex and the cloud really is AWS; sending it for anything else is ignored rather than rejected, so a client that always sends it cannot change behaviour elsewhere.

**Where the acknowledgement is stored, and when it is written.** `projects.settings.apexAliasAck: string[]` — a list of acknowledged hostnames in the existing JSONB column. No migration. Precedent: `projects.settings` already carries the per-project deploy-hook token and `deployTarget`, and `projectSettingsSchema` is `.passthrough()` (`services/projects/schemas.ts:18`), so no schema change either. Rejected alternative: a `domains.apex_alias_ack` column, which would mean a migration for one boolean.

Sequencing and failure handling, precisely:

1. The ack is appended **before** `createDomain`, so the reconcile backstop in `reconcileAwsStaticDomains` can never see a domain row whose ack is not yet persisted. (The reverse order would leave a window in which a sweep-triggered reconcile refuses a domain the user just acknowledged, writing a confusing message onto the row.)
2. The append goes through **one** helper, `appendApexAck(tenantId, projectId, host)` in `domains/domain/apex-ack.ts`, which re-reads `projects.settings` inside the same call and writes back `{ ...existing, apexAliasAck: [...set, host] }`. This is the same read-modify-write shape `updateProject` already uses for this column (`projects/domain/projects.ts:266-297`), reused rather than reinvented so there is exactly one merge rule.
3. **Clobber risk, acknowledged.** A read-modify-write races with the other writers of `projects.settings` (the deploy-hook token, `deployTarget`); last writer wins on *keys written in that statement*, and because the merge is a spread of a freshly-read object, a concurrent write to a different key can be lost. The window is milliseconds and the colliding writers are a project-settings save and a deploy, neither of which is plausibly concurrent with an interactive domain add. Mitigation if it ever matters: a `jsonb_set(settings, '{apexAliasAck}', …)` update through the bare `pg.Client` seam that Item 5 already introduces, which merges server-side. **Not done now** — it would add a second write path for this column to avoid a race nobody has hit.
4. If the append fails, the add fails (`500`, nothing created). The ack is a precondition of accepting the domain, so proceeding without it would create a row the backstop immediately refuses.
5. **Stale entries are pruned on domain delete.** `DELETE /projects/:projectId/domains/:domainId` removes the hostname from the list, best-effort: a failed prune is logged at `warn` and does not fail the delete. Keeping the list forever was the earlier intent, but an unpruned list silently re-acknowledges a domain on re-add, which means a user who removed an apex because it did not work gets no second refusal. Pruning makes delete-and-re-add show the explanation again, which is the behaviour the feature exists for.

**Consequences to carry out:**

- **An acknowledged apex must never be failed by a check that cannot decide.** `verifyFlattenedAlias` returns `null` on a miss deliberately, because CloudFront's edges rotate between queries — so for the very configuration this decision enables, "no A overlap" means *unknown*, not *unpublished*. The rule, stated here and again in Item 2's *Making `live` mean "serving"* so the two cannot drift: an **inconclusive** routing check on a host that `isApexDomain` returns `true` for resolves to `live` with a caveat message, never to `awaiting_dns`. Without this, option (b) would accept the apex at the door and then strand it 72 hours later, which is worse than option (a). A test asserts an acked apex whose A set does not overlap the distribution's reaches `live`.
- **There is a third call site, and it takes `"persisted"`.** Besides the route (`"add-form"`) and the reconcile backstop at `aws.ts:104` (`"persisted"`), `apexRefusalMessage` is called at **`aws.ts:125`**, inside the "no usable domains, detach everything" branch — its output becomes the `apexNote` folded into an **apply response message**, not a persisted row and not a form. Adding a required second parameter breaks that line at compile time, so it must be assigned wording here: it uses **`"persisted"`**. There is no checkbox on the surface that renders an apply response, and "remove this domain and add it again, confirming on the form" is the correct instruction in that context. All three sites are now accounted for and none can be left to the implementer's choice.
- `reconcileAwsStaticDomains` (`aws.ts:86-106`) keeps its apex refusal as the backstop — it must now consult the ack list and skip the refusal for acknowledged hosts. Two enforcement points is correct here: the route is the UX, the reconcile is the invariant (a domain row can be created by a path that predates this change).
- **Both** of `verifyDomainDnsStatic`'s negative CNAME branches currently emit "Add a CNAME pointing at …" with no awareness that the host is an apex — the exact message that sent the user to `CNAME Err 1`. There are two: the empty-answer branch (`static/index.ts:133-137`, *"`<host>` has no CNAME record. Add a CNAME pointing at `<expected>`."*) and the `ENODATA`/`ENOTFOUND` catch after the flattening fallback misses (`:168-180`, the one the incident actually hit). Fixing only the cited line would leave the other producing the broken advice. So the guidance comes from **one helper**, `missingRoutingRecordMessage(host, expected)` in `static/index.ts`, used by both branches: when `isApexDomain(host)` it says to use an ALIAS/ANAME/flattened record (or a Route 53 A record with Alias enabled) because a CNAME at the root will be rejected by the registrar; otherwise it emits today's CNAME guidance verbatim. The two branches keep their distinct "yet"/propagation wording as a parameter, so neither message regresses. Both are extracted together with `verifyRoutingRecordAws` (Item 2), which is where they end up living.
- **`AGENTS.md` must be amended.** The current sentence — *"**Apex domains are refused** with an actionable message"* — becomes: apex domains are refused **unless the user has acknowledged that their DNS provider supports ALIAS/ANAME/flattening**, in which case the attachment proceeds and `verifyDomainDns` verifies it through the flattening fallback. The GCP sentence ("Apex works normally") is already correct and stays.

### D2 — Poll cadence, backoff, and giving up  **· SIGN-OFF REQUIRED**

**Scheduling mechanism: one pg-boss cron sweep, not per-certificate self-rescheduling jobs.** `PgBoss.schedule(queue, cron, data, options)` exists in pg-boss 12.18.2 (`dist/index.d.ts:71`) and cron granularity is one minute. **The sweep runs `* * * * *` — a one-minute heartbeat.** Per-certificate jobs with `startAfter` would give exact per-row timing, but they need their own recovery story for a job lost to a crash or a `retentionSeconds` expiry — and `idx_ssl_certificates_pending_verification` exists precisely so a sweep can find the truth in the table instead. The table is the source of truth; the schedule is just a heartbeat. A one-minute heartbeat costs one indexed `SELECT` per minute per instance and is what makes the 1-minute `pending` cadence below actually deliverable; a `*/2` cron would silently round every interval up to the next even minute.

#### The due-ness predicate, stated explicitly

**Three** timestamps are in play and none of them is interchangeable with another. `attach_started_at` is the **phase clock** (see *The phase clock* below) and selects a backoff tier and the phase-scoped deadlines. `updated_at` is the **last time the sweep looked at this row**, which is what `touchCertPolled` exists to record. `created_at` / `issued_at` are the **absolute clocks** that no phase change may reset, and they carry the provider-imposed budgets (see *Which clock feeds which deadline*). The sweep decides due-ness as:

```
phaseStart = attach_started_at ?? created_at          // how long THIS PHASE has been running
lastSeen    = updated_at                              // when we last looked
due         = (now - lastSeen) >= pollIntervalMs(cloud, state, status, now - phaseStart)
```

So the interval table below is a *minimum gap since the last look*, and the phase age only selects which row of the table applies. All of `attach_started_at`, `created_at`, `issued_at` and `updated_at` come back in the candidate query; nothing else is needed.

**The sweep is the only writer of the poll clock.** For every row it deems **due** it calls `touchCertPolled(id)` **before** enqueueing that project's `domain-apply`, and the reconcile's own `setCertState` writes are never relied on for cadence. This matters because several reconcile paths return without writing anything — the deadline path, a thrown reconcile, the R4 schema-drift case in which the write path itself is broken, and an unresolvable `resolveStaticTarget` ("redeploy once"). Were the clock left to the reconcile, each of those would leave `updated_at` untouched and re-enqueue that project **every minute, forever**, which is exactly the provider-call cost the cadence table exists to bound. A row the sweep deems **not due** is not touched — only a look costs a touch. The touch happens even if the enqueue then throws, so a broken queue cannot turn into a per-minute enqueue storm either.

**Per-state cadence, enforced inside the sweep.** A uniform interval is either wasteful (GCP, 15-60 minutes) or sluggish (ACM, minutes). The sweep reads candidates every minute and skips any row that is not due:

| Cloud | `verification_state` | Poll interval | Why |
|---|---|---|---|
| AWS | `pending` | 1 min for the first 5 min of the phase, then 5 min | just created; the next reconcile is the one that requests the certificate. It escalates for the same reason `awaiting_dns` does: a reconcile that keeps failing **transiently** (throttling, a briefly-unreachable ACM) rests here, and an unescalated 1-minute tier would spend a denied or throttled provider call every minute for as long as the condition lasts |
| AWS | `awaiting_dns`, `status != 'active'` (validation record missing) | 5 min for the first 30 min of the phase, then 15 min to 6 h, then 60 min | the user is the blocker; escalating backoff keeps a 72-hour wait from costing hundreds of `DescribeCertificate` calls |
| AWS | `awaiting_dns`, `status = 'active'` (certificate attached, **routing** record missing) | 5 min for the first 30 min, then 15 min to 6 h, then 60 min | same shape, but the poll is a pure `node:dns` lookup with no AWS call, so the escalation is about not spinning rather than about provider cost |
| AWS | `provisioning` (validation record is visible, ACM is validating) | 2 min | resolves in minutes; this is the one phase worth watching closely |
| AWS | `attaching` | 5 min | a CloudFront update takes 5-20 min |
| GCP | `pending` | 1 min for the first 5 min of the phase, then 5 min | as above |
| GCP | `awaiting_dns` (`FAILED_NOT_VISIBLE`) | 15 min | Google re-checks on its own schedule; polling faster tells us nothing new |
| GCP | `provisioning` | 10 min | 15-60 min typical |
| GCP | `attaching` | 5 min | **not written by any current code path** — `gcp.ts:216-223` writes only `live` / `failed` / `awaiting_dns` / `provisioning` — but the `0075` CHECK permits it and the sweep's state filter admits it, so the pair is given a value rather than left to a default. Matches the AWS `attaching` tier |

`pollIntervalMs` therefore takes `status` as well as `cloud` and `state`, because on AWS one `verification_state` covers two phases — the same discriminator the stage model uses in Item 3.

**`pollIntervalMs` is total over the sweep's own filter, and the table above is the whole of it.** The candidate query admits `verification_state IN ('pending','awaiting_dns','provisioning','attaching')` for `type IN ('acm','gcp_managed')` — eight (cloud, state) pairs, **nine** once AWS `awaiting_dns` splits on `status`. The nine rows above cover all nine; the GCP `attaching` row exists only to close the set. The signature and the totality mechanism:

```ts
export function pollIntervalMs(
  cloud: "aws" | "gcp",
  state: PollableCertState,                 // 'pending'|'awaiting_dns'|'provisioning'|'attaching'
  status: string,
  phaseAgeMs: number,
): number;                                   // never null, never undefined
```

`PollableCertState` is a four-member union narrowed from `CertVerificationState`, and the body is an **exhaustive `switch` on `cloud` then `state` with `assertNever(state)` on the default** — so adding a state to the sweep's filter without adding a cadence for it is a *compile* error, not a silently permissive runtime fallback. That is the deliberate choice over "default to 15 minutes": a default is what turned finding F1's state-less `pending` row into a permanent per-minute poll, and the same leniency applied to an unlisted pair would hide the next one. The sweep itself narrows `row.verification_state` into `PollableCertState` once, at the top of the per-row body; a row that somehow holds a state outside the union (a hand-edited row, a future writer) is **skipped with an `error` log naming the pair**, never polled on a guessed interval. `poll-sweep.test.ts` asserts that skip-and-log for an unlisted pair.

**Give-up policy.** `CERT_DEADLINE_MS` (a flat 2 hours, `aws.ts:45`) is wrong in both directions: too short for GCP provisioning plus DNS propagation, and far too short for an ACM certificate waiting on a record the user has not published yet — ACM itself keeps a `PENDING_VALIDATION` certificate for **72 hours** before deleting it. Deadlines become per-cloud and per-state:

On AWS, `awaiting_dns` covers two different waits — *publish the validation record* (before issuance) and *publish the routing record* (after the alias is attached) — so it gets two rows, discriminated by `status` exactly as the stage model does:

| Cloud | State | Deadline | Terminal state and message |
|---|---|---|---|
| AWS | `pending` | 30 min **on the phase clock, which resolves to `created_at` on a first attempt** | `timed_out` — "Dockier has not been able to request a certificate for `<host>`. Open the project's Deployments tab, check that its last deploy succeeded, then choose **Resume**." A row rests here only while the reconcile keeps failing *transiently* (a permanent failure now writes `failed` — see *A transient attach failure is not a terminal state*), and 30 minutes of that is a condition a human needs to look at. Clock choice is justified in *Which clock feeds which deadline* below — `created_at` alone would re-expire a resumed row immediately |
| GCP | `pending` | 30 min, same clock | `timed_out` — same shape and the same reasoning, naming the GCP HTTPS front end instead of the certificate request |
| AWS | `awaiting_dns`, `status != 'active'` | 72 h | `timed_out` — "AWS never saw the validation record for `<host>`, and has now discarded the certificate request. The record was probably never published, or was published with a changed name. Publish the record shown here and choose **Resume** to request a new certificate." |
| AWS | `awaiting_dns`, `status = 'active'` | 72 h | `timed_out` — "`<host>` has a valid certificate attached to the CDN, but the routing record still does not point at `<distributionDomain>`, so nothing is being served. Publish the routing record shown here and choose **Resume**." **No new certificate is requested on resume** — the issued ARN is already on the row, so the reconcile finds it, skips `RequestCertificate`, and goes straight back to checking DNS. |
| AWS | `provisioning` | 2 h **of phase time** | **not** terminal — reverts to `awaiting_dns` with "the validation record is visible but AWS has not issued the certificate; check that the value matches exactly, including any trailing dot your registrar adds". The 72 h ACM budget is **not** reset by this revert, because it is measured from `created_at`, not from the phase clock — see below. |
| AWS | `attaching` | 90 min | `timed_out` — "The CloudFront update for `<host>` has not finished after 90 minutes, which usually means the site's CloudFormation stack is stuck or rolled back. Open the project's Deployments tab, redeploy once, then choose **Resume**." |
| GCP | `provisioning` | 24 h | `timed_out` — "Google has not issued the certificate for `<host>` within 24 hours. Check that the A record points at `<cdnIp>` and that the domain's CAA records permit Google to issue certificates, then choose **Resume**." |
| GCP | `awaiting_dns` | 72 h | `timed_out` — same shape, naming the missing A record. |
| GCP | `attaching` | 90 min | `timed_out` — unreachable today (`gcp.ts:216-223` writes only `live` / `failed` / `awaiting_dns` / `provisioning`) and present to make the table total, because the sweep's filter admits the pair. The AWS `attaching` wording is reused with the load balancer named instead of CloudFront |

**`certDeadlineMs` is total too, and `null` is not a hole in it.** All nine (cloud, state) pairs the sweep's filter admits now have a row, so `certDeadlineMs` is an exhaustive `switch` with `assertNever(state)` on the default, exactly like `pollIntervalMs`. Its `| null` return therefore has **one** meaning and one producer: it is returned only for a `(cloud, state)` pair that has no deadline **by decision**, and after this revision there are none — every one of the nine has a budget. The type keeps the `null` because a future pair may legitimately want "cadence only", and the sweep's handling of it is stated rather than implied: **`null` means "poll on the cadence, never time out", and the sweep skips the deadline comparison for that row entirely.** It never falls back to `CERT_DEADLINE_MS` and never treats `null` as "expired". The `null` branch is kept covered by a `poll-sweep.test.ts` case built on a stubbed `certDeadlineMs` so it cannot rot into an untested path.

**This supersedes R2.7's reference to the 2-hour constant**, under the authority requirements-D2 explicitly gives the design to set the give-up policy ("the design MUST state whether the deadline is per-cloud"). A reader checking R2.7 line by line sees a conflict with its literal wording; the resolution is that R2.7's *binding* clause — **`isPastCertDeadline` SHALL gain a production caller** — is satisfied by the sweep, while the flat 2-hour figure was illustrative of today's constant and is wrong for four of the six waiting states. The constant itself survives as the function's default third argument, so nothing that calls it today changes meaning — **`CERT_DEADLINE_MS` moves out of `aws.ts:45` (where it is module-private) into `static/deadlines.ts` and is exported from there, and `aws.ts` imports it for that default.** The direction matters: `deadlines.ts` must stay dependency-free to be the pure, unit-testable table module this design relies on, so the reconciler imports the constant from it and never the reverse.

**The phase clock, and the invariant that makes it work.** `attach_started_at` is redefined as *"when the current phase began"* rather than *"when the attach began"*, and is stamped on phase **entry**: certificate requested (`awaiting_dns`), validation observed (`provisioning`), attach started (`attaching`), and resume.

> **Invariant:** `attach_started_at` is written **if and only if** the `verification_state` being written differs from the one already persisted on the row. A write that re-asserts the state the row already holds must leave the clock alone.

This is a **change to existing behaviour on both clouds, not a formalisation of it** — and getting it wrong disables the whole give-up policy. `gcp.ts:234` currently writes `attachStartedAt: nowIso()` on **every** row write, unconditionally, and `aws.ts:205-213` re-stamps on every `attaching` write (`attachStartedAt: attach.inProgress ? nowIso() : undefined`). Those were harmless when the only caller was a user click. Under a repeating sweep they are fatal: a clock re-stamped on every look never ages past one poll interval, so GCP's 24 h and 72 h deadlines never fire, AWS's 90-minute `attaching` deadline never fires, the 15-minute and 60-minute backoff tiers are unreachable, and `isPastCertDeadline` — the function R2.7 requires to gain a production caller — never returns `true`.

Mechanically: `setCertState` is given the row's currently-persisted `verificationState` by its callers (both reconcilers already hold the row), and stamps the clock only on a difference. The GCP row loop therefore drops its unconditional `attachStartedAt: nowIso()` and passes it conditionally; the AWS `attaching` write does the same. **No migration** — the column exists in `0075`, only its meaning widens, and the widening is documented in `certs.ts` and in `AGENTS.md`'s column list. The sweep falls back to `created_at` for a pre-existing row with a null clock, so nothing mid-flight at ship time is stranded (NFR5).

#### Which clock feeds which deadline

One clock cannot carry both a phase budget and a provider budget, because a phase entry resets it and a provider's window does not care. An AWS domain whose validation record resolves intermittently (split-horizon resolver, flaky NS, an aggressive cache) would ping-pong `awaiting_dns → provisioning → awaiting_dns`, re-stamp the phase clock on every hop, and never time out — while ACM silently discarded the certificate at the real 72-hour mark, leaving the row polling an ARN that no longer exists. So the deadlines are split across clocks explicitly:

| Deadline | Clock it reads | Why that one |
|---|---|---|
| backoff tier selection (1 → 5 min, 5 → 15 → 60 min) | `attach_started_at ?? created_at` | "how long have we been in this phase" is exactly what the tiers are about |
| **AWS / GCP `pending` — 30 min** | **`attach_started_at ?? created_at`** (the phase clock) | on a **first** attempt the two clocks coincide, because `pending` is the state the row is created in and no phase has been entered yet, so the chain resolves to `created_at` and the review's "30 min on `created_at`" holds exactly. The phase clock is named rather than `created_at` **because of resume**: resume sets `pending` and stamps a fresh phase clock, and a `created_at`-based budget on an hours-old row would re-expire it on the very next sweep, making the button useless. The phase-clock invariant still protects it — a reconcile that re-asserts `pending` does **not** re-stamp, so a stuck row cannot push its own budget out; only the user's explicit resume can |
| AWS `attaching` — 90 min | `attach_started_at` | the CloudFront update genuinely starts when the attach starts |
| GCP `attaching` — 90 min | `attach_started_at` | same reasoning; the pair is unreachable today and present only for totality |
| AWS `provisioning` — 2 h (revert, not terminal) | `attach_started_at` | measures how long ACM has had a visible record |
| GCP `provisioning` — 24 h | `attach_started_at` | measures how long Google has had a live A record |
| **AWS `awaiting_dns`, `status != 'active'` — 72 h** | **`created_at`** | this is ACM's own `PENDING_VALIDATION` discard window, counted from when the row (and the certificate request) came into existence. A phase revert must not reset it. |
| **AWS `awaiting_dns`, `status = 'active'` — 72 h** | **`issued_at`** | the post-attach routing wait starts when the certificate was issued; `issued_at` is already written on that transition (`aws.ts:173-178`) and is never re-stamped by a phase change. |
| **GCP `awaiting_dns` — 72 h** | **`created_at`** | same reasoning as the AWS pre-issuance row |

`certDeadlineMs(cloud, state, status)` therefore returns **both** the budget and which clock it applies to:

```ts
export type DeadlineClock = "phase" | "created" | "issued";
export function certDeadlineMs(
  cloud: "aws" | "gcp",
  state: CertVerificationState,
  status: string,
): { ms: number; clock: DeadlineClock; terminal: boolean } | null;
```

The sweep picks the timestamp named by `clock` and passes it as `isPastCertDeadline`'s first argument, so the deadline primitive stays a pure two-timestamp comparison and all of the clock-selection logic lives in one pure, table-driven function. `terminal: false` is the AWS `provisioning` revert.

**Every clock has a stated fallback, because a null clock disables its deadline silently.** `isPastCertDeadline(null, …)` returns `false` (`aws.ts:537-541`, asserted at `static/__tests__/aws.test.ts:592`), so a row whose named clock is null polls on its cadence **forever and never times out** — the hardest-to-notice version of the exact no-progress failure Item 2 exists to remove. Two of the three clocks are nullable: `attach_started_at` by definition (it is null before the first phase entry), and `issued_at` because it is written by `setCertState`, whose failure is non-fatal and merely returns `false` (see the Item 4 error table). A dropped `issued_at` write, or a row created by a path that never stamped it, is therefore a realistic way to reach a post-attach `awaiting_dns` row with a null clock. So the sweep resolves each clock through a chain, never reading one field raw:

```
phase   → attach_started_at ?? created_at
issued  → issued_at ?? attach_started_at ?? created_at
created → created_at                      // NOT NULL since 0050 — terminates the chain
```

`created_at` is `NOT NULL` on `ssl_certificates` (`0050_domains_certificates.sql`), so every chain terminates on a real timestamp and `certDeadlineMs`'s named clock can never resolve to `null`. The chains are also conservative in the right direction: `created_at` is always the *earliest* of the three, so a fallback can only make a deadline fire sooner than the ideal clock would, never later — a row with a lost `issued_at` times out and tells the user what to do, instead of polling in silence. This also covers NFR5's mid-flight rows, whose clocks predate the write-once rules.

A sweep test asserts it directly: **a post-attach `awaiting_dns` row with `issued_at = null` still times out, on `created_at`.**

**This adds three columns to the read path, and no column to the table.** `created_at`, `issued_at` and `updated_at` all already exist on `ssl_certificates` (`0050_domains_certificates.sql`) and are all already written; they are simply absent from `certs.ts`'s `SELECT_COLUMNS` and from `StaticCertRow`. Both gain them. NFR2 holds — no migration.

**`issued_at` must stop being re-stamped, for the same reason as the phase clock.** `aws.ts:173-178` currently writes `issuedAt: cert.issued ? nowIso() : undefined` inside the per-row persist loop, so **every** reconcile of an issued certificate moves it to now. Under the sweep that would make the post-attach 72-hour routing deadline as unreachable as a re-stamped phase clock. The rule: **`issued_at` is written once, on the transition to issued, and only when the row's existing `issued_at` is null** — `cert.issued && row.issuedAt === null ? nowIso() : undefined`. The GCP twin (`gcp.ts`, `issuedAt: domainActive ? nowIso() : undefined`) takes the same guard. This is a write-once timestamp in every other system that has one; the current behaviour is a latent bug that only an interactive-only caller could hide.

**`isPastCertDeadline` is extended, not replaced — and the deadline is appended, not inserted.** The current signature is `isPastCertDeadline(startedAtIso: string | null, now = Date.now())` (`aws.ts:537`) and the existing test passes `now` in the **second** position (`static/__tests__/aws.test.ts:598`, `:603`). The deadline therefore goes in position **three**, with the current constant as its default, so every existing call keeps its meaning:

```ts
// static/aws.ts — CERT_DEADLINE_MS is now imported from ./deadlines.js
export function isPastCertDeadline(
  startedAtIso: string | null,
  now = Date.now(),
  deadlineMs = CERT_DEADLINE_MS,
): boolean;
```

`CERT_DEADLINE_MS` is module-private at `aws.ts:45` today, so the default argument needs a home that both modules can see: **it moves to `static/deadlines.ts` and is exported from there**, alongside the two tables, and `aws.ts` imports it. `isPastCertDeadline` itself stays in `aws.ts` so its three existing tests keep their import path, and `deadlines.ts` imports nothing from `aws.ts` — which is what keeps it a pure, dependency-free table module.

The existing test file is **extended with new cases** (a per-cloud deadline passed explicitly) rather than left untouched — its three current cases still pass unchanged because they exercise the two-argument form. The deadline table above lives in a new pure `static/deadlines.ts` as `certDeadlineMs(cloud, state, status)` and `pollIntervalMs(cloud, state, status, phaseAgeMs)`. Replacing the function outright would throw away a tested primitive to change one constant into a parameter; wiring it up unchanged would keep a flat 2-hour deadline that is wrong for four of the six waiting states. R2.7's "SHALL gain a production caller" is satisfied — the sweep is that caller.

**Resuming a `timed_out` row.** `timed_out` is excluded from the sweep's state filter, so a timed-out row consumes no poll slots (it stays in the partial index, whose predicate is only `NOT IN ('live','failed')` — the index is tiny and this costs nothing). Resume is an explicit user action: `POST /projects/:projectId/domains/:domainId/resume` (preHandler `PROJECT_MANAGE`) sets `verification_state = 'pending'`, stamps a fresh phase clock, clears `verification_message`, and enqueues `domain-apply`.

**Response contract.** The frontend has to render something after the click, and R3.9 promises "the single action that resumes it", so the endpoint answers with the state it left behind rather than a bare `204`:

```ts
// domains/schemas.ts
export const resumeDomainResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),                             // "Resuming — the next check runs within a minute."
  verificationState: certVerificationStateSchema,  // the state after the reset, or the untouched state
});
```

`verificationState` is what the attachment card uses to re-derive its stages immediately, without waiting for the next 20 s poll. It reuses the existing `certVerificationStateSchema`, so no new enum.

**Rate limit, written out against what `shared/http/rate-limit.ts` actually exports:**

```ts
preHandler: [
  app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
  tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" }),
],
```

Three things are fixed here relative to an earlier revision of this design, all verified in source. The option is **`windowMs`**, not `windowSeconds` (`RateLimitOptions` is exactly `{ max?, windowMs?, prefix? }`, `rate-limit.ts:27-34`). The keying is **per tenant**, not per project: `rateLimit` keys on `request.ip` and `tenantRateLimit` on `request.auth?.tenantId` (`rate-limit.ts:93-130`), and **no project-keyed extractor exists**. This design does **not** add a third one — a new shared primitive is not worth it for a button a human presses, and tenant keying is strictly the tighter bound of the two available (one organization cannot spend another's budget, and a tenant resuming ten different domains in one minute is already pathological). Per `tenantRateLimit`'s own doc comment it must sit **after** the permission preHandler so `request.auth` is populated, which is why the array is ordered as above.

And the precedent is the **deploy hook** — `rateLimit({ max: 5, windowMs: 60_000, prefix: "deploy-hook" })` at `services/deploy/routes/git-push-webhook.ts:76`, the `AGENTS.md`-recorded case of rate-limiting an unauthenticated path into the most expensive operation in the product. The earlier claim that this "matches the `apply` route's treatment" was false: `POST /projects/:projectId/domains/apply` has **no** rate limit at all, and this design does not add one to it (it is authenticated, permission-gated, and its own `singletonKey` already collapses a hammering client's jobs). 10/min is generous for an interactive button and still bounds a stuck client to one `domain-apply` enqueue per six seconds, which that `singletonKey` collapses further. Deleting and re-adding the domain also works and goes through the same reconcile. When ACM has already discarded the ARN, `describeCertificate` returns null (`aws.ts:362`, it swallows and returns null), the adoption scan finds nothing, and a new certificate is requested — the existing code already handles this, no change needed. When the ARN is still valid (the post-attach `awaiting_dns` timeout), the row's `provider_ref` short-circuits that path and **no new certificate is requested**.

Edge cases, all explicit:

| Condition | Response |
|---|---|
| `domainId` not found on this project | `404`, *"That domain is no longer on this project."* (the existing `DomainsError(..., "not_found")` shape) |
| project is not a static deploy (`supported: false` — Dokploy or legacy VPS) | `409`, *"Resume applies only to static-hosted projects with a custom certificate. This project's domains are managed by its deploy platform."* No job enqueued; nothing is mutated. |
| domain exists but has **no** platform-owned certificate row (never reconciled) | `200`, no state write — there is nothing to reset — and `domain-apply` **is** enqueued, which is exactly what creates the row. Idempotent and safe. |
| row is already in a non-terminal state (double-click on Resume, or a sweep got there first) | `200`, **no state write** (resetting a live `attaching` row to `pending` would discard a real in-flight attach), job enqueued. Idempotent "enqueue and return". |
| row is `live` | `200`, no state write, job enqueued — the reconcile re-verifies and either confirms `live` or correctly demotes it if DNS changed. |
| project is static and resolvable as a project, but the attachment view's `blocker` is set (R3.13 — the CDN handle cannot be resolved, "redeploy once") | `200`, **no state write**, job **is** enqueued, and `message` carries **the blocker text verbatim**. Resuming cannot make progress until the project is redeployed, so the response says exactly that instead of leaving the user watching a spinner for a 72-hour budget. The job is still enqueued because it is harmless and self-correcting: if the handle has since become resolvable, the reconcile proceeds normally; if it has not, the reconcile writes the same blocker message it writes today. Not a `409` — nothing is wrong with the *request*, and a `4xx` would read as "Resume is unavailable" when the actual instruction is "redeploy first". |

Only a `timed_out` or `failed` row is reset to `pending`; every other state is left alone and just re-enqueued. That one rule covers all six cases above.

**Interaction with the manual check (R3.10) — overlap is possible, and the guards are elsewhere.** Both the sweep's enqueue and the user's "Check now" go through `enqueueDomainApply`, which passes only `singletonKey: domain-apply:<projectId>` (`shared/workers/config-apply.ts:79-84`; the shared `enqueue(input, singletonKey)` in `queue.ts:226-234` exposes no `singletonSeconds`). pg-boss de-duplicates among **queued** jobs; a job already `active` does not block a new one being created and picked up. So "sweep running, user clicks Check now" can genuinely overlap, and the design does not claim otherwise.

R2.10 is satisfied by three guards that hold under overlap, none of which is the singleton key:

- **No duplicate certificate rows** — `idx_ssl_certificates_static_unique`, partial unique on `(project_id, domain_name) WHERE type IN ('acm','gcp_managed')`. The database wins the race; `ensureStaticCertRow` already treats `23505` as "someone else inserted it" and re-reads.
- **No duplicate ACM certificates** — the ARN already persisted on the row is checked first, and `findAdoptableCertificate` (`aws.ts:418`) scans `ListCertificates` + tags before any `RequestCertificate`. Two concurrent reconciles for an unchanged domain set both find the same certificate.
- **No duplicate or conflicting stack updates** — CloudFormation itself rejects a second concurrent update, which surfaces as `*_IN_PROGRESS` and is already classified **transient** (`retryable: true`). With the terminalisation fix in *A transient attach failure is not a terminal state* (Item 2) the row stays in `attaching` for the next poll, which is the correct outcome, not an error the user should see. **Without** that fix this guard does not hold — it is the one change that makes overlap harmless rather than destructive.

Rejected alternative: serializing properly, either by adding `singletonSeconds` to the shared `enqueue` signature or by taking `pg_advisory_xact_lock(hashtext('domain-apply:' || projectId))` at the top of `applyDomainConfigStatic`. Both work, but `singletonSeconds` changes the enqueue contract for `network-apply` and `certificate-issue` too (they share `configApplyWorker.enqueue`), and an advisory lock adds a failure mode — a lock held by a crashed-mid-transaction worker — to a path whose worst overlap outcome today is one wasted `DescribeCertificate`. If production shows real contention, the advisory lock is the cheaper of the two to add later; this design does not add it.

## Item 1 — Validate the domain at the moment it is added

### Where the checks live

```
POST /projects/:projectId/domains            (routes.ts:63)
  zod body: { name: string().min(1).max(253) }      ← regex REMOVED, see below
    │
    ├─ validateDomainName(raw)                       domain/validation.ts   PURE
    │     → { normalized } | throws DomainsError(msg, "bad_request")
    │
    ├─ resolveStaticCloud(projectId, tenantId)       static/cloud.ts        DB ONLY
    │     TWO queries, no provider call:
    │       1. lookupActiveDeployment  → deployments row (cloud, routeTarget)
    │       2. projects.select("settings")            → apexAliasAck
    │     → { cloud: "aws" | "gcp" | null,           (null = not static, or unknown)
    │         routeTarget: string | null,
    │         apexAliasAck: string[] }
    │
    ├─ acked = body.apexAliasAck === true || apexAliasAck.includes(normalized)
    │  if cloud === "aws" && isApexDomain(normalized) && !acked
    │     → throws DomainsError(apexRefusalMessage(normalized, "add-form"), "bad_request",
    │                           undefined, { clientCode: "apex_requires_ack" })
    │
    ├─ duplicate pre-check on (projectId, normalized)
    │     → throws DomainsError("… is already added to this project.", "conflict")
    │
    ├─ if body.apexAliasAck && isApexDomain(normalized) && cloud === "aws"
    │     → appendApexAck(...)                       BEFORE createDomain, see D1
    │
    ├─ createDomain({ name: normalized })            unchanged, 23505 still handled
    ├─ existingRecordAdvisory(normalized, routeTarget)  best-effort, ≤1.5 s, never blocks
    └─ enqueueDomainApply(...)                       unchanged
```

`validateDomainName` is pure and exhaustively unit-testable; everything platform-aware is a thin wrapper around it. R1.10 is satisfied because all of it is in the route/domain layer — the frontend form only mirrors the messages.

### The zod change, and why the regex moves out

`createDomainBodySchema` (`schemas.ts:16-21`) rejects most malformed names with one message, `"Invalid domain name format"`, delivered as a Fastify validation error. R1.4 requires a specific message per problem, which a single regex cannot produce. The body schema relaxes to `z.string().min(1).max(253)` and the semantic rules move into `validateDomainName`, which throws `DomainsError(..., "bad_request")` and so is rendered as a `400` with a clean `message` by the existing handler (`shared/http/error-handler.ts:41`). `createCertificateBodySchema` keeps its regex untouched — no requirement covers it, and it is reachable only for the three client-creatable certificate types.

### Validation rules

Applied in this order against the raw input, each with its own message. `normalizeHost` (`static/apex.ts:34`) runs first: `trim`, lowercase, strip one trailing dot.

| # | Rule | Message on failure |
|---|---|---|
| 1 | non-empty after trim | "Enter a domain name." |
| 2 | no scheme | "Enter just the domain name, without `http://` or `https://`." |
| 3 | no path, query, port, or whitespace | "Enter just the domain name — remove the path, port or query string." |
| 4 | total length ≤ 253 after normalization | "A domain name can be at most 253 characters." |
| 5 | at least one dot | "`<name>` is not a full domain name. Include the domain suffix, for example `<name>.com`." |
| 6 | no leading/trailing dot, no empty label | "`<name>` has an empty part. Remove the extra dot." |
| 7 | every label 1-63 chars | "The part `<label>` is longer than the 63 characters DNS allows." |
| 8 | no label starts or ends with `-` | "The part `<label>` cannot start or end with a hyphen." |
| 9 | no wildcard | "Wildcard domains such as `*.example.com` are not supported for custom domains yet. Add each subdomain individually." |
| 10 | charset `a-z0-9-` per label, **no exceptions** | "`<name>` contains characters a domain name cannot have. Use letters, numbers and hyphens." |
| 11 | TLD label matches `/^(?:[a-z]{2,}\|xn--[a-z0-9-]{2,})$/` | "`<tld>` is not a valid domain suffix." |

**Wildcards are rejected, deliberately and by their own rule.** Rule 10 admits no `*`, and the wildcard rule is deliberately placed *before* it (position 9) so a leading `*.` gets the specific message instead of a generic charset complaint. Table order and evaluation order agree — there is no exception to "applied in this order". A wildcard is not a regex exception — it is a feature with its own semantics at every layer (is `*.example.com` an apex? a wildcard ACM SAN does not cover the zone root; the routing instructions, the stage model and the duplicate rules would all need overlap handling against `www.example.com`), and none of that is in the requirements. The existing `domains.wildcard` boolean (`0050_domains_certificates.sql:11`, consumed only by `buildCertbotScript` in `nginx-config.ts:175-189`) is untouched and remains a **legacy VPS/certbot** concept; both static reconcilers ignore it, and nothing in this design starts reading it.

**Punycode is accepted as-is; no conversion is performed.** Rule 11 permits an `xn--` TLD so that a user who pastes an already-converted IDN (`xn--p1ai`, `xn--fiqs8s`) is not rejected by a rule about something else, and rule 10 already permits `xn--` labels anywhere else in the name. Unicode **input** stays explicitly out of scope: a non-ASCII name fails rule 10, because converting it would need a new dependency (`AGENTS.md` → *Things to avoid*) and no requirement asks for it. The two halves are now consistent — ASCII in, no translation, punycode is just ASCII.

### Apex policy and cloud resolution

`resolveStaticCloud` must be cheap — it runs inside an interactive add. It reads the active deployment (`lookupActiveDeployment`, already used by `resolveStaticDeployment` in `applier.ts:45`), returns `null` unless `deployStrategy === "static"`, then reads `deployment.infra?.provider`; only when that is absent does it fall back to `getProviderCredentialsSafe(providerId).provider`. **No AWS or GCP API call**, no `resolveStaticTarget` (which does `DescribeStacks` and `GetCallerIdentity`).

It returns `{ cloud, routeTarget, apexAliasAck }`:

```ts
export async function resolveStaticCloud(
  projectId: string,
  tenantId: string,
): Promise<{ cloud: "aws" | "gcp" | null; routeTarget: string | null; apexAliasAck: string[] }>;
```

**It performs two reads, not one — corrected from an earlier revision of this design, which claimed `apexAliasAck` came out of the deployment lookup.** Verified in source: `lookupActiveDeployment` (`shared/service-clients/deployments.ts:66-95`) issues exactly one query, `from("deployments").select("id, provider_id, deploy_strategy, app_url, docker_image, repo, infra")`. It never touches the `projects` table and `settings` is not in its projection, so there is no project row to take the acknowledgement list from. `resolveStaticCloud` therefore does:

```ts
// 1. the existing lookup — cloud + routeTarget
const lookup = await lookupActiveDeployment(projectId, tenantId);

// 2. a second, explicit read for the acknowledgement list
const { data, error } = await supabaseAdmin
  .from("projects")
  .select("settings")
  .eq("id", projectId)
  .eq("organization_id", tenantId)
  .maybeSingle();
```

Two cheap indexed single-row reads inside an interactive add is acceptable, and no cheaper shape exists without widening `lookupActiveDeployment`'s projection for one caller or joining two tables PostgREST would need an embed for — both of which cost more in coupling than the second query costs in latency.

**The second read's failure rule is the opposite of the first's, deliberately.** A failed or absent `projects.settings` read yields `apexAliasAck: []`. The consequence is that a **previously acknowledged** apex is refused again, with the full `"add-form"` explanation and the checkbox: the user re-ticks the box and the add proceeds. That is the safe direction — the refusal is recoverable in one click, whereas honouring a list we could not read would accept an apex the user never acknowledged. It is written down explicitly because it contradicts the fail-**open** rule the next paragraph states for `cloud`, and the two rules sitting next to each other is exactly the kind of thing an implementer would otherwise unify by accident. A test covers it: a settings read that errors refuses an apex whose hostname is in the stored list.

`routeTarget` is `infra.distributionDomain` (AWS) or `infra.cdnIp` (GCP) read from the deployment row — both are already persisted on `InfraMetadata`, so the advisory's comparison above costs nothing beyond what this function already loads. `routeTarget` is `null` when the field is absent (a site deployed before custom-domain support).

Failure mode: if the cloud cannot be determined (no deployment yet, credential read fails), `cloud` is `null` — `routeTarget` is `null` and `apexAliasAck` is `[]` — and **the apex check does not fire**, so the add succeeds. Failing open is correct here: refusing a name on a guess about the platform is a worse error than the backstop refusal in `reconcileAwsStaticDomains`, which still fires later and writes the message onto the certificate row. A project with no deployment yet is the common case for this path, and it genuinely does not yet have a cloud.

`apexRefusalMessage` (`apex.ts:77`) is rewritten to list all four alternatives required by R1.2, in the order of least work for the user — **and it takes a surface argument, because it has two consumers with different affordances**:

```ts
export function apexRefusalMessage(host: string, surface: "add-form" | "persisted"): string;
```

The route uses it as a `400` body under the add form, where the acknowledgement checkbox exists. The reconcile backstop writes the **same function's output** into `verification_message` (`aws.ts:98-104`), which the Domains tab renders and which Item 3's terminal stage surfaces — neither of which has a checkbox or a form. One wording cannot serve both: "tick the box below" on the persisted surface is an instruction the user cannot follow, in a feature whose purpose is removing exactly that kind of dead end. The two differ only in the final clause; everything before it is shared, so the explanation cannot drift.

**`"add-form"`:**

> `skmdesignstudio.com` is the root of its domain. CloudFront can only be reached by a CNAME record, and DNS does not allow a CNAME at a domain root — your registrar will reject it. Four ways forward: use a subdomain such as `www.skmdesignstudio.com` (simplest, and what most sites do); if your DNS provider offers an ALIAS, ANAME or CNAME-flattening record, tick the box below and use that record type at the root; if your DNS is hosted in Route 53, use an A record with Alias enabled; or deploy this project to Google Cloud instead, where a root domain works with a plain A record because the load balancer has its own dedicated IP address.

**`"persisted"`** — identical up to the alternatives, then:

> … Four ways forward: use a subdomain such as `www.skmdesignstudio.com` (simplest, and what most sites do); if your DNS provider offers an ALIAS, ANAME or CNAME-flattening record, remove this domain and add it again, confirming on the form that your provider supports a flattened record at the root; if your DNS is hosted in Route 53, use an A record with Alias enabled; or deploy this project to Google Cloud instead, where a root domain works with a plain A record because the load balancer has its own dedicated IP address.

A test asserts the persisted variant mentions no checkbox.

### The conflicting-record advisory

Cloud-agnostic, best-effort, non-blocking (R1.7, R1.8). After the row is created, `existingRecordAdvisory(host, routeTarget)` resolves `CNAME`, then `A` if that returns nothing, using a dedicated resolver with a hard budget:

```ts
const resolver = new dns.promises.Resolver({ timeout: 1200, tries: 1 });
```

**The answer is compared against this project's CDN, per R1.7 — an already-correct record raises nothing.** `routeTarget` is the `distributionDomain` (AWS) or `cdnIp` (GCP) that `resolveStaticCloud` has already read out of the active deployment's `infra` jsonb in the same request. No provider call, no extra query. The comparison:

- resolved CNAME, lowercased and trailing-dot-stripped, equals `distributionDomain` → **no advisory**. This is the most common real path: the user published the routing record before adding the domain, exactly as happened in the incident. Warning them that their correct record "will be replaced" would be a false alarm in a feature whose purpose is removing confusion.
- resolved A set contains `cdnIp` → **no advisory** (GCP, and the ALIAS-flattened AWS apex case, where the A set is CloudFront's rotating edge IPs and will not match — see below).
- any other answer → advisory.
- `routeTarget` unknown (no deployment yet, cloud not resolvable) → advisory on any answer. Without a target there is nothing to compare, and the advisory is non-blocking, so erring toward informing is acceptable here.

One known imprecision, stated rather than hidden: for an AWS apex using ALIAS/flattening, the resolved A set is CloudFront edge IPs that never equal `cdnIp` (which is a GCP-only field anyway), so such a user may see the advisory about their own correct record. The message is worded to survive that case rather than asserting the record is wrong.

`NXDOMAIN` / `ENODATA` → no advisory. Any other failure → `logger.warn` and no advisory (R1.8). The whole call is wrapped in `Promise.race` against a 1.5 s timer so a pathological resolver cannot hold the HTTP request open.

Returned additively on the create response:

```ts
// schemas.ts — domainSchema
warning: z.string().optional(),
```

`domainSchema` is also the list-response element type; an optional field is additive there and `fastify-type-provider-zod` will simply omit it. Message: *"A DNS record already exists for `www.example.com` and it does not point at this project's CDN. Check it against the records shown below — whatever is there now will stop working once you publish them."* The wording is true whether the existing record is a stale deployment or a different live site, and it never tells a user their correct record is about to break.

### Duplicates

`idx_domains_name_unique` is on `(organization_id, name)` — **tenant-wide, not per-project** (`0050_domains_certificates.sql:19`). So two messages are needed, and the pre-check cannot be skipped:

- pre-check finds the name on **this** project → `conflict`, *"`www.example.com` is already added to this project."*
- insert hits `23505` (the name belongs to another project in the organization) → the existing `"Domain already exists"` becomes *"`www.example.com` is already used by another project in this organization. Remove it there first."*

### Frontend (R1.3)

`DomainsSection` in `ProjectDomainsTab.tsx` already renders `error` under the add form (`:~330`). Changes:

- the `<Input>` gains `aria-invalid={Boolean(error)}` and `aria-describedby` pointing at the error paragraph, which gains `role="alert"` and `id` from `useId()` — so the refusal is announced and tied to the field rather than floating below the form.
- **the apex checkbox is driven by the refusal, not by inferred platform state.** The error handler in `handleAdd` reads the new machine-readable `code` from the `400` body; `code === "apex_requires_ack"` sets `showApexAck`, which renders the checkbox directly beneath the refusal message, pre-focused, with the user's typed name still in the field. Re-submitting with it checked sends `{ name, apexAliasAck: true }`.

  This matters because the alternative — rendering the checkbox when `isApexCandidate(newDomain)` **and** the attachment endpoint reports `cloud === "aws"` — hides the affordance in exactly the cases that need it. The attachment endpoint returns `cloud` only when `supported: true`, which needs a resolvable static deployment; a project that has never deployed, or whose CDN cannot be resolved (the R3.13 `blocker` path), returns no `cloud`. In those cases `resolveStaticCloud` fails open and the add is *allowed*, or the reconcile backstop refuses later — and a `cloud`-gated checkbox would be absent while a `400` tells the user to tick it.

  The pre-emptive render is kept as a pure optimisation: when `cloud === "aws"` **and** `isApexCandidate(newDomain)` (a small frontend mirror of the label-counting rule — the backend remains authoritative), the checkbox appears before the first submit, so a user who knows what they are doing never sees the error at all. Error-driven rendering is the guarantee; pre-emptive rendering is the nicety.

  **Response field, exactly.** `DomainError` already takes structured `metadata` as its fourth constructor argument and the shared handler already logs it (`shared/supabase/errors.ts:33-44`, `shared/http/error-handler.ts:23-28`), so **no new error class or constructor change is needed** — only the serialisation. Today `bad_request` returns `reply.badRequest(msg)`, which @fastify/sensible renders as `{ statusCode, error, message }` with no room for extra fields. The handler's `bad_request` arm changes to:

  ```ts
  case "bad_request": {
    const clientCode = typeof error.metadata?.clientCode === "string" ? error.metadata.clientCode : undefined;
    return reply.status(400).send({
      statusCode: 400,
      error: "Bad Request",
      message: msg,
      ...(clientCode ? { code: clientCode } : {}),
    });
  }
  ```

  The payload is byte-identical to `reply.badRequest(msg)` when no `clientCode` is present, so every other `bad_request` in every service is unaffected; `code` appears only for errors that opt in. `clientCode` is the metadata key rather than `code` to avoid colliding with the error's own `code` discriminator. This is the only generic mechanism added, and `apex_requires_ack` is its only current value.
- the advisory renders as a `warning-surface` / `warning-line` / `warning-ink` note above the list, dismissible, distinct from the `danger` error styling.

## Item 2 — The background certificate poller

### Shape

```
pg-boss cron  "* * * * *"    →  queue CERT_POLL_QUEUE ("cert-poll")
   │   installed once per boot via PgBoss.schedule(name, cron, data, options)
   │   see "Registration" below for the exact options and why `key` matters
   │
   └─ sweepCertificates()                     static/poll-sweep.ts    DB ONLY, no provider calls
        ├─ listCertRowsForPoll()              certs.ts
        │     SELECT id, project_id, organization_id, domain_name, type, status,
        │            verification_state, attach_started_at,
        │            created_at, issued_at, updated_at
        │       FROM ssl_certificates
        │      WHERE type IN ('acm','gcp_managed')
        │        AND verification_state IN ('pending','awaiting_dns','provisioning','attaching')
        │      ORDER BY updated_at ASC
        │      LIMIT 200
        │
        ├─ for each row:  const cloud = row.type === "acm" ? "aws" : "gcp";
        │                 // total over STATIC_CERT_TYPES — the query's own
        │                 // `type IN ('acm','gcp_managed')` filter guarantees it,
        │                 // so there is no third branch and no fallback.
        │                 past certDeadlineMs(cloud, state, status) on ITS named clock?
        │                        → setCertState(timed_out | awaiting_dns, message)
        │                 due per the predicate in D2?  → touchCertPolled(id), collect project
        │                 not due → nothing written (only a look costs a touch)
        │
        └─ for each distinct due project:  enqueueDomainApply(tenantId, projectId)
                                            singletonKey "domain-apply:<projectId>"
                                                    │
                                                    ▼
                                    EXISTING config-apply handler → applyDomainConfig
                                      → applyDomainConfigStatic → reconcile{Aws,Gcp}StaticDomains
```

The state machine is not reimplemented. `reconcileAwsStaticDomains` already: describes or adopts the certificate, persists validation records, attaches on `ISSUED`, and returns without waiting on CloudFront. `reconcileGcpStaticDomains` already maps `cert.domainStatus` onto `live` / `awaiting_dns` / `provisioning` / `failed`. Running either again is exactly "observe the result on a later invocation" (R2.4) — for an `attaching` row, `UpdateStack` answers `"No updates are to be performed"` once CloudFormation has finished, which `updateStackDomainParameters` already translates to `inProgress: false` (`aws.ts:~495`), and the reconcile writes `live`.

### A transient attach failure is not a terminal state

This is a **required change to `reconcileAwsStaticDomains`**, and the sweep is unsafe without it. Today any failed attach is written as `failed`, regardless of whether it is retryable (`aws.ts:200-209`):

```ts
if (!attach.ok) {
  for (const row of rows.values()) {
    await setCertState(row.id, { verificationState: "failed", verificationMessage: attach.message });
  }
  return { success: false, retryable: attach.retryable, message: attach.message };
}
```

While CloudFormation is mid-update, `updateStackDomainParameters` returns `{ ok: false, retryable: true, message: "The site is already being updated. This will be retried shortly." }` for `/_IN_PROGRESS|is in .* state and can not be updated/` (`aws.ts:515-523`). That is survivable today because the only caller is a user click. Under the sweep it is not: a reconcile re-enqueued during the 5-20 minute CloudFront update finds the certificate issued, retries the attach, gets `_IN_PROGRESS`, and flips every row to `failed` — which is **terminal**, excluded from both the sweep's state filter and `idx_ssl_certificates_pending_verification`'s predicate. The attachment would silently stop advancing until the user clicked **Resume**: the exact failure class Item 2 exists to remove, manufactured by Item 2.

The rule, stated as an invariant: **only `retryable: false` may write `failed`.**

```ts
if (!attach.ok) {
  for (const row of rows.values()) {
    await setCertState(row.id, {
      // A transient attach failure means the CDN update is still in flight.
      // Record the message, leave the state and the phase clock alone, and let
      // the next sweep observe the result.
      ...(attach.retryable ? {} : { verificationState: "failed" }),
      verificationMessage: attach.message,
    });
  }
  return { success: false, retryable: attach.retryable, message: attach.message };
}
```

Because the state is unchanged in the retryable branch, the phase-clock invariant above also keeps `attach_started_at` where it was, so the 90-minute `attaching` deadline keeps running across however many `_IN_PROGRESS` observations it takes. The same rule applies to every other `!ok` write in both reconcilers, and `classifyAwsError` (Item 4) is what decides which side of it a given error falls on.

**And the mirror of it: a permanent failure must write its state, not just return.** The rule above constrains what a reconcile may write; this one constrains what it may *omit*. Verified in source: after `ensureStaticCertRow` succeeds, a failing `ensureCertificateForDomains` at `aws.ts:163-165` is

```ts
const cert = await ensureCertificateForDomains({ target, projectId, wanted, rows: [...rows.values()] });
if (!cert.ok) {
  return { success: false, retryable: cert.retryable, message: cert.message };
}
```

— **no `setCertState` call at all**. So the incident's own step 3 (`acm:RequestCertificate` denied, `retryable: false`) leaves every row of that project at `verification_state = 'pending'` with a null `verification_message`, forever. Under the sweep that row is due on the `pending` tier, is re-looked-at indefinitely, and re-runs `GetCallerIdentity` + `DescribeStacks` + `ListCertificates` + a denied `RequestCertificate` on every look — while the Domains tab shows a stage model with no explanation on it. That is R2.9 ("each failure SHALL be recorded on that project's certificate row rather than only in logs"), R2.11 ("a steady-state installation performs no provider calls") and NFR3 all violated at once, by the state-less branch rather than by the cadence.

**The rule, stated as the mirror image and kept in this same subsection so the two cannot drift: every `!ok` return in either reconciler writes its classified message onto every row it holds, and writes `verificationState: "failed"` when and only when the failure is `retryable: false`.**

```ts
if (!cert.ok) {
  for (const row of rows.values()) {
    await setCertState(row.id, {
      // Permanent (IAM, quota, schema drift) → terminal, with the reason on the row.
      // Transient (throttle, network) → message only; the next sweep tries again.
      ...(cert.retryable ? {} : { verificationState: "failed" }),
      verificationMessage: cert.message,
    });
  }
  return { success: false, retryable: cert.retryable, message: cert.message };
}
```

Two consequences follow, and both are what make the `pending` tier affordable:

- A **permanent** failure lands on `failed`, which is terminal, outside the sweep's state filter and outside `idx_ssl_certificates_pending_verification`'s predicate. The project stops being polled entirely, the user sees the IAM message from Item 4 and the single **Resume** button from R3.9, and `acm:RequestCertificate` is called exactly once rather than once a minute forever.
- A **transient** failure stays `pending` with a message on it, so it is still visibly in flight — and is now bounded by the `pending` deadline added to the D2 table below rather than polling without end.

The same shape applies to every other `!ok` return in both reconcilers **that holds rows** — the attach failure above, the GCP reconciler's equivalents, and any future one. Two `!ok` returns hold no row to write to and are therefore explicitly out of this rule: the `ensureStaticCertRow` failure (the R4 schema-drift case — the row could not be created, so the message travels in the apply response and `/readyz` is the operator surface, per Item 5) and the detach branch at `aws.ts:126`, which is reached only when `usable.length === 0` and the rows for this project have just been removed as orphaned. `classifyAwsError` and `classifyDbError` decide `retryable`; this rule decides what gets written.

A test asserts it directly: an `AccessDeniedException` on `RequestCertificate` leaves every row at `verification_state = 'failed'` carrying the IAM message, and a throttling error leaves them at `pending` carrying the transient message (`aws-cert-write.test.ts`, the R7.4 row).

Rejected alternative: a dedicated `pollCertificate(certId)` state machine beside the reconcilers. It would duplicate the ACM describe, the adoption scan, the alias attach and the orphan cleanup, and the two copies would drift — and the first drift would be invisible, because the poller's copy only runs in production.

### Index use

**`LIMIT 200`, and what happens past it.** `ORDER BY updated_at ASC` is load-bearing rather than cosmetic: it puts the longest-unlooked-at rows at the front, so the batch is always the rows most overdue for a look. An installation holding more than 200 non-terminal certificate rows therefore degrades to a **longer effective poll interval** for every row rather than starving any particular row — each row still comes round, just later than its table interval. That is the right failure direction for a progress poller (slower, never stuck), and at a realistic few rows per tenant the limit is a guard against a pathological query plan, not an operating constraint. If an installation ever reaches it, raise the limit; nothing else needs to change.

The candidate query's `IN` list is a strict subset of `idx_ssl_certificates_pending_verification`'s predicate (`verification_state NOT IN ('live','failed')`), so the planner can use the partial index; `type IN (...)` filters the handful of rows it returns. `timed_out` is deliberately excluded from the query, not from the index — amending the index would mean a migration for a table that holds a few rows per tenant.

### The `updated_at` touch, and why no new column

The sweep needs "when was this row last polled". `setCertState` always writes `updated_at` (`certs.ts:147`), so a poll that changes state records itself. A poll that changes nothing does not, and the row would come back due every minute forever (the due-ness predicate in D2 reads `updated_at` as "last seen"). Fix: `touchCertPolled(id)` — an update that sets only `updated_at`. Consequence, documented in `certs.ts`: `updated_at` means *last time we looked at this row*, not *last state change*.

**That redefinition is user-visible, so it was checked against every consumer.** `rowToCertificate` maps it onto the API response (`domains/domain/mappers.ts:100`, `updatedAt: row.updated_at`), `listCertificates` selects `*` (`domains/domain/domains.ts:189-194`), and `sslCertificateSchema` declares `updatedAt: z.string()` (`domains/schemas.ts:69`) — so after `touchCertPolled` every in-flight certificate will permanently report an `updatedAt` of roughly a minute ago. **Verified: no surface renders it.** `grep -rn "updatedAt" frontend/src` returns one unrelated hit (`src/types/sast.ts:62`); `ProjectDomainsTab.tsx` does not read the field, and nothing in the frontend labels a certificate's `updatedAt` as "last changed" or "last updated". The field therefore stays on the response (removing it would be a contract break for no gain) and no label changes. If a later surface wants to show it, the honest label is **"last checked"** — which is what the new semantics actually mean, and which is more useful on this screen than "last changed" ever was. The remaining sweep-side effect is unchanged: a user-initiated apply also defers the next sweep by one interval, which is harmless.

Rejected alternatives: a new `last_polled_at` column (migration, and NFR2 forbids one that is not proven necessary) and an in-process map (lost on restart and not shared between split service instances).

### Making `live` mean "serving" (R2.6)

Today `live` means "the alias is attached to the distribution". That can be true while the user has not published the routing CNAME, in which case the site does not serve. On the `attaching` → done transition the AWS reconcile now re-checks the routing record.

**It cannot call `verifyDomainDnsStatic` to do that, and a new pure helper is extracted instead.** `verifyDomainDnsStatic` takes `{ tenantId, projectId, domainName, deployment: ActiveDeployment }` (`static/index.ts:91-96`) and its first act is `resolveStaticTarget` (`:99`), which on AWS always calls `getAwsAccountId` (STS `GetCallerIdentity`) and additionally `DescribeStacks` when the `infra` handle is absent (`static/target.ts:103-155`) — the very cost that justifies `target-cache.ts` further down. And `reconcileAwsStaticDomains` holds an `AwsStaticTarget`, not an `ActiveDeployment`, so it could not call it as written anyway. So the DNS half is carved out of `index.ts:113-155` into a pure function:

**The helper is three-valued, not boolean, because "no overlap" is not "no record".** `verifyFlattenedAlias` (`static/index.ts:220-247`) returns `null` on a miss *on purpose*, and its header comment says why: *"CloudFront returns different edges per query, so a miss is inconclusive, not a failure — hence null rather than a negative verdict."* `AGENTS.md` records that fallback as deliberate. Collapsing it into `verified: false` and then gating `live` on that boolean would break the one configuration D1 exists to enable: an apex accepted via `apexAliasAck`, served by a correct ALIAS/ANAME/flattened record, answers no CNAME at all, and its A set is CloudFront edge IPs that frequently will not intersect a *separate* `dns.resolve4(distributionDomain)` query. Such a row would be written to post-attach `awaiting_dns`, told to publish a record it already published correctly, and timed out 72 hours later — manufacturing exactly the dead end this spec exists to delete. So the outcome is an enum:

```ts
export type RoutingCheck =
  | { outcome: "verified"; serverIp: string; resolvedIp?: string; message: string }
  | { outcome: "inconclusive"; serverIp: string; message: string }   // no CNAME, no A overlap
  | { outcome: "missing"; serverIp: string; message: string }        // no record at all
  | { outcome: "mismatched"; serverIp: string; resolvedIp: string; message: string };

/** Pure DNS: does `host` route to this distribution? Includes the flattened-ALIAS fallback. */
export async function verifyRoutingRecordAws(
  host: string,
  distributionDomain: string,
): Promise<RoutingCheck>;
```

`serverIp` is on **every** variant, because `verifyDomainDnsStatic`'s current contract returns `serverIp: expected` on every one of its return paths (verified at `static/index.ts:113-155`) and that field is part of an existing response the frontend reads. Keeping it on the helper means the wrapper is a pure mapping — `{ verified: outcome === "verified", serverIp, resolvedIp, message }` — with nothing re-attached and no chance of the field silently disappearing from one branch. The value is `normalizeHost(distributionDomain)`, which is what `expected` already is today.

`verifyFlattenedAlias` stays as the internal fallback that produces `inconclusive` versus `verified`, so a correctly flattened apex is still not reported as broken. Both `verifyDomainDnsStatic` (which keeps resolving the target and then delegates) and the reconcile (which already holds `target.distributionDomain`) call it, so there is one routing check and no duplicated resolver logic. With the extraction, the call the reconcile makes really is what the design claims: pure `node:dns`, no AWS call.

**The `attaching` → done transition, stated as four rules over the outcome:**

| `RoutingCheck.outcome` | Host | Resulting state | `verification_message` |
|---|---|---|---|
| `verified` | any | `live` | cleared (`null`) |
| `inconclusive` | `isApexDomain(host)` | **`live`** | *"Serving over HTTPS. The root-domain ALIAS record cannot be confirmed by a DNS lookup, so if the site does not load, check that the record at the root points at `<distributionDomain>`."* |
| `inconclusive` | not an apex | treated as `missing` → post-attach `awaiting_dns` | the `missing` message below |
| `missing` / `mismatched` | any | post-attach `awaiting_dns` | *"The certificate is attached. Publish the routing record shown here and `<host>` will go live within a few minutes."* |

An acknowledged apex therefore **never** lands in post-attach `awaiting_dns` on an inconclusive lookup, and so can never reach the 72-hour `issued_at` deadline on the strength of a check that is documented as unable to decide. A non-apex host with neither a CNAME nor an A overlap genuinely is unconfigured, so folding `inconclusive` into `missing` there is correct rather than lenient — the flattening fallback only exists for records that answer A instead of CNAME, which is an apex concern.

The cost of being wrong is asymmetric and that is why the rule leans this way: calling an acked apex `live` when it is in fact unpublished shows the user an optimistic state they can see is wrong by loading the site, with the caveat message telling them exactly which record to check; calling it `awaiting_dns` when it is correct is a permanent, self-inflicted dead end. The next sweep promotes a `missing`/`mismatched` row to `live` once DNS lands.

This is the post-attach `awaiting_dns` that stage (e), the D2 cadence table and the D2 deadline table all key off `status === "active"`. The row's `status` is `active` by this point (the certificate is issued), which is what keeps it distinguishable from the pre-issuance `awaiting_dns` that looks identical in `verification_state` alone.

GCP needs none of this: a Google-managed certificate only reaches `ACTIVE` because Google reached the load balancer at that domain, which already proves the A record is live.

**Limitation, stated plainly:** this is a DNS check, not a TLS handshake. The backend performs no outbound HTTPS request to the customer domain — that would be a new egress dependency inside a job, with firewall and timeout failure modes of its own. A genuine end-to-end TLS assertion stays integration-only (R7.10).

### Newly reachable AWS states: `provisioning` and `timed_out`

`provisioning` is in the `0075` CHECK and in `certVerificationStateSchema`, used by GCP and unreachable on AWS. It becomes the honest answer to "whose turn is it" during ACM validation: when the certificate is not yet issued, the reconcile resolves the validation record's own name with a bare `dns.resolveCname` (the same pure-resolver treatment as `verifyRoutingRecordAws` — not through `verifyDomainDnsStatic`, which would resolve the static target first).

- the `_x…` CNAME resolves → `provisioning`, owner **AWS**, message *"AWS can see the validation record and is issuing the certificate. This usually completes within a few minutes."*
- it does not resolve → `awaiting_dns`, owner **you**, today's message.

ACM's API cannot tell us this — `ValidationStatus` stays `PENDING_VALIDATION` until it flips to `SUCCESS` — so the DNS lookup is the only way to distinguish "the user has not acted" from "the user acted and AWS is working". That distinction is the single most valuable thing R3 can show, and it costs one DNS query per poll.

**No new `verification_state` value is introduced, and the full set of reachability changes is: `provisioning` becomes reachable on AWS (it was GCP-only), and `timed_out` becomes reachable on both AWS and GCP (D2's deadlines are its first writer — the requirements glossary records it as unused today).** Both values are already in the `0075` CHECK and in `certVerificationStateSchema`, so no migration and no schema widening.

### Failure isolation and idempotency

- **R2.9** — each project is its own pg-boss job, so one project's reconcile failure cannot abort another's. Within the sweep itself, each row is processed in its own `try`/`catch`; a failure is logged at `error` and written onto that row via `setCertState` when the write path is healthy. If the write path is itself broken (the R4 schema-drift case) the sweep logs and moves on; `/readyz` from R5 is the signal that covers that case.
- **R2.10** — duplicate rows are prevented by `idx_ssl_certificates_static_unique`; duplicate certificates by `findAdoptableCertificate` (`aws.ts:418`) plus the ARN already on the row; duplicate jobs by the `singletonKey`.
- **R2.11** — an empty candidate query enqueues nothing. Steady state is one cheap indexed `SELECT` per minute per instance and zero provider calls. **Reaching that steady state depends on two rules stated above, not on the query alone:** a permanently-failing reconcile writes `failed` (so the row leaves the filter), and every non-terminal (cloud, state) pair has a deadline that eventually writes `timed_out` (so a persistently-transient one leaves it too). Without both, a single broken attachment keeps one project in the candidate set indefinitely and R2.11 is false for that installation — which is exactly the shape the fourth design review caught.
- **R2.12** — the poller introduces no AWS action: every call it causes is one the existing reconcile already makes, all of them in R6's policy.

### Registration

`CERT_POLL_QUEUE` joins the queue-name block in `shared/database/queue.ts`. The worker is created with `createWorker` (`retryLimit: 1`, `expireInSeconds: 120`, `pollingIntervalSeconds: 5`) in a new `shared/workers/cert-poll.ts`, and registered in `run-server.ts`'s `workerRegistry` under `services: ["domains"]`, alongside the existing config-apply entry.

**The cron is installed immediately after the queue is created, not in `onStartup`.** pg-boss stores a schedule in `pgboss.schedule` with a foreign key to the queue row, and rewrites the FK violation to the unhelpful `Queue cert-poll not found`. The queue row is created by `createWorker`'s `register()` → `queue.createQueue(queueName)` (`queue.ts:~186`), and `run-server.ts:128-131` runs the hooks in the order **`onStartup` then `register`**. Installing the schedule in `onStartup` would therefore throw on any database that has not already seen the `cert-poll` queue — which includes every first deploy. So the module exports one function that does both, in order:

```ts
// shared/workers/cert-poll.ts
export const CERT_POLL_SCHEDULE_KEY = "cert-poll-sweep";

const scheduleCertPollSweep = async (): Promise<void> => {
  const boss = getQueue();           // shared/database/queue.ts:31 — createWorker
  if (!boss) return;                 // exposes no PgBoss handle, so take it here
  await boss.schedule(CERT_POLL_QUEUE, "* * * * *", {}, {
    key: CERT_POLL_SCHEDULE_KEY,         // schedule identity is (name, key)
    singletonKey: CERT_POLL_SCHEDULE_KEY, // applies to the JOBS the schedule sends
  });
};

export const registerCertPollWorker = async (): Promise<void> => {
  await certPollWorker.register();   // creates the queue
  await scheduleCertPollSweep();     // safe now: the queue row exists
};
```

and the registry entry's `register` is that function, with **no `onStartup` hook at all**.

**The two key options are different things, and both are wanted.** `ScheduleOptions = SendOptions & { tz?: string; key?: string }` (verified in pg-boss 12.18.2, `dist/types.d.ts:235-238`, with `schedule(name, cron, data?, options?)` at `dist/index.d.ts:71`). A schedule row's **identity is `(name, key)`**, so passing `key` is what makes repeated installation an upsert — every instance of the `domains` service installing `(cert-poll, cert-poll-sweep)` converges on one schedule row rather than accumulating rows. `singletonKey` is inherited from `SendOptions` and applies to the **jobs the schedule sends**, not to the schedule itself; it is passed as well because it additionally collapses two sweep jobs that land in the same minute (the split-instance case in *Risks*) into one. Omitting `key` would leave the schedule on pg-boss's default key and make the idempotency claim rest on a different mechanism than the one stated. `scheduleCertPollSweep` is additionally guarded by `isQueueReady()` and its failure is logged at `error` without taking the process down — a missing schedule degrades the feature to "manual Check now", which is today's behaviour, while a thrown startup would take the whole service with it. When `DATABASE_URL` is unset, `createWorker`'s in-process fallback means `register()` returns early and the sweep simply never fires — acceptable for local dev, and consistent with how every other queue degrades here.

## Item 3 — The staged progress view

### Stage model, computed on the backend (R3.11)

New pure module `static/stages.ts`:

```ts
export type StageOwner = "you" | "dockier" | "aws" | "google";
export type StageStatus = "done" | "current" | "pending" | "failed";

export interface AttachmentStage {
  id: string;
  label: string;
  owner: StageOwner;
  status: StageStatus;
  /** What is happening, or what the user must do. Never a raw driver string. */
  detail?: string;
  /** Realistic duration for a WAITING stage. Omitted for instant or user-owned stages. */
  eta?: string;
}

export function buildAwsStages(input: CertSnapshot): AttachmentStage[];
export function buildGcpStages(input: CertSnapshot): AttachmentStage[];
```

`CertSnapshot` carries every field a builder needs, all of them persisted (R3.8) and all already in `certs.ts`'s `SELECT_COLUMNS` (verified: `id, domain_name, type, status, provider_ref, validation_record, verification_state, verification_message, attach_started_at`) — so no query change and no migration:

```ts
export interface CertSnapshot {
  verificationState: CertVerificationState;
  verificationMessage: string | null;
  validationRecord: DnsValidationRecord | null;
  providerRef: string | null;
  attachStartedAt: string | null;
  /** 'active' once the provider issued the certificate. The (c)-vs-(e) discriminator on AWS. */
  status: string;
  domainName: string;
  routeTarget: string | null;
}
```

`status` is the one field that makes the AWS model resolvable: `awaiting_dns` covers two distinct waits, and `status` is what tells them apart. It is already on `StaticCertRow` (`certs.ts:25`), so this is a field the snapshot stops dropping rather than a field the snapshot adds. Both builders are pure functions of a snapshot, which makes the whole stage matrix unit-testable (R7.6).

**AWS — seven stages (R3.2), mapped onto existing states:**

| # | Stage | Owner | ETA shown |
|---|---|---|---|
| a | Domain added | dockier | — |
| b | Certificate requested from AWS | dockier | seconds |
| c | Publish the certificate validation record | **you** | — |
| d | AWS is validating the certificate | aws | usually a few minutes once the record is visible |
| e | Publish the routing record | **you** | — |
| f | Attaching the certificate to CloudFront | aws | 5-20 minutes |
| g | Serving over HTTPS | — | — |

**Every stage's status, not just the current one.** `StageStatus` has four values, so "which stage is current" is only a third of the model, and the obvious completion rule — *everything before the current stage is `done`, everything after is `pending`* — is **wrong on AWS**. Verified in source: `aws.ts:173` writes `status: cert.issued ? "active" : "pending"` in the same `setCertState` call as `verificationState: cert.issued ? "attaching" : "awaiting_dns"`, so `awaiting_dns` + `status === "active"` cannot occur until the attach has already run. Stage (e) becomes current **after** stage (f) has completed. A position-based rule would either mark (f) `pending` when the CloudFront update has genuinely finished, or mark (e) `done` while it is the thing blocking the user — and R3.1 and R3.4 are exactly the two requirements that rule would break. So the full matrix is specified, per state:

| `verification_state` | a | b | c | d | e | f | g |
|---|---|---|---|---|---|---|---|
| `pending` | done | **current** | pending | pending | pending | pending | pending |
| `awaiting_dns`, `status !== 'active'` | done | done | **current** | pending | pending | pending | pending |
| `provisioning` | done | done | done | **current** | pending | pending | pending |
| `attaching` | done | done | done | done | pending | **current** | pending |
| `awaiting_dns`, `status === 'active'` | done | done | done | done | **current** | **done** | pending |
| `live` | done | done | done | done | done | done | done |
| `failed` / `timed_out` | done | done | — trailing stages replaced by one terminal `failed` stage per R3.9 — |

**The `awaiting_dns` + `status = 'active'` row is the only non-monotonic row in either cloud**, and (f) is `done` there because the attach really has finished — that is what issued the certificate and put the alias on the distribution. Showing it as anything else would tell the user Dockier still owes them work when the only outstanding action is theirs. The terminal row keeps (a) and (b) `done` because they demonstrably happened; which trailing stages are replaced depends on where the failure occurred, and the builder derives that from the same `verification_state`/`status` pair it already has. `buildAwsStages` is a pure function of `CertSnapshot`, so this table is directly a test fixture (R7.6), and the non-monotonic row gets its own assertion.

Stages (c) and (e) are both `awaiting_dns`, disambiguated **solely** by `status`: `!== "active"` means the certificate is not issued yet, so the outstanding record is the ACM validation CNAME; `=== "active"` means it is issued and attached, so the outstanding record is the routing CNAME. `attach_started_at` is explicitly **not** a discriminator here — D2 redefines it as the current phase start and re-stamps it on every phase entry, including the post-attach `awaiting_dns`, so it carries no information about which phase this is. The same `status` split drives the D2 cadence and deadline tables, so there is one discriminator in the whole design, not three. It is also why `provisioning` carries (d) rather than being folded into (c).

**GCP — five stages (R3.3), in its opposite order and with no validation-record stage:**

| # | Stage | Owner | ETA |
|---|---|---|---|
| a | Domain added | dockier | — |
| b | HTTPS front end created on the existing load balancer IP | dockier | under a minute |
| c | Publish the A record to `<cdnIp>` | **you** | — |
| d | Google is validating by reaching your site at this domain | google | 15-60 minutes after the A record is live |
| e | Serving over HTTPS | — | — |

The GCP matrix, same form:

| `verification_state` | a | b | c | d | e |
|---|---|---|---|---|---|
| `pending` | done | **current** | pending | pending | pending |
| `awaiting_dns` (`FAILED_NOT_VISIBLE`) | done | done | **current** | pending | pending |
| `provisioning` | done | done | done | **current** | pending |
| `live` | done | done | done | done | done |
| `failed` / `timed_out` | done | done | — trailing stages replaced by the terminal stage — |

GCP is **fully monotonic**: `status` is not a discriminator here because there is no post-attach wait — Google cannot issue the certificate until the A record is already live, so "publish the A record" strictly precedes "Google is validating" and `attaching` never occurs. That asymmetry is the whole reason the two clouds get separate builders rather than one parameterised one.

**Terminal failure (R3.9).** `failed` and `timed_out` replace the trailing stages with one terminal stage carrying the R4 message, plus `resumable: true` when the row is `timed_out` or the failure is user-recoverable. That drives a single **Resume** button, not a menu of guesses.

### The endpoint

```
GET /projects/:projectId/domains/attachment        preHandler: PROJECT_VIEW
```

One request for the whole tab, polled by the client. Response (`domainAttachmentResponseSchema`, new in `domains/schemas.ts`):

```ts
{
  supported: boolean,                // false → the tab renders today's sync bar unchanged
  cloud?: "aws" | "gcp",
  blocker?: string,                  // R3.13: target could not be resolved
  domains: Array<{
    domainId: string,
    domainName: string,
    verificationState: CertVerificationState,
    stages: AttachmentStage[],
    records: Array<{ name, type, value, purpose }>,   // from the existing instructions builders
    note: string,
    resumable: boolean,
  }>,
}
```

`supported: false` for the Dokploy and legacy VPS branches, which keeps R3's "degrade to today's behaviour" a single frontend condition rather than a per-branch UI.

**`GET /projects/:projectId/domains/:domainId/dns-instructions` is retained, unchanged.** R3.6 requires the copyable records to be served fresh rather than stored stale, and both surfaces now need them: the new attachment card embeds `records[]` in this endpoint's response, while `DomainRow`'s existing instructions panel in `ProjectDomainsTab` keeps calling the per-domain endpoint on expand. Both are served by the **same** builders (`awsDnsInstructions` / the GCP twin), so the content cannot diverge, and `DnsRecordCard` is extracted precisely because two surfaces render the same records. Deprecating the per-domain endpoint would mean rewriting a working panel for no gain; it stays, and the attachment endpoint is additive. If a later pass consolidates the two surfaces, that is the moment to remove it — not now.

**Target resolution cost.** The handler needs the route target (`distributionDomain` / `cdnIp`) and the records, and `resolveStaticTarget` can cost `DescribeStacks` + `GetCallerIdentity`. With the tab polling every 20 s that is unacceptable per request, so a new `static/target-cache.ts` memoises `resolveStaticTarget` per `projectId` for **60 s** (`Map<string, { at: number; resolution }>`, single in-flight promise per key, cleared on process exit like the other in-process caches in `shared/permissions/authorization.ts`). The handle is stable between deploys, the TTL is short enough that a redeploy's new distribution appears within a minute, and the apply path keeps calling `resolveStaticTarget` directly — the cache is read-side only.

**R3.13** — when resolution fails, `blocker` carries the existing actionable message verbatim (`"Could not locate the CloudFront distribution for this site. Redeploy the project and try again."` / the "deployed before custom domains were supported" message) and `domains` is still returned with whatever stage state is persisted, so the view shows a blocked attachment rather than an empty list.

### Frontend

New `frontend/src/pages/ProjectDetail/sections/DomainAttachment.tsx`, rendered by `ProjectDomainsTab` above `DomainsSection`. `frontend/src/services/domains.ts` gains `attachment(projectId)` and `resume(projectId, domainId)`.

- **Structure.** One card per domain; stages as an `<ol>`; each `<li>` carries an icon (`CircleCheckIcon` / `LoaderIcon` / `CircleIcon` / `CircleAlertIcon` from `lucide-react`, already a dependency), the label, an owner pill reading **You** or **AWS** / **Google** / **Dockier**, the detail line, and the ETA.
- **Status is never colour-only (R3.12).** Icon + text label (`Done`, `In progress`, `Waiting on you`, `Not started`, `Failed`) carry the state; colour reinforces it.
- **Current stage** gets `aria-current="step"`. A `<div aria-live="polite" class="sr-only">` announces the current stage label when it changes, so a screen-reader user learns the attachment advanced without re-reading the list.
- **Keyboard.** Everything interactive is a real `<button>`: per-record **Copy**, **Check now**, **Resume**. No custom focus management is needed because there is no popover.
- **Records** reuse the existing record card markup from `DomainRow`'s instructions panel (`ProjectDomainsTab.tsx:~210`), extracted into a shared `DnsRecordCard` so the two surfaces cannot drift. Stage (c) keeps the existing "leave it published so AWS can renew" purpose text (R3.7, already in `awsDnsInstructions`' `purpose`, `aws.ts:561`).
- **Refresh (R3.8).** `setInterval` at 20 s while any domain is non-terminal, cleared when all are terminal, skipped while `document.hidden`. No websocket — the state changes on a minutes-to-hours timescale.
- **`Sync now` → `Check now` (R3.1).** The button stays (same `POST /domains/apply`), moves into the attachment card, and is labelled *"Check now"* with the sub-line *"Progress continues on its own — this just looks sooner."* The old sync-status bar remains for the `supported: false` branches, unchanged.

**Tokens (R3 / NFR1).** `text`, `text-secondary`, `text-muted`, `border`, `card`, `surface`, `bg`; `primary-500` for the current stage; `success-500` / `success-surface` / `success-line` / `success-ink` for done; `warning-*` for "waiting on you"; `danger-*` for failed; `settingsBadgeCls` for the owner pills. Space Grotesk is inherited from the body — no font declaration. **No berry (`dockier-*`) class appears anywhere in this feature**: that scale is legacy and reserved for severity states and marketing.

## Item 4 — Honest failures

### The carrier type

New `static/failures.ts`:

```ts
export type FailureKind =
  | "schema_drift"   // PGRST204 / 42703 / 23514 — permanent
  | "permissions"    // AccessDenied / UnauthorizedOperation — permanent
  | "quota"          // ACM LimitExceeded — permanent
  | "conflict"       // CNAMEAlreadyExists, apex refusal — permanent
  | "stale_stack"    // pre-parameters stack — permanent
  | "transient"      // *_IN_PROGRESS, throttling, network
  | "unknown";

export interface StaticFailure {
  kind: FailureKind;
  retryable: boolean;
  /** User-facing. Never a bare driver string (code style rule). */
  message: string;
  /** For logs only — never serialized to a response. */
  detail?: { code?: string; details?: string; hint?: string; raw?: string };
}

export function classifyDbError(error: PostgrestError, ctx: { domainName: string }): StaticFailure;
export function classifyAwsError(err: unknown, ctx: { operation: string }): StaticFailure;
```

`retryable` is derived from `kind`, never passed in, so the two cannot disagree.

### `certs.ts` returns results, not `null`

| Function | Was | Becomes |
|---|---|---|
| `ensureStaticCertRow` | `Promise<StaticCertRow \| null>` | `Promise<{ ok: true; row: StaticCertRow } \| { ok: false; failure: StaticFailure }>` |
| `listStaticCertRows` | `Promise<StaticCertRow[]>` (`[]` on error) | `Promise<{ ok: true; rows: StaticCertRow[] } \| { ok: false; failure: StaticFailure }>` |
| `findStaticCertRow` | `Promise<StaticCertRow \| null>` | `Promise<{ ok: true; row: StaticCertRow \| null } \| { ok: false; failure: StaticFailure }>` |
| `setCertState` | `Promise<boolean>` | unchanged signature; the log moves `warn` → `error` and keeps the raw error |
| `deleteStaticCertRows` | `Promise<void>` | `Promise<{ ok: boolean }>`; log moves `warn` → `error` and passes the **raw** error |

Callers: `aws.ts` (four sites), `gcp.ts` (three), `static/index.ts` (two — `previewDomainConfigStatic` and `getDomainDnsInstructionsStatic`, which treat `ok: false` as "no certificate yet" and surface the failure message rather than silently showing `pending`).

**R4.10 — a failed list is not an empty list.** `reconcileAwsStaticDomains:113` and `reconcileGcpStaticDomains` currently compute `orphaned` from a list that is `[]` on error, which would delete nothing today but would delete *everything configured-away* if the list were ever partially wrong. With the result type, `ok: false` **skips orphan cleanup entirely** and continues the reconcile — refusing to perform a destructive operation on data we could not read. The skip is logged at `warn` with the failure kind.

**R4.3 — `23505` is unchanged.** `ensureStaticCertRow` still re-reads on a unique violation (`certs.ts:111-114`); the only change is that the re-read now returns a result, and a failing re-read reports its own failure instead of `null`.

### The two message classes that mattered in the incident

**Schema drift (replaces `"Could not record certificate state for … Try Sync again."`, `aws.ts:151-157` and the GCP twin):**

> Custom domains need a database change that has not been applied to this environment yet, so the certificate for `www.skmdesignstudio.com` could not be recorded. Retrying will not help. An operator needs to apply the pending migrations (`pnpm db:migrate`); `GET /readyz` lists which ones are missing.

`retryable: false`, `kind: "schema_drift"`. It names the cause, the actor, the command, and the diagnostic — and it deliberately connects to R5 (R5.10).

**IAM gap (replaces `"Could not request a certificate: <raw AWS error>"`, `aws.ts:325`):**

> Dockier is not allowed to perform `acm:RequestCertificate` with this project's AWS credentials. Add the ACM permissions from `docs/operations/aws-static-hosting-iam.md` to the IAM policy for these credentials, then choose Resume. Retrying without the permission will not help.

`retryable: false`, `kind: "permissions"`. The action name is extracted from AWS's own message with `/not authorized to perform:\s*([a-z0-9]+:[A-Za-z]+)/`, and falls back to naming the SDK operation when AWS does not say. Detection: `err.name`/`Code` matching `AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationError`, or the message containing `is not authorized to perform`. **The ARN AWS returns is not echoed into the message** (NFR4) — it carries the account id and principal path; it goes to the `error` log only.

`classifyAwsError` also covers the already-correct classifications so they live in one place: `LimitExceeded` (quota, permanent, existing message kept), `CNAMEAlreadyExists` (conflict, permanent), the pre-parameters stack message (`stale_stack`, permanent), `_IN_PROGRESS`/`can not be updated`/throttling/network (transient, retryable). **R4.6** is satisfied by moving them, not by changing them.

### Log promotion (R4.8, R4.9)

| Site | Was | Becomes |
|---|---|---|
| `certs.ts:68` list failure | `logger.warn({ err: error, projectId })` | `logger.error` |
| `certs.ts:115` create failure | `logger.warn({ err: error, projectId, domainName })` | `logger.error` |
| `certs.ts:136` read failure | `logger.warn({ err: error, projectId, domainName })` | `logger.error` |
| `certs.ts:198` delete failure | `logger.warn({ err: getErrMsg(error) })` | `logger.error({ err: error, … })` |

All four pass the **raw `PostgrestError`**, normalising the inconsistency R4.9 names. The investigation verified that pino 10 preserves `code`, `details` and `hint` on a plain object under `err` (cert-state report §4), so no custom serializer is needed. `setCertState`'s `warn` (`certs.ts:177`) is promoted on the same grounds — it is the write that records every state transition.

### Propagating `retryable` to the job layer (R4.11)

The flag is currently dropped twice: `applyDomainConfigStatic` (`static/index.ts:62`) returns only `{ success, message }` from an outcome that already has `retryable`, and `ApplyDomainsResult` has no field for it.

- `ApplyDomainsResult` (both `applier.ts:31` and `static/index.ts:19`) gains `retryable?: boolean`.
- `applyDomainResponseSchema` (`schemas.ts:93`) gains `retryable: z.boolean().optional()` — additive, so the existing contract holds.
- `isRetryableFailure` in `domains/domain/worker.ts:39` becomes:

```ts
function isRetryableFailure(result: ApplyDomainsResult): boolean {
  if (result.retryable !== undefined) return result.retryable;   // structured flag wins
  return !result.message.includes("will be applied on next deployment"); // legacy VPS rule
}
```

A permanent failure therefore does not re-throw into pg-boss and does not burn three retries at 30 s / 60 s / 120 s against a condition that cannot change. It is logged once at `error` by the handler and the row carries the message for the UI.

### Error handling, operation by operation

| Operation | Failure condition | Class | Caller receives | Logged |
|---|---|---|---|---|
| `validateDomainName` | any rule in the R1 table | fatal to the request | `400` + specific message | `warn` (by the shared handler) |
| apex policy check | apex on AWS without ack | fatal to the request | `400` + `apexRefusalMessage` | `warn` |
| `resolveStaticCloud` | deployment/credential read fails | recoverable — fails open | add succeeds; apex check skipped | `warn` |
| `existingRecordAdvisory` | timeout / `SERVFAIL` | recoverable | add succeeds, no advisory | `warn` |
| duplicate pre-check / `23505` | name already exists | fatal to the request | `409` + which scope | `warn` |
| `ensureStaticCertRow` | `PGRST204` / `42703` / `23514` | **permanent** | `{ success: false, retryable: false, message: <schema-drift text> }` | `error` + `code`/`details`/`hint` |
| `ensureStaticCertRow` | `23505` | recoverable | re-read result | nothing (expected race) |
| `listStaticCertRows` | any | recoverable, but orphan cleanup is skipped | reconcile continues | `error` + `warn` for the skip |
| `setCertState` | any | recoverable; state is re-derived next sweep | `false`, outcome unaffected | `error` |
| `RequestCertificate` | `AccessDenied` | **permanent** | `retryable: false` + IAM text, **and every certificate row this reconcile holds is written to `verification_state = 'failed'` with that message** — today the `!cert.ok` return at `aws.ts:163-165` writes nothing at all and leaves the rows at `pending`, which under the sweep is a per-minute denied call forever. Required change, see *A transient attach failure is not a terminal state* | `error` (raw message included) |
| `RequestCertificate` | `LimitExceeded` | **permanent** | existing quota text | `error` |
| `RequestCertificate` | network / throttle | transient | `retryable: true` | `error` |
| `DescribeCertificate` | any | recoverable | `null` → treated as "not issued yet", retried next sweep | `warn` (unchanged) |
| `ListCertificates` / `ListTagsForCertificate` | any | recoverable | adoption skipped | `warn` (unchanged) |
| `UpdateStack` | `CNAMEAlreadyExists` | **permanent** | existing conflict text | `error` |
| `UpdateStack` | missing parameters | **permanent** | existing "redeploy once" text | `error` |
| `UpdateStack` | `*_IN_PROGRESS` | transient | `retryable: true`; **only `verification_message` is written — the row keeps `attaching` and its phase clock** (see *A transient attach failure is not a terminal state*). Today this writes `failed`, which is terminal; that is a required change. | `warn` |
| sweep candidate query | any | recoverable | sweep returns, next cron retries | `error` |
| sweep per-row processing | any | recoverable, isolated | other rows continue | `error` |
| `/readyz` ledger read | permissions / pooler / no `DATABASE_URL` | recoverable — **fails open** | `migrations: "unknown"`, never `degraded` on that basis | `warn`, rate-limited by the cache TTL |

## Item 5 — Pending migrations as a readiness problem

### Two sources, one comparison

```
canonical set:  MIGRATION_VERSIONS   backend/src/shared/database/migration-manifest.ts   (generated, checked in)
applied set:    SELECT version FROM supabase_migrations.schema_migrations                (direct pg query)
pending      =  canonical \ applied
```

**Why a checked-in manifest rather than reading `supabase/migrations/` at runtime.** `backend/Dockerfile` copies only `backend` and `code-analysis` into the image — `supabase/` is **not present in production**, verified by reading the Dockerfile. Options were: (a) add `COPY supabase ./supabase` and read the directory at runtime, or (b) generate a manifest at authoring time and commit it. **(b) is chosen**: it needs no image change, it makes the expected set diff-visible in code review, and drift is caught by a test rather than at runtime. The cost is a generation step that can be forgotten, which the test removes:

- `backend/src/scripts/generate-migration-manifest.ts`, wired as `pnpm --filter @dockier/backend-fastify migrations:manifest`, writes the sorted version list from `supabase/migrations/*.sql`.
- `backend/src/shared/database/__tests__/migration-manifest.test.ts` reads the real `supabase/migrations/` directory (present in the repo and in CI) and asserts it matches the manifest. A new migration without a regenerated manifest fails CI.

Version extraction is the numeric filename prefix (`/^(\d+)_/`), which is what the Supabase CLI records — confirmed by the ledger topping out at `0073` while the files are `0073_*.sql`. **R5.9** falls out of using set difference rather than a max comparison: the deliberately reserved `0074` has no file, so it is never pending.

### Reading the ledger

`supabase_migrations` is not in PostgREST's exposed schemas, so `supabaseAdmin` cannot read it. New `shared/database/migration-state.ts` uses a short-lived `pg.Client` on `DATABASE_URL` with `getPostgresConnectionConfig`, exactly the precedent in `services/code-analysis/domain/scan-queue-reconcile.ts:17-28`:

```sql
SELECT version FROM supabase_migrations.schema_migrations
```

Guards: `statement_timeout = '2s'` set on the connection, `client.end()` in a `finally`, and the whole thing behind the cache below so a hammered `/readyz` cannot open a connection per request.

### Caching and failure behaviour

```ts
type MigrationState =
  | { status: "ready" }
  | { status: "pending"; versions: string[] }
  | { status: "unknown"; reason: string };
```

Module-level cache, **30 s TTL**, with a single in-flight promise so concurrent probes share one query (R5.8). A `pending` result is cached for the same 30 s — it is a deploy-scale condition, and an operator applying migrations sees it clear within half a minute. `unknown` is cached too, so a broken ledger read costs one query per 30 s, not one per probe.

**R5.7 — fails open.** `unknown` never contributes to `degraded`; it is reported as a field so an operator can see the diagnostic itself is blind. No `DATABASE_URL` (local dev, tests) yields `unknown` for the same reason.

### `/readyz` shape

```ts
app.get("/readyz", async (_request, reply) => {
  const queueReady = isQueueReady();
  const migrations = await getMigrationState();          // cached, fail-open
  const degraded = !queueReady || migrations.status === "pending";
  return reply.code(degraded ? 503 : 200).send({
    status: degraded ? "degraded" : "ready",
    service,
    queue: queueReady ? "ready" : "unavailable",
    migrations: migrations.status,
    ...(migrations.status === "pending" ? { pendingMigrations: migrations.versions } : {}),
  });
});
```

`GET /healthz` is **not touched** — it stays the static literal, per `AGENTS.md` and R5.5. `/readyz` stays **unwired from any platform probe** (R5.6); the Dockerfile `HEALTHCHECK` already points at `/healthz` and must stay that way.

**Honest note on R5.4.** The two existing `/readyz` assertions use `toEqual` on the whole body (`shared/http/__tests__/app-hardening.test.ts:98-113`), so an additive field does break them. The change is one key added to two object literals (`migrations: "unknown"`, since tests run without `DATABASE_URL`) — an extension, not a rewrite, and the test names and intent are unchanged. Two new cases cover `pending` (ledger mocked behind the real manifest → `503` with the versions named) and the ready path.

## Item 6 — The IAM document

`docs/operations/aws-static-hosting-iam.md` is extended in place (R6.1). Five edits, all sourced from the IAM report's §2 and §6:

1. **Policy block** — append the two statements verbatim from report §2.1: `StaticDomainCertificates` (`acm:RequestCertificate`, `acm:AddTagsToCertificate`, `acm:DescribeCertificate`, `acm:ListTagsForCertificate`) on `arn:aws:acm:us-east-1:<account-id>:certificate/*`, and `StaticDomainCertificateDiscovery` (`acm:ListCertificates`) on `"*"`, with the one-line reason that a list operation has no resource in scope. The document's existing style uses `<account-id>` placeholders, so the report's literal `251486138355` is substituted out.
2. **"What the adapter does" table** — four new rows (R6.7): request the certificate → `acm:RequestCertificate` + `acm:AddTagsToCertificate`; read status and the validation record → `acm:DescribeCertificate`; adopt an existing certificate → `acm:ListCertificates` + `acm:ListTagsForCertificate`; attach the alias → `cloudformation:UpdateStack` plus the CloudFront distribution-update actions already granted.
3. **Replace the final bullet** (R6.2). *"Custom domains are not covered…"* is deleted and replaced with a short "Custom domains" subsection stating: ACM is the **only** new service (R6.4); its CloudFormation and CloudFront usage is a subset of what a static deploy already exercises (R6.4); certificates are always requested in `us-east-1`, so the ACM statements can be region-pinned while the CloudFormation statement cannot, because a project's stack can live in any region (R6.6); and **no Route 53 permission is required** because DNS verification is public resolution through `node:dns`, including the ALIAS-flattening fallback, with no AWS call in that path (R6.5).
4. **`acm:AddTagsToCertificate` annotation** (R6.9) — marked as inferred from the ACM tag-on-create contract rather than from a distinct SDK call, with the note that dropping it is survivable and watching for an `AddTagsToCertificate` denial is the fallback. Matches the honesty of report §9.
5. **Operational consequence** (R6.8) — a note that no ACM certificate is ever deleted, so unused `PENDING_VALIDATION` certificates accumulate in `us-east-1` until the account hits its ACM quota, at which point the user-facing quota message tells the operator to clean up by hand. Linked to the follow-up below.

R6.10 is satisfied from the other side: the R4 permission message names this document by path.

## Item 7 — Tests

### The regression test that does not mock `../certs.js`

`static/__tests__/aws.test.ts:74` replaces the whole `../certs.js` module, which is why every test passed while production could not insert a row. The fix is **not** to unpick that mock — it is doing its job for the reconcile-logic tests, and rewriting it would churn a passing suite (R7.8). Instead, coverage is added one layer down, where the real query builder runs:

**New `static/__tests__/certs.test.ts`** mocks only `shared/supabase/client.js`, with a fake that mimics PostgREST's builder chain and returns real-shaped errors:

```ts
const failingInsert = {
  code: "PGRST204",
  message: "Could not find the 'verification_state' column of 'ssl_certificates' in the schema cache",
  details: null,
  hint: null,
};
```

Cases (R7.2, R7.3): `PGRST204`, `42703` (`undefined column "verification_state"`), `23514` (`ssl_certificates_type_check`) each assert `ok: false`, `failure.retryable === false`, `failure.kind === "schema_drift"`, and that the message does **not** contain `"Try Sync again"`. `23505` asserts a re-read rather than a reported failure. A `listStaticCertRows` failure asserts `ok: false` and — in a companion reconcile test — that orphan deletion was **not** called.

**New `static/__tests__/aws-cert-write.test.ts`** is the end-to-end-within-the-process version: it mocks `lib/aws-sdk.js` (as the existing suite does) **and** `shared/supabase/client.js`, leaving the real `certs.ts` in the graph, and asserts that `reconcileAwsStaticDomains` against the pre-`0075` schema shape returns `retryable: false` with the schema-drift message and **never reaches `RequestCertificate`** (`acmSend` not called). That is the exact production failure, reproduced in a unit test. A separate file rather than an edit to `aws.test.ts` because the two need incompatible module mocks.

### The rest

| Requirement | File | What is asserted |
|---|---|---|
| R7.4 | `aws-cert-write.test.ts` | an `AccessDeniedException` on `RequestCertificate` → non-retryable, names the action, references the IAM doc path — **and leaves every certificate row at `verification_state = 'failed'` carrying that message, not at `pending` with a null message** (the F1 regression guard: a permanently denied request must leave the sweep's state filter so it is not re-attempted every minute). The companion case: a throttling error on the same call leaves the rows at `pending` **with** the transient message written |
| R7.5 | `domain/__tests__/validation.test.ts` | the full R1 rule table (one case per message, including wildcard rejected by rule 9 and an `xn--` TLD accepted by rule 11, plus an assertion that `*.example.com` yields the wildcard message rather than the charset message, proving rule 9 is evaluated first); normalization (`WWW.Example.com.` ≡ `www.example.com`); duplicate-on-project vs duplicate-in-org; apex refused on AWS without ack **and the refusal carries `code: "apex_requires_ack"`**; apex accepted with `apexAliasAck: true` in the body on a first add (the stored list empty); apex accepted from the stored list with no flag in the body; apex accepted on GCP; ack pruned on delete so a re-add refuses again; **a failing `projects.select("settings")` read yields `apexAliasAck: []`, so an apex already in the stored list is refused again with the `"add-form"` message** (the F2 failure rule, which is deliberately the opposite direction from `cloud`'s fail-open) |
| R1.7 | `domain/__tests__/advisory.test.ts` | a resolved CNAME equal to `distributionDomain` produces **no** advisory; a different CNAME does; an A record equal to `cdnIp` produces none; `NXDOMAIN` produces none; a resolver timeout produces none and does not throw |
| R7.6 | `static/__tests__/poll-sweep.test.ts` | candidate filtering (including `status` selected); the due-ness predicate (`updated_at` gap vs `pollIntervalMs`, phase age from `attach_started_at ?? created_at`); the two AWS `awaiting_dns` cadences split by `status`; deadline → `timed_out` with the **routing**-record message for `status = 'active'` and the **validation**-record message otherwise; `provisioning` → `awaiting_dns` revert at 2 h; **a row that has oscillated `provisioning ↔ awaiting_dns` with a freshly-stamped `attach_started_at` still times out on `created_at` at 72 h** (the clock-selection test); **the 90-min `attaching` deadline reads `attach_started_at` and the post-attach 72 h reads `issued_at`**; **every due row is `touchCertPolled`, including one whose project enqueue throws**; a not-due row is not touched; one row throwing does not abort the sweep; one enqueue per project regardless of domain count; **`cloud` derived from `row.type` for both `acm` and `gcp_managed`**; **a post-attach `awaiting_dns` row with `issued_at = null` still times out on `created_at`**, and the companion cases that a null `attach_started_at` falls back to `created_at` for both the phase clock and the tier selection; more than 200 non-terminal rows yields a batch of the 200 oldest `updated_at` and no starvation across two consecutive sweeps; **a `pending` row 31 minutes past its phase clock reaches `timed_out` with the "check the last deploy, then Resume" message, on both clouds**; **the `pending` cadence escalates — a row 2 minutes into the phase is due at 1 min, a row 10 minutes in is due at 5 min**; **a row holding a state outside `PollableCertState` is skipped with an `error` log naming the pair and is neither polled nor touched**; **a stubbed `certDeadlineMs` returning `null` leaves the row polling on its cadence with no deadline comparison and no state write** |
| R7.6 | `static/__tests__/aws.test.ts` (extended) | `awaiting_dns` → `provisioning` on a resolvable validation record; `attaching` returning without blocking (already covered, kept); **a reconcile over an `attaching` row whose `UpdateStack` answers `_IN_PROGRESS` leaves `verification_state = 'attaching'`, writes no `failed`, and does not move `attach_started_at`**; `attaching` → `live` on `outcome: "verified"`; **an acked apex whose A set does not overlap the distribution's (`outcome: "inconclusive"`) reaches `live` with the caveat message, NOT post-attach `awaiting_dns`** — the D1 regression guard; a non-apex host with `outcome: "inconclusive"` is treated as `missing` and does reach post-attach `awaiting_dns`; `outcome: "mismatched"` likewise; **a second reconcile that re-asserts an unchanged state does not move `attach_started_at`** (asserted on both the AWS `attaching` write and, in `gcp.test.ts`, an unchanged `provisioning` row); **a reconcile of an already-issued certificate whose row carries a non-null `issued_at` does not re-stamp it**; new `isPastCertDeadline` cases passing an explicit third-argument deadline, alongside the three existing two-argument cases unchanged |
| R1 / D1 | `domain/__tests__/apex-message.test.ts` | `apexRefusalMessage(host, "add-form")` mentions the checkbox; `apexRefusalMessage(host, "persisted")` mentions **no** checkbox and tells the user to remove and re-add; both list all four alternatives. The three call sites are covered by their own suites rather than here: the route (`"add-form"`), the backstop at `aws.ts:104` and the detach branch at `aws.ts:125` (both `"persisted"` — the detach case asserts the apply-response `message` carries no checkbox instruction) |
| R1 / D1 | `static/__tests__/index.test.ts` (extended) | `missingRoutingRecordMessage` gives apex-aware guidance from **both** negative CNAME branches (empty answer and `ENODATA`), and unchanged CNAME guidance for a subdomain |
| R3 | `static/__tests__/stages.test.ts` | both status matrices **cell by cell** — one case per row of each table, asserting all seven (AWS) / five (GCP) statuses, not just which stage is current; every state including `failed` / `timed_out`; owner labels; that GCP never emits a validation-record stage; that `awaiting_dns` + `status !== "active"` yields stage (c) while `awaiting_dns` + `status === "active"` yields stage (e) **with the same `attach_started_at`**, proving the discriminator is `status` alone; and **specifically the non-monotonic row — `awaiting_dns` + `status === "active"` gives (e) `current` *and* (f) `done`** |
| R2.10 | `static/__tests__/aws.test.ts` (extended) | a reconcile run against a row that already carries an issued `provider_ref` makes **no** `RequestCertificate` call — the guard that makes overlap with a user click harmless |
| R3 resume | `domains/__tests__/routes-resume.test.ts` | all six edge-case rows: `404` unknown domain; `409` non-static project with nothing enqueued; no-cert-row → enqueue only; non-terminal row → enqueue with no state write; `live` → enqueue with no state write; `timed_out` → reset to `pending` + enqueue; **`blocker` set → `200`, no state write, job enqueued, `message` equal to the blocker text**. Every `200` response validates against `resumeDomainResponseSchema` and carries a `verificationState` |
| R7.7 | `shared/http/__tests__/app-hardening.test.ts` (extended) | `/readyz` → `degraded` + `pendingMigrations` when the ledger lags; `ready` when it does not; `/healthz` body still byte-identical |
| R5 | `shared/database/__tests__/migration-manifest.test.ts` | the manifest matches `supabase/migrations/` on disk |
| R7.9 | CI | `pnpm backend:typecheck`, `pnpm test`, `cd frontend && pnpm lint` |

**Frontend.** The stage model is backend-computed, so the component has little logic to test; `DomainAttachment.tsx` is covered by lint + typecheck plus a manual accessibility pass (keyboard traversal, the `aria-live` announcement, and a colour-blind check that every status reads correctly without hue). No new frontend test harness is introduced.

**Integration-only, not faked (R7.10):** real ACM issuance timing, real CloudFront propagation, a real TLS handshake on the custom domain, real Google-managed certificate provisioning, and the actual application of a migration. The attachment is not "done" until one real domain goes live on each cloud; a mocked suite cannot know any of this and must not pretend to.

## Invariants and who owns them

| Invariant | Enforced by | Why there |
|---|---|---|
| One platform-owned certificate row per `(project, domain)` | `idx_ssl_certificates_static_unique` (DB) | concurrency is the threat; only the database can win that race |
| One ACM certificate per project domain set | `findAdoptableCertificate` + the ARN on the row (application) | ACM has no uniqueness concept; the tag scan is the only available guard |
| A domain name is stored normalized | route layer (`validateDomainName`) | normalizing deeper would mean every reader re-normalizing; `normalizeHost` at comparison sites stays as defence in depth |
| An apex domain on AWS is only accepted with an acknowledgement | route layer (UX) **and** `reconcileAwsStaticDomains` (invariant) | the route owns the conversation; the reconcile owns correctness for rows created by any other path |
| No job blocks on a CDN update | `updateStackDomainParameters` returning on acceptance + the sweep observing later | `AGENTS.md`; `config-apply` expires in 300 s and a distribution update takes 5-20 min |
| An inconclusive DNS check never produces a user-action state on an apex | `reconcileAwsStaticDomains`, on the `attaching` → done transition | `verifyFlattenedAlias` is documented as unable to decide; turning "unknown" into "you must act" strands the one configuration D1 enables |
| A deadline clock is read through a fallback chain, never raw | the sweep, via `certDeadlineMs`'s named clock | `isPastCertDeadline(null)` is `false`, so a null clock disables its deadline silently and the row polls forever |
| Only a `retryable: false` failure may write `failed` | both reconcilers, at every `!ok` write | `failed` is terminal and leaves the partial index, so a transient error written there strands the attachment until a manual Resume |
| **And: a `retryable: false` failure always writes `failed`, with its message, onto every row the reconcile holds** | both reconcilers, at every `!ok` return that holds rows (`aws.ts:163-165` is the one that writes nothing today) | the converse of the row above, and the other half of the same bug: a permanent failure that writes nothing leaves the row in a non-terminal state with no explanation, where the sweep re-attempts the same denied provider call indefinitely |
| The phase clock advances only on a phase transition | `certs.ts` (`setCertState` compares against the persisted state) + both reconcilers passing it | a clock re-stamped on every look never ages, which silently disables every deadline and backoff tier |
| A provider-imposed budget is never reset by a phase change | `certDeadlineMs` naming `created_at` / `issued_at` for those rows, plus write-once `issued_at` in both reconcilers | an oscillating state, or a re-stamped `issued_at`, would otherwise restart ACM's 72-hour window forever |
| The poll cadence is deferred by exactly one writer | the sweep's `touchCertPolled` before enqueue | a reconcile that fails before writing must still have deferred the next look |
| A permanent failure never consumes a pg-boss retry | `isRetryableFailure` reading the structured flag | the job layer is where retries are spent |
| `verification_state` only ever holds one of the seven `0075` values | the DB CHECK, plus `CertVerificationState` in TypeScript | the CHECK is authoritative; the type keeps the mistake from compiling |

## Files touched

| File | Change |
|---|---|
| `backend/src/services/domains/schemas.ts` | relax `createDomainBodySchema` regex; add `apexAliasAck` to the body; add `warning` to `domainSchema`; add `retryable` to `applyDomainResponseSchema`; new `domainAttachmentResponseSchema`, `attachmentStageSchema`, `resumeDomainResponseSchema` |
| `backend/src/services/domains/domain/validation.ts` | **new** — pure `validateDomainName` (rules 1-11, wildcard rejected, punycode accepted) |
| `backend/src/services/domains/domain/apex-ack.ts` | **new** — `appendApexAck` / `removeApexAck` / `isApexAcked` over `projects.settings` |
| `backend/src/services/domains/domain/static/cloud.ts` | **new** — `resolveStaticCloud` → `{ cloud, routeTarget, apexAliasAck }` (DB only, **two reads**: `lookupActiveDeployment` plus `projects.select("settings")`, with opposite failure rules — `cloud` fails open, `apexAliasAck` fails to `[]`) |
| `backend/src/services/domains/domain/static/failures.ts` | **new** — `StaticFailure`, `classifyDbError`, `classifyAwsError` |
| `backend/src/services/domains/domain/static/deadlines.ts` | **new** — `certDeadlineMs(cloud, state, status)`, `pollIntervalMs(cloud, state, status, phaseAgeMs)` (D2 tables), both **exhaustive over the nine (cloud, state) pairs the sweep admits** with `assertNever` on the default; **`CERT_DEADLINE_MS` moves here from `aws.ts:45` and is exported**. Imports nothing from `aws.ts` — the dependency runs one way so this module stays pure |
| `backend/src/services/domains/domain/static/stages.ts` | **new** — pure `buildAwsStages` / `buildGcpStages` |
| `backend/src/services/domains/domain/static/poll-sweep.ts` | **new** — DB-only sweep: deadlines + per-project enqueue |
| `backend/src/services/domains/domain/static/target-cache.ts` | **new** — 60 s read-side memo of `resolveStaticTarget` |
| `backend/src/services/domains/domain/static/certs.ts` | result types; `listCertRowsForPoll`; `touchCertPolled`; `created_at` / `issued_at` / `updated_at` added to `SELECT_COLUMNS` and `StaticCertRow`; `setCertState` stamps `attach_started_at` only on a state change; four `warn` → `error` with raw errors |
| `backend/src/services/domains/domain/static/aws.ts` | apex ack; `apexRefusalMessage(host, "persisted")` at **both** existing call sites — the backstop (`:104`) and the detach branch (`:125`, whose output is an apply-response `apexNote`); schema-drift + IAM messages via `classifyAwsError`; **a retryable attach failure writes only `verification_message`, never `failed`**; **the `!cert.ok` return at `:163-165` stops being state-less — it writes the classified message onto every held row, plus `verificationState: "failed"` when `retryable === false`** (this is what keeps a denied `RequestCertificate` out of the `pending` tier); `CERT_DEADLINE_MS` imported from `./deadlines.js` instead of declared at `:45`; phase clock stamped only on a state change; **`issued_at` written once (`:173-178` currently re-stamps it on every reconcile)**; `awaiting_dns` vs `provisioning` from a bare `resolveCname` on the validation record; `attaching` → `live` gated on `verifyRoutingRecordAws`'s outcome, with an **inconclusive** result on an apex resolving to `live` rather than `awaiting_dns`; `isPastCertDeadline` gains a **third** parameter (`deadlineMs`, after `now`) |
| `backend/src/services/domains/domain/static/gcp.ts` | result types from `certs.ts`; skip orphan cleanup on a failed list; schema-drift message; **`attachStartedAt: nowIso()` at `:234` becomes conditional on a state change** (a behaviour change, not a formalisation); `issuedAt` written once rather than on every active reconcile; a retryable failure never writes `failed`, **and a non-retryable one always does — every `!ok` return that holds rows writes its classified message onto them** |
| `backend/src/services/domains/domain/static/index.ts` | propagate `retryable`; **new exported pure `verifyRoutingRecordAws(host, distributionDomain): Promise<RoutingCheck>`** carved out of `:113-155`, four-valued (`verified` / `inconclusive` / `missing` / `mismatched`) with `serverIp` on every variant, `verifyFlattenedAlias` as the `inconclusive`-vs-`verified` fallback, called by both `verifyDomainDnsStatic` (which maps it back to its existing boolean shape) and the AWS reconcile; **new `missingRoutingRecordMessage(host, expected)`** used by *both* negative CNAME branches (`:133-137` and `:168-180`) for apex-aware guidance; `buildAttachmentView` for the new endpoint |
| `backend/src/services/domains/domain/static/apex.ts` | `apexRefusalMessage(host, surface)` — four alternatives, with `"add-form"` and `"persisted"` variants differing only in the acknowledgement clause |
| `backend/src/services/domains/domain/applier.ts` | `ApplyDomainsResult.retryable`; attachment-view dispatch (`supported: false` for Dokploy/VPS) |
| `backend/src/services/domains/domain/domains.ts` | duplicate pre-check; clearer `23505` message; prune the apex ack on delete |
| `backend/src/services/domains/domain/worker.ts` | `isRetryableFailure` reads the structured flag |
| `backend/src/shared/http/error-handler.ts` | the `bad_request` arm serialises `error.metadata.clientCode` as an additive `code` field; payload unchanged when absent. No change to `shared/supabase/errors.ts` — `metadata` already exists |
| `backend/src/services/domains/routes.ts` | validation + apex policy + ack write + advisory in `POST /domains`; new `GET /domains/attachment`; new `POST /domains/:domainId/resume` returning `resumeDomainResponseSchema`, with `preHandler: [app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" })]` in that order; ack prune on `DELETE`. **No new key extractor is added to `shared/http/rate-limit.ts`** |
| `backend/src/shared/database/queue.ts` | add `CERT_POLL_QUEUE` |
| `backend/src/shared/workers/cert-poll.ts` | **new** — `createWorker` + `registerCertPollWorker()`, which calls `register()` (creating the queue) and only then `scheduleCertPollSweep()`, which takes the `PgBoss` handle from `getQueue()` (`queue.ts:31`) and passes `{ key, singletonKey }` |
| `backend/src/shared/database/migration-manifest.ts` | **new, generated** — `MIGRATION_VERSIONS` |
| `backend/src/shared/database/migration-state.ts` | **new** — cached, fail-open ledger comparison |
| `backend/src/scripts/generate-migration-manifest.ts` | **new** — manifest generator |
| `backend/src/app.ts` | `/readyz` reports `migrations` / `pendingMigrations`; `/healthz` untouched |
| `backend/src/run-server.ts` | one `workerRegistry` entry under `services: ["domains"]` whose `register` is `registerCertPollWorker`; **no `onStartup` hook** — the hook order is `onStartup` then `register` (`:128-131`), and the schedule needs the queue row to exist first |
| `backend/package.json` | `migrations:manifest` script |
| `frontend/src/services/domains.ts` | `attachment()`, `resume()`; `apexAliasAck` on `createDomain` |
| `frontend/src/pages/ProjectDetail/sections/DomainAttachment.tsx` | **new** — the staged view |
| `frontend/src/pages/ProjectDetail/sections/DnsRecordCard.tsx` | **new** — extracted record card, shared with `DomainRow` |
| `frontend/src/pages/ProjectDetail/sections/ProjectDomainsTab.tsx` | render the attachment card; `Sync now` → `Check now` inside it; field-level add errors; advisory banner; apex checkbox rendered from the `apex_requires_ack` error code (pre-emptively when `cloud === "aws"`); `DomainRow`'s instructions panel keeps the existing per-domain endpoint |
| `frontend/src/types/` | `DomainAttachment`, `AttachmentStage` |
| `docs/operations/aws-static-hosting-iam.md` | the five edits in Item 6 |
| `AGENTS.md` | amend the apex sentence per D1; note the widened meaning of `attach_started_at` |

**No new migration.** `0075` already carries every column and both indexes this design uses; the apex acknowledgement lives in the existing `projects.settings` JSONB; the phase clock reuses `attach_started_at`. NFR2 holds.

## Recommended follow-up (NOT planned work)

**The ACM certificate leak.** Nothing in `backend/src` calls `acm:DeleteCertificate`. A changed domain set requests a new certificate (`aws.ts:255-259`) and removing a domain deletes only the database row (`certs.ts:181-197`), so unused `PENDING_VALIDATION` certificates accumulate in `us-east-1` until the account hits its ACM quota — at which point `aws.ts:323-331` tells the user to clean up by hand. R6.8 documents the consequence; this design does not fix it.

**Is it nearly free alongside Item 2's poller? Partly — and the honest answer is "cheaper than before, not free."** The hard part of a cleanup has always been ordering and observation: ACM refuses to delete a certificate a distribution is using, so the alias must come off first and the distribution needs 5-20 minutes to finish before the delete can succeed. The sweep is exactly the "start it, observe it later" scaffolding that makes that tractable, and it already visits every project with in-flight certificate work. What is still needed beyond the sweep:

- `acm:DeleteCertificate` added to R6's policy (a user-visible IAM change, so it cannot ride along silently).
- a way to find the superseded ARN after the swap — the old value is overwritten on the row, so discovery has to go through `ListCertificates` + `ListTagsForCertificate` filtered to this project and excluding the current ARN. Both permissions already exist.
- an age guard, so a certificate created seconds ago by a concurrent apply is never deleted.

**Sizing: roughly half a day of implementation plus a day of careful verification against a live account**, because the failure mode of getting it wrong is deleting a certificate that is serving traffic. Recommendation: do it as its own small spec after this one ships, when the sweep is proven in production. Flagged for the user to decide — it is not in the five approved items.

## Risks and what could not be verified here

- **`PgBoss.schedule` behaviour under split services.** The typings confirm the API and that a schedule's identity is `(name, key)` — hence the explicit `key: "cert-poll-sweep"` in *Registration* — so repeated installation of the same pair is an upsert. Whether two instances of the `domains` service produce exactly one sweep per interval (rather than one each) was **not verified against a running pg-boss**. If it fans out, the consequence is bounded rather than harmful, through two separate mechanisms: the schedule's `singletonKey` collapses two sweep *jobs* landing in the same minute, and if one still slips through, two sweeps both read the same candidates, both find the same rows due, and both enqueue `domain-apply` for the same projects — where that job's own `singletonKey` collapses them, because the second enqueue happens while the first job is still queued. The reconcile's own guards (the unique index, the ARN on the row, `*_IN_PROGRESS` as transient) cover the case where it does not. Worth checking on the first deploy; not worth pre-engineering.
- **The `provisioning` heuristic.** Resolving the validation record's own name to infer "AWS can see it" is sound (and is the only signal available), but a split-horizon or aggressively caching resolver on the backend host could report it visible before AWS sees it, or vice versa. The consequence is a stage label that is briefly optimistic, not a stuck attachment.
- **Supabase ledger table name and permissions.** `supabase_migrations.schema_migrations` was read successfully during the investigation using `MIGRATE_URL`. Whether the **runtime** `DATABASE_URL` role can read it was **not verified** — if it cannot, R5 reports `unknown` and fails open, which is by design, but it would make the check useless in production and needs confirming on the first deploy.
- **ACM's 72-hour discard.** Taken from AWS's documented behaviour for `PENDING_VALIDATION` certificates and used to set the AWS `awaiting_dns` deadline. Not observed in this account.
- **Rows mid-flight at ship time carry clocks written under the old rules.** Because `attach_started_at` and `issued_at` are re-stamped on every reconcile today, an existing non-terminal row's clocks read "a few minutes ago" regardless of how long it has actually been waiting. The first sweep therefore starts those rows' budgets effectively from the deploy, not from the original request — they get one extra full deadline. That is the forgiving direction (no row is timed out on arrival) and it self-corrects after one phase transition, so no backfill migration is proposed. NFR5 holds: nothing needs manual repair.
- **Whether the live `dockier-dev` policy matches the merged policy** for CloudFront and CloudFormation. The IAM report flags this: a redeploy with *empty* alias parameters does not prove `UpdateDistribution` is granted *with* aliases. The first successful attach is the proof.
- **Whether the Supabase CLI records the bare numeric prefix as the ledger `version`.** The cert-state report shows the ledger topping out at `0073` for the file `0073_*.sql`, which is consistent with the `/^(\d+)_/` extraction in Item 5, but the full-filename-vs-prefix question was not re-derived. The manifest-vs-disk CI test catches drift against the *directory*, not against the *ledger format*, so a mismatch would show up as "every migration pending" on the first deploy. Confirm alongside the `DATABASE_URL` grant above; if the ledger stores full filenames, the extraction becomes a prefix match and nothing else changes.

## Responses to the design review (2026-10-06, CHANGES_REQUESTED: 1 HIGH, 8 MEDIUM, 4 NIT)

All thirteen findings are **addressed**; none is backlogged or rejected. Two are addressed in a way that deviates slightly from the suggested fix, noted below.

| # | Severity | Resolution |
|---|---|---|
| 1 | HIGH | **Addressed.** `status` added to `CertSnapshot` (it is already in `certs.ts`'s `SELECT_COLUMNS` and on `StaticCertRow`, so nothing new is queried). One discriminator now governs all three places: stage (c) is `awaiting_dns && status !== "active"`, stage (e) is `awaiting_dns && status === "active"`. The `attach_started_at` wording is deleted from the stage table and explicitly disclaimed as a discriminator. The D2 deadline table and the D2 cadence table are both split on the same `status` test, with a routing-record message and an explicit "no new certificate is requested on resume" for the post-attach row. `pollIntervalMs` and `certDeadlineMs` gained a `status` parameter to carry it. |
| 2 | MEDIUM | **Addressed.** A new *due-ness predicate* subsection states `phaseStart = attach_started_at ?? created_at`, `lastSeen = updated_at`, `due = (now - lastSeen) >= pollIntervalMs(...)`, and says plainly that the phase age only selects the table row. The cron becomes `* * * * *` (the reviewer's first option) so the 1-minute `pending` cadence is deliverable; the two "every two minutes" claims elsewhere were corrected to match. |
| 3 | MEDIUM | **Addressed.** `deadlineMs` moves to position **three** with `CERT_DEADLINE_MS` as its default: `isPastCertDeadline(startedAtIso, now = Date.now(), deadlineMs = CERT_DEADLINE_MS)`. The three existing test cases pass unchanged because they use the two-argument form; the design now says the file is *extended with new cases* rather than untouched. |
| 4 | MEDIUM | **Addressed, reviewer's option (a).** The paragraph is rewritten: overlap between a sweep and a user click **is** possible, because `enqueue(input, singletonKey)` (`queue.ts:226-234`) exposes no `singletonSeconds` and pg-boss de-duplicates only queued jobs. R2.10's real guards are named individually — the partial unique index for rows, the persisted ARN plus `findAdoptableCertificate` for certificates, `*_IN_PROGRESS`-as-transient for stack updates. Option (b) is recorded as a rejected alternative with the reason (`singletonSeconds` would change the enqueue contract for `network-apply` and `certificate-issue`, which share the worker; an advisory lock adds a crashed-holder failure mode) and with the advisory lock named as the cheaper option if production shows contention. |
| 5 | MEDIUM | **Addressed.** The gate is `body.apexAliasAck === true \|\| settings.apexAliasAck?.includes(normalized)`, so a first add can succeed. Persistence is fully specified: a single `appendApexAck` helper, appended **before** `createDomain` with the reason, re-read-inside-the-call merge reusing `updateProject`'s existing shape, the clobber window named with `jsonb_set` as the deferred mitigation and why it is deferred, and a failed append failing the add. **Deviation from the reviewer's "state it is intended and unbounded":** stale entries are now **pruned on domain delete** instead, because an unpruned list silently re-acknowledges a re-added apex and suppresses the explanation the feature exists to give. |
| 6 | MEDIUM | **Addressed.** The discriminator rides in `DomainError`'s **existing** `metadata` argument as `clientCode: "apex_requires_ack"` (no error-class change; `DomainError` is `(message, code, cause?, metadata?)`), and the shared handler's `bad_request` arm serialises it as an additive `code` field with a payload byte-identical to today's when absent. The checkbox renders from that code on the last failed add — the guarantee — with the `cloud === "aws"` pre-emptive render kept only as an optimisation. The design now spells out why the `cloud`-gated version fails exactly when it is needed (no `cloud` when `supported: false` or the CDN is unresolvable, which is also when `resolveStaticCloud` fails open). |
| 7 | MEDIUM | **Addressed, no deviation from R1.7.** *(One claim in this row was later found false and corrected by the fourth review — see F2 below: `resolveStaticCloud` performs **two** reads, because `lookupActiveDeployment` loads no project row.)* `resolveStaticCloud` now returns `routeTarget` (`infra.distributionDomain` / `infra.cdnIp`) from the deployment row it already reads, and the advisory is suppressed when the resolved CNAME or A answer matches it — so the incident's own path (routing record published first) raises nothing. The message is also reworded to be true in every case it still fires, and the one remaining imprecision (an ALIAS-flattened AWS apex resolving to CloudFront edge IPs) is stated rather than hidden. |
| 8 | MEDIUM | **Addressed.** The `*` exception is removed from rule 9 and a dedicated rule 11 rejects wildcards with the reviewer's message, evaluated before rule 9 so the specific message wins. The design records why a wildcard is a feature rather than a regex exception, and notes that the existing `domains.wildcard` column stays a legacy-VPS/certbot concern that nothing here starts reading. |
| 9 | MEDIUM | **Addressed, reviewer's first option.** Rule 10 relaxes to `/^(?:[a-z]{2,}\|xn--[a-z0-9-]{2,})$/`; punycode is accepted **as-is with no conversion**, which keeps IDN *input* out of scope while making the two rules consistent. |
| 10 | NIT | **Addressed.** `listCertRowsForPoll` everywhere; the diagram's `listPollCandidates` is gone. |
| 11 | NIT | **Addressed.** `GET /domains/:domainId/dns-instructions` is explicitly **retained**, with its consumer named (`DomainRow`'s instructions panel) and the note that both surfaces go through the same builders, so `DnsRecordCard` cannot drift. |
| 12 | NIT | **Addressed.** `timed_out` joins `provisioning` in one sentence in both the Overview and Item 2, with D2's deadlines named as its first writer; the Item 2 heading is now *Newly reachable AWS states*. |
| 13 | NIT | **Addressed.** A five-row table covers unknown domain (`404`), non-static project (`409`, nothing enqueued), no certificate row (`200`, enqueue only), already-active row (`200`, no state write, idempotent enqueue), and `live`. One rule summarises it: only `timed_out` / `failed` are reset to `pending`; everything else is re-enqueued untouched. A `routes-resume.test.ts` row is added to the test table. |

No finding changed a requirement, and no requirement is now unsatisfied. Both sign-off items (**D1**, **D2**) remain open and unchanged in substance — D1 gained its persistence and gating detail, D2 gained its predicate, its split `awaiting_dns` rows and a corrected concurrency story, but the recommendations themselves (refuse-by-default with a confirmed override; one cron sweep with per-state cadence and per-cloud deadlines) are the same ones put forward for sign-off.

## Responses to the second design review (2026-10-06, CHANGES_REQUESTED: 2 HIGH, 5 MEDIUM, 2 NIT)

All nine findings are **addressed**; none is backlogged or rejected. Every claim the review disputed was re-read in source before changing the design, and all nine were confirmed. The two HIGH findings shared one root cause worth stating plainly: **Item 2 converts code that ran once per user click into code that runs every few minutes, and two of the reconcilers' existing write behaviours are only safe when run once.** That is now called out as its own subsection rather than left as an assumption.

| # | Severity | Resolution |
|---|---|---|
| 1 | HIGH | **Addressed.** Confirmed in source: `aws.ts:200-209` writes `verificationState: "failed"` for any `attach.ok === false`, and `aws.ts:515-523` returns `retryable: true` for `/_IN_PROGRESS\|is in .* state and can not be updated/`. A new Item 2 subsection, *A transient attach failure is not a terminal state*, states the rule (**only `retryable: false` may write `failed`**), shows the corrected write, and explains why the sweep is unsafe without it. The Item 4 error table row was rewritten from the false "row stays `attaching`" to "only `verification_message` is written — this is a required change". The D2 concurrency bullet now says the third guard **does not hold** without this fix. Added to the Invariants table, to the `aws.ts` and `gcp.ts` rows of *Files touched*, and to `aws.test.ts` as the reviewer's exact assertion. |
| 2 | HIGH | **Addressed.** Confirmed in source: `gcp.ts:234` writes `attachStartedAt: nowIso()` unconditionally on every row write. *The phase clock* is rewritten with the invariant stated as a block quote — the clock is written **iff** the state being written differs from the persisted one — and the words "formalises what that branch does" are deleted and replaced with an explicit statement that this is a behaviour change on **both** clouds, including the consequence of getting it wrong (every deadline and the two upper backoff tiers unreachable, `isPastCertDeadline` never true). Mechanism specified: `setCertState` receives the persisted state and stamps only on a difference. Added to the Invariants table, listed as a change in both reconcilers' *Files touched* rows, and tested on both the AWS `attaching` write and an unchanged GCP `provisioning` row. |
| 3 | MEDIUM | **Addressed, reviewer's fix adopted verbatim.** Confirmed in source: `run-server.ts:128-131` is `if (worker.onStartup) await worker.onStartup(); await worker.register();`, and the queue row is created inside `register()` (`queue.ts:~186`). The *Registration* paragraph now says the schedule is installed by `registerCertPollWorker`, immediately after `register()`, and that the registry entry has **no `onStartup` hook at all**. Also specified: a `scheduleCertPollSweep` failure is logged at `error` and does not take the process down, because the degraded outcome (manual "Check now") is today's behaviour while a thrown startup is an outage. |
| 4 | MEDIUM | **Addressed, reviewer's signature adopted.** Confirmed: `verifyDomainDnsStatic` takes an `ActiveDeployment` and calls `resolveStaticTarget` first (`index.ts:91-99`), which does STS `GetCallerIdentity` and may do `DescribeStacks` (`target.ts:103-155`). The false "pure `node:dns`, no AWS call" claim is replaced with the extraction of `verifyRoutingRecordAws(host, distributionDomain)` from `index.ts:113-155`, keeping `verifyFlattenedAlias` as its internal fallback and called by both `verifyDomainDnsStatic` and the reconcile. The `provisioning` heuristic is likewise specified to use a bare `dns.resolveCname`, not the wrapper. Added to the `index.ts` row of *Files touched*. |
| 5 | MEDIUM | **Addressed, reviewer's wording adopted.** A new paragraph in *The due-ness predicate* names the sweep as the **only** writer of the poll clock: `touchCertPolled(id)` for every due row, **before** the enqueue, with the reconcile's own writes explicitly never relied on for cadence — and the four reconcile paths that return without writing (deadline, throw, schema drift, unresolvable target) named as the reason. The shape diagram was corrected to match. The test row asserts a due row whose enqueue throws is still touched, and that a not-due row is not. |
| 6 | MEDIUM | **Addressed, reviewer's clock split adopted — and it surfaced a second re-stamping bug the reviewer did not name.** `aws.ts:173-178` writes `issuedAt: cert.issued ? nowIso() : undefined` on **every** reconcile of an issued certificate (the GCP twin likewise), so the `issued_at`-based deadline would have been as unreachable as the phase clock. `issued_at` is now specified as write-once (`cert.issued && row.issuedAt === null`), stated in the clock section, the Invariants table and both reconcilers' *Files touched* rows. Beyond that: The false "the 72 h clock keeps running underneath" is deleted. A new *Which clock feeds which deadline* subsection carries a seven-row table: `attach_started_at` for the backoff tiers, AWS `attaching` (90 min), AWS `provisioning` (2 h) and GCP `provisioning` (24 h); **`created_at`** for both pre-issuance 72 h budgets; **`issued_at`** for the post-attach routing wait. The oscillation scenario is described as the reason. `certDeadlineMs` now returns `{ ms, clock, terminal }` and the sweep passes the named timestamp into `isPastCertDeadline`, so clock selection is one pure table and the deadline primitive stays a two-timestamp comparison. Verified `created_at` and `issued_at` both exist on `ssl_certificates` (`0050`) and are already written — so NFR2 holds; they are added to `SELECT_COLUMNS` and `StaticCertRow`, which previously dropped them. |
| 7 | MEDIUM | **Addressed, reviewer's signature adopted.** `apexRefusalMessage(host, surface: "add-form" \| "persisted")`, with both variants written out in full. They share every clause except the acknowledgement one, so the explanation cannot drift; the persisted variant tells the user to remove and re-add the domain confirming on the form. Named in the `apex.ts` and `aws.ts` rows of *Files touched*, with a test asserting the persisted variant mentions no checkbox. |
| 8 | NIT | **Addressed, reviewer's cleaner option.** Both negative branches are now cited (`index.ts:133-137` and `:168-180`) and both are fed by **one** helper, `missingRoutingRecordMessage(host, expected)`, extracted alongside `verifyRoutingRecordAws`. The distinct "yet"/propagation wording is kept as a parameter so neither existing message regresses. A test asserts apex-aware guidance from both branches. |
| 9 | NIT | **Addressed.** The D1 snippet uses `DomainsError` throughout, its comment now says `DomainsError extends DomainError`, and a short paragraph states that this service's union is exactly `not_found \| bad_request \| conflict \| internal` — so there is no `precondition_failed` and the resume endpoint's 409 is `"conflict"`. |

**What did not change.** No requirement was renegotiated, no finding was deferred, and the two sign-off items are substantively the same: **D1** is still refuse-by-default with a confirmed override (it gained the two-surface message), and **D2** is still one cron sweep with per-state cadence and per-cloud deadlines (it gained the clock split, the conditional phase-clock invariant, the single poll-clock writer, and the corrected cron installation point). Neither the stack, the per-cloud scope matrix, nor the "no new migration" position moved.

## Responses to the third design review (2026-10-06, CHANGES_REQUESTED: 1 HIGH, 4 MEDIUM, 6 NIT)

All eleven findings are **addressed**; none is backlogged or rejected. Every disputed claim was re-read in source before the design changed, and all eleven were confirmed — including the two the review flagged as factual contradictions (`verifyFlattenedAlias`'s deliberate `null` at `static/index.ts:220-247`, and `ScheduleOptions = SendOptions & { tz?, key? }` at pg-boss `dist/types.d.ts:235-238` with `schedule(name, cron, data?, options?)` at `dist/index.d.ts:71`).

The HIGH finding and two of the MEDIUMs share one root cause worth naming, because it is the same shape as the previous review's: **a three-valued or nullable source of truth was being read as if it were two-valued or total.** `verifyFlattenedAlias`'s `null` is "cannot decide", not "no"; `issued_at` is nullable, not always present; and `StageStatus` has four values, not one plus "everything else". Each collapse produced a path where a correctly-configured attachment ends up telling the user to fix something that is already right — which is the single failure class this spec exists to delete.

| # | Severity | Resolution |
|---|---|---|
| 1 | HIGH | **Addressed, reviewer's fix adopted with one addition.** Confirmed in source: `verifyFlattenedAlias` (`static/index.ts:220-247`) returns `null` on a miss and its header comment states the reason; `AGENTS.md` records the fallback as deliberate. `verifyRoutingRecordAws` now returns a four-variant `RoutingCheck` (`verified` / `inconclusive` / `missing` / `mismatched`) instead of a boolean, and the `attaching` → done transition is specified as a four-row table: `verified` → `live`; **`inconclusive` + `isApexDomain(host)` → `live` with the caveat message, never `awaiting_dns`**; `inconclusive` + non-apex → treated as `missing`; `missing`/`mismatched` → post-attach `awaiting_dns`. The same rule is stated in D1's *Consequences to carry out* as its own first bullet, so D1 and Item 2 cannot drift. The addition the reviewer did not ask for: the asymmetry argument is written down (an optimistic `live` is visible and self-correcting; a false `awaiting_dns` is a permanent dead end), so the rule reads as a decision rather than a special case. Tests: the acked-apex-reaches-`live` row, plus the non-apex `inconclusive` and `mismatched` counter-cases. |
| 2 | MEDIUM | **Addressed, reviewer's matrix adopted verbatim and mirrored for GCP.** Confirmed: `aws.ts:173` writes `status` and `verificationState` in the same `setCertState` call, so `awaiting_dns` + `active` is only reachable after the attach has run. "Current when" is gone from both stage tables; each is now followed by a full per-state × per-stage status matrix — seven columns for AWS, five for GCP. The `awaiting_dns` + `status = 'active'` row carries (e) `current` and (f) `done` and is called out as **the only non-monotonic row in either cloud**, with the reason ((f) really has finished). GCP is stated to be fully monotonic and *why* — no post-attach wait exists there, which is also the reason the two clouds keep separate builders. The terminal row's treatment of (a)/(b) is specified rather than left to R3.9. Test row rewritten to assert the matrices cell by cell and that row specifically. |
| 3 | MEDIUM | **Addressed, reviewer's chain adopted verbatim.** Confirmed: `isPastCertDeadline(null, …)` returns `false` (`aws.ts:537-541`, asserted at `aws.test.ts:592`), and `issued_at` is written by the non-fatal `setCertState`. A new paragraph under *Which clock feeds which deadline* states the chain for all three clocks — `phase → attach_started_at ?? created_at`, `issued → issued_at ?? attach_started_at ?? created_at`, `created → created_at` (`NOT NULL` since `0050`, terminating every chain) — and adds the argument that the chains are conservative in the right direction, since `created_at` is always the earliest clock, so a fallback can only make a deadline fire sooner. The sweep test row gains the reviewer's exact case plus the null-`attach_started_at` companions. |
| 4 | MEDIUM | **Addressed, all three parts, reviewer's values adopted.** `resumeDomainResponseSchema { success, message, verificationState }` is specified (reusing the existing `certVerificationStateSchema`) with the reason it is not a bare `204` — the attachment card re-derives its stages from `verificationState` without waiting for the 20 s poll. A rate limit is specified, with the `AGENTS.md` deploy-hook precedent named for why the number is stated at all. *(The limiter call itself was written against a non-existent option and a non-existent keying, and the "matches the apply route" precedent was false — all three corrected by the fourth review, see F3: it is `tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" })`.)* The edge-case table gains a **sixth row** for the R3.13 `blocker` case: `200`, no state write, job still enqueued (harmless and self-correcting), `message` carrying the blocker text verbatim — and an explicit note on why it is not a `409`. Both the `schemas.ts` and `routes.ts` rows of *Files touched* and the resume test row were updated. |
| 5 | MEDIUM | **Addressed, reviewer's snippet adopted verbatim.** Confirmed in pg-boss 12.18.2 as cited. *Registration* now passes `{ key: CERT_POLL_SCHEDULE_KEY, singletonKey: CERT_POLL_SCHEDULE_KEY }` and states which option does what: identity is `(name, key)`, so `key` is what makes repeated installation an upsert, while `singletonKey` only collapses two sweep jobs landing in the same minute. `getQueue()` (`queue.ts:31`) is named as the accessor, with a snippet showing the `null` guard for the no-`DATABASE_URL` case. The *Shape* diagram no longer names an option list at all and points at *Registration* instead, and the *Risks* bullet was rewritten to describe both collapse mechanisms rather than conflating them. |
| 6 | NIT | **Addressed, reviewer's first option.** The wildcard rule moves to position **9**; charset becomes 10 and the TLD rule 11. Table order and evaluation order now agree, and the lead-in's "applied in this order" needs no exception clause. The three downstream references (the punycode paragraph's two, and the test table's) were renumbered, and the test row gained an assertion that `*.example.com` yields the wildcard message rather than the charset one, which is what makes the ordering observable. |
| 7 | NIT | **Addressed, reviewer's cheaper option** — *but with one false claim, corrected by the fourth review (F2): `apexAliasAck` does **not** come free out of the deployment lookup, and the add flow performs two reads, not one.* `resolveStaticCloud` returns `{ cloud, routeTarget, apexAliasAck }`, with the declared signature written out. The flow diagram and the D1 predicate snippet both read the returned value, and the fail-open paragraph was corrected to describe the new shape (`cloud: null`, `apexAliasAck: []`) rather than a bare `null` return. |
| 8 | NIT | **Addressed, reviewer's line adopted verbatim**, in the *Shape* diagram where the per-row loop begins, with the one-line justification that the mapping is total because the query's own `type IN ('acm','gcp_managed')` filter guarantees it — so no third branch and no fallback. A sweep test asserts it for both types. |
| 9 | NIT | **Addressed, reviewer's first option.** Confirmed: every return path in `static/index.ts:113-155` includes `serverIp: expected`. `serverIp` is now on **all four** `RoutingCheck` variants rather than re-attached by the wrapper, so `verifyDomainDnsStatic` is a pure mapping and the field cannot silently vanish from one branch. The value is stated as `normalizeHost(distributionDomain)`, which is what `expected` already is. |
| 10 | NIT | **Addressed, reviewer's sentence adopted and slightly expanded.** A paragraph under *Give-up policy* states the supersession, names requirements-D2 as the authority for it, separates R2.7's binding clause (`isPastCertDeadline` gains a production caller — satisfied by the sweep) from its illustrative constant, and notes that `CERT_DEADLINE_MS` survives as the function's default third argument so no existing caller changes meaning. *(Where the constant lives was left unstated; the fourth review closed that — see F7: it moves to and is exported from `static/deadlines.ts`.)* |
| 11 | NIT | **Addressed.** A short subsection above *Index use* states that `ORDER BY updated_at ASC` is load-bearing: the longest-unlooked-at rows are always in the batch, so an installation past 200 non-terminal rows degrades to a longer effective interval for every row rather than starving any one of them — slower, never stuck — and says to raise the limit if it is ever reached. A sweep test covers the overflow case across two consecutive sweeps. |

**What did not change.** No requirement was renegotiated and nothing was deferred. **D1** remains refuse-by-default with a confirmed override — finding 1 made the override actually work rather than altering the decision — and **D2** remains one cron sweep with per-state cadence and per-cloud deadlines, now with total clock resolution and the correct schedule identity. The technology stack, the per-cloud scope matrix, the "no new migration" position, the token rules for Item 3, and the ACM-leak follow-up sizing are all unchanged. Both **D1** and **D2** are still **SIGN-OFF REQUIRED**.

## Responses to the fourth design review (2026-10-06, CHANGES_REQUESTED: 1 HIGH, 3 MEDIUM, 3 NIT)

All seven findings are **addressed**; none is backlogged or rejected. Every disputed claim was re-read in source before the design changed, and all seven were confirmed. The review's 26 *Verified Assumptions* were read first and none of them was touched.

The HIGH and two of the MEDIUMs share a root cause that is now a third instance of the same pattern earlier reviews found: **a function was treated as total over its inputs when it was not.** `pollIntervalMs` and `certDeadlineMs` had no row for three of the nine (cloud, state) pairs the sweep's own filter admits, and the `!cert.ok` branch had no state write for a whole class of failure. In both cases the missing case did not fail loudly — it resolved to the most permissive behaviour available, which is "poll forever". The fix in both places is the same shape: enumerate the domain, make the function exhaustive at compile time, and refuse to supply a lenient default.

| # | Severity | Resolution |
|---|---|---|
| F1 | HIGH | **Addressed, all three parts, reviewer's values adopted.** Confirmed in source: `aws.ts:163-165` returns `{ success: false, retryable, message }` with **no `setCertState` call**, so a denied `acm:RequestCertificate` leaves every row at `pending` with a null `verification_message`. (a) A new block in *A transient attach failure is not a terminal state* — deliberately the **same** subsection, so the two halves of the rule cannot drift — states the mirror invariant: every `!ok` return that holds rows writes its classified message onto them, plus `verificationState: "failed"` when and only when `retryable === false`. The two `!ok` returns that hold no row (the `ensureStaticCertRow` schema-drift case and the `aws.ts:126` detach branch) are named as explicitly out of scope with the reason. (b) The deadline table gains a `pending` row for **both** clouds at the reviewer's 30 minutes. **One deviation, justified:** the clock is the *phase* clock (`attach_started_at ?? created_at`), not bare `created_at` — on a first attempt the chain resolves to `created_at` so the reviewer's figure holds exactly, but a bare `created_at` budget would re-expire a **resumed** row on the very next sweep and make the Resume button useless, since resume sets `pending` and stamps a fresh phase clock. The phase-clock invariant still prevents a stuck row from pushing its own budget out. (c) The `pending` cadence escalates (1 min for the first 5 min of the phase, then 5 min) on both clouds, with the reason. Added to the Invariants table as the converse of the existing `failed` rule, to the Item 4 error table's `AccessDenied` row, to R2.11's claim (which now names both rules it depends on), to the `aws.ts` and `gcp.ts` rows of *Files touched*, and to two test rows. |
| F2 | MEDIUM | **Addressed, reviewer's query adopted verbatim.** Confirmed in source: `lookupActiveDeployment` (`shared/service-clients/deployments.ts:66-95`) issues exactly one query against `deployments` with the projection `id, provider_id, deploy_strategy, app_url, docker_image, repo, infra` — it never touches `projects` and never selects `settings`. All three "one project read" claims are corrected: *Apex policy and cloud resolution* now states and shows **two** reads (`lookupActiveDeployment` plus `supabaseAdmin.from("projects").select("settings").eq("id", projectId).eq("organization_id", tenantId).maybeSingle()`), the Item 1 flow diagram lists both queries, and the D1 snippet comment points at the subsection instead of asserting one read. The second read gets its own stated failure rule — **a failed or missing settings read yields `apexAliasAck: []`, so a previously-acked apex is refused again** (recoverable in one click; the alternative would honour a list we could not read) — written down precisely because it is the **opposite** direction from `cloud`'s fail-open rule sitting in the next paragraph. Cost is addressed rather than waved past: two indexed single-row reads, with the cheaper-looking alternatives (widening the shared lookup's projection for one caller, or a PostgREST embed) rejected on coupling. The two stale response-log rows that carried the false claim are annotated rather than quietly rewritten. A test row covers the new failure rule. |
| F3 | MEDIUM | **Addressed, reviewer's fix adopted; no new shared primitive.** Confirmed in source: `RateLimitOptions` is `{ max?, windowMs?, prefix? }` (`rate-limit.ts:27-34`) with **no `windowSeconds`**; `rateLimit` keys on `request.ip` (`:93-100`) and `tenantRateLimit` on `request.auth?.tenantId` (`:122-129`); there is no project-keyed extractor; and `grep` confirms `POST /projects/:projectId/domains/apply` has **no** rate limit, so the cited precedent was false. The limiter is now written out as `tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" })`, placed **after** `app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE)` in the preHandler array per `tenantRateLimit`'s own documented ordering requirement (and using `requireProjectPermission`, which is what this service's routes actually call). The false apply-route precedent is deleted and replaced with the real one: the deploy hook at `services/deploy/routes/git-push-webhook.ts:76`, `rateLimit({ max: 5, windowMs: 60_000, prefix: "deploy-hook" })`. **A third extractor is explicitly not added**, with the reasoning stated (tenant keying is the tighter of the two available bounds, and a new shared primitive is not warranted for an interactive button) — so nothing new is smuggled in as pre-existing. The `routes.ts` row of *Files touched* says so too. |
| F4 | MEDIUM | **Addressed, reviewer's first option — exhaustive switch, not a permissive default.** The nine (cloud, state) pairs the sweep's filter admits are enumerated, and both tables now cover all nine: the cadence table gains **GCP `attaching`** (5 min) and the deadline table gains **AWS `pending`**, **GCP `pending`** (F1) and **GCP `attaching`** (90 min). `pollIntervalMs` is declared returning a plain `number` over a four-member `PollableCertState` union with `assertNever` on the default, so adding a state to the sweep's filter without a cadence is a compile error; `certDeadlineMs` is exhaustive on the same union. The choice of a `never` default over "fall back to 15 minutes" is argued rather than asserted: a lenient default is precisely what turned F1's state-less row into a permanent per-minute poll. `null`'s meaning is pinned to one thing — "poll on the cadence, never time out", with the deadline comparison skipped entirely and **never** a fallback to `CERT_DEADLINE_MS` — and it is noted that after this revision no input produces it, the type being kept for a future "cadence only" pair. A row whose persisted state falls outside the union is **skipped with an `error` log naming the pair**, never polled on a guess. It is stated that GCP never writes `attaching` today (verified: `gcp.ts:216-223` writes only `live` / `failed` / `awaiting_dns` / `provisioning`) and that the sweep's filter does not know that, which is why the pair is given values anyway. `poll-sweep.test.ts` gains the unlisted-pair case and a stubbed-`null` case. |
| F5 | NIT | **Addressed, reviewer's assignment adopted.** Confirmed in source: `apexRefusalMessage` has three call sites — `aws.ts:104` (the backstop, `"persisted"`), `aws.ts:125` (the "no usable domains, detach everything" branch, whose output becomes the `apexNote` in an apply-response `message`), and the route (`"add-form"`). *Consequences to carry out* gains a bullet assigning `aws.ts:125` **`"persisted"`**, with the reason (no checkbox exists on a surface that renders an apply response, and "remove and re-add" is the correct instruction), and notes that a required second parameter breaks that line at compile time. Both sites are now named in the `aws.ts` row of *Files touched*, and the apex-message test row records which suite covers which site. |
| F6 | NIT | **Addressed; the no-new-column decision stands.** Confirmed in source: `rowToCertificate` maps `updatedAt: row.updated_at` (`domains/domain/mappers.ts:100`), `listCertificates` selects `*` (`domains/domain/domains.ts:189-194`) and `sslCertificateSchema` declares `updatedAt: z.string()` (`domains/schemas.ts:69`), so the redefinition is user-visible on the API, not only inside the sweep. Also verified: **no frontend surface renders it** — `grep -rn "updatedAt" frontend/src` returns one unrelated hit (`src/types/sast.ts:62`) and `ProjectDomainsTab.tsx` does not read the field. So nothing is relabelled and nothing is dropped (removing the field would break the response contract for no gain); the subsection now states the verification, and records that the honest label for any **future** surface is "last checked", which is what the new semantics mean. |
| F7 | NIT | **Addressed, reviewer's line adopted.** Confirmed: `const CERT_DEADLINE_MS = 2 * 60 * 60 * 1000;` at `aws.ts:45` is module-private. Stated in both places it matters — under *Give-up policy* and under *`isPastCertDeadline` is extended, not replaced* — that the constant **moves to `static/deadlines.ts` and is exported from there**, with `aws.ts` importing it for the default third argument while `isPastCertDeadline` itself stays in `aws.ts` so its three existing tests keep their import path. The dependency direction is called out explicitly: `deadlines.ts` imports nothing from `aws.ts`, which is what keeps it pure and unit-testable. Recorded in the `deadlines.ts` and `aws.ts` rows of *Files touched*. |

**What did not change.** No requirement was renegotiated, nothing was deferred, and none of the review's 26 verified assumptions was altered. The technology stack, the per-cloud scope matrix, the "no new migration" position, the Item 3 stage matrices and token rules, and the ACM-leak follow-up sizing are all unchanged. One deviation from a suggested fix is recorded above (F1's `pending` clock), with its reasoning. Both **D1** and **D2** remain **SIGN-OFF REQUIRED** and substantively unchanged: **D1** is still refuse-by-default with a confirmed override, and **D2** is still one cron sweep with per-state cadence and per-cloud deadlines — now total over its own state filter, with no resting state that polls without end.

