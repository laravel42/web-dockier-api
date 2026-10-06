# Implementation Plan — Custom Domain UX (static deploys)

See `requirements.md` (R1-R7, NFR1-6) and `design.md` (Items 1-7, decisions **D1** and **D2**). Every `file:line` in the design is a 2026-10-06 snapshot — verify against the current tree before editing.

**Scope reminder.** This spec concerns the `static` **deploy strategy** (`deployStrategy: "static"` — object storage behind a CDN, adapters `backend/src/services/deploy/domain/adapters/aws-s3.ts` and `gcp-storage.ts`). It has nothing to do with Dokploy's `static` **build type** in `backend/src/services/deploy/domain/dokploy/stages/configure-app.ts`. Ignore the latter entirely.

**No new migration.** `0075_static_domain_certificates.sql` already carries every column and both indexes this work uses; the apex acknowledgement lives in the existing `projects.settings` JSONB. Do not add a migration file.

## Overview

The work is sequenced so a user who is mid-flight on a live domain today gets relief first. Group 1 makes the failure that actually broke the incident honest and non-retryable; Group 2 stops an unusable domain from being accepted; Group 3 makes the missing migration visible to an operator; Group 4 gives them a document to configure IAM against; Group 5 closes the coverage hole that let all of it ship green. Only then do the two large items land — the background poller (Group 6) and the staged progress UI that replaces `Sync now`.

Each task is independently reviewable, leaves the tree buildable, and states its own verification command.

## Sequencing (binding)

| Group | Content | Tasks | Blocked on sign-off |
|---|---|---|---|
| 1 | **Item 4** — failure classification, self-describing messages, `warn` → `error`, **plus F1's state-writing fix** | 1-5 | no |
| 2 | **Item 1** — apex guard at the moment of adding a domain, then the rest of the validator | 6-11 | tasks 6-8 need **D1**; 9-11 do not |
| 3 | **Item 5** — pending-migration readiness signal on the existing `GET /readyz` | 12-14 | no |
| 4 | **Item 6** — `docs/operations/aws-static-hosting-iam.md` | 15 | no |
| 5 | **Item 7** — the regression test for the certificate write path that has none | 16-17 | no |
| 6 | **Item 2** (background sweep) then **Item 3** (staged progress view) | 18-27 | **D2** (18-23); Item 3's terminal stage + Resume also need **D2** |

F1's state-writing fix sits in Group 1 rather than Group 6 because it depends on Group 1's `classifyAwsError` to decide `retryable`, and because a permanently denied `acm:RequestCertificate` currently leaves the row at `pending` with a null message — a live-user problem today, not only a poller problem.

## Dependency graph

```
1. failures.ts (StaticFailure, classifyDbError, classifyAwsError)
      │
      ├─► 2. certs.ts result types + log promotion
      │        │
      │        └─► 3. reconciler call sites + the two incident messages
      │                 │
      │                 └─► 4. write-state invariants (F1 + transient-never-failed)
      │
      └─► 5. retryable to the apply response and the pg-boss handler
               │
               ▼
      6-8. apex guard (D1) ──┐
      9-11. validator, advisory, duplicates, form a11y
               │
               ▼
      12-14. /readyz migration state   (independent of 1-11)
               │
               ▼
      15. IAM document                 (independent; needed by task 3's message)
               │
               ▼
      16-17. certs/aws-cert-write regression coverage
               │
               ▼
      18-23. deadlines + phase clocks + sweep + worker/cron   (D2)
               │
               └─► 24-27. stage model, attachment endpoint, DomainAttachment UI, Resume
```

Tasks 12-15 are genuinely independent of 1-11 and of each other; the group order above is still binding, because it is ordered by user value, not only by dependency.

---

## Group 1 — Item 4: honest failures (includes F1)

- [ ] 1. Add the failure carrier and the two classifiers
  - [ ] 1.1 Create `backend/src/services/domains/domain/static/failures.ts` with `FailureKind` (`schema_drift` | `permissions` | `quota` | `conflict` | `stale_stack` | `transient` | `unknown`), `StaticFailure` (`kind`, `retryable`, user-facing `message`, log-only `detail: { code?, details?, hint?, raw? }`), and `classifyDbError(error: PostgrestError, ctx)` / `classifyAwsError(err: unknown, ctx: { operation: string })`. `retryable` is derived from `kind` inside the module and is never a parameter, so the two cannot disagree.
  - [ ] 1.2 `classifyDbError`: `PGRST204`, Postgres `42703`, Postgres `23514` → `schema_drift`, `retryable: false`. Everything else → `transient`. `23505` is **not** classified here — it stays handled in `ensureStaticCertRow` as a concurrent insert (R4.3).
  - [ ] 1.3 `classifyAwsError`: `permissions` on `err.name`/`Code` matching `AccessDenied|AccessDeniedException|UnauthorizedOperation|AuthorizationError` or a message containing `is not authorized to perform`, extracting the action with `/not authorized to perform:\s*([a-z0-9]+:[A-Za-z]+)/` and falling back to `ctx.operation`; `quota` for ACM `LimitExceeded`; `conflict` for `CNAMEAlreadyExists`; `stale_stack` for the pre-parameters stack message; `transient` for `*_IN_PROGRESS`, `can not be updated`, throttling and network errors. Move the existing correct classifications here rather than rewriting their messages (R4.6).
  - [ ] 1.4 Never echo the ARN AWS returns into `message` — it carries the account id and principal path. It belongs in `detail.raw` for the `error` log only (NFR4).
  - Files: `backend/src/services/domains/domain/static/failures.ts` (new)
  - Verify: `pnpm backend:typecheck` — zero new errors. A new `backend/src/services/domains/domain/static/__tests__/failures.test.ts` with one case per `FailureKind` passes via `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/failures.test.ts`.
  - _Requirements: 4.2, 4.5, 4.6, 4.7, 4.12, NFR4_

- [ ] 2. Convert `certs.ts` to result types and promote the swallowed logs
  - [ ] 2.1 Change the five signatures per the design's table: `ensureStaticCertRow` → `{ ok: true; row } | { ok: false; failure }`; `listStaticCertRows` → `{ ok: true; rows } | { ok: false; failure }`; `findStaticCertRow` → `{ ok: true; row: StaticCertRow | null } | { ok: false; failure }`; `deleteStaticCertRows` → `Promise<{ ok: boolean }>`; `setCertState` keeps its `Promise<boolean>` signature.
  - [ ] 2.2 Promote all four swallowed logs from `warn` to `error` and pass the **raw** `PostgrestError` at every one: the list failure (`certs.ts:68`), the create failure (`:115`), the read failure (`:136`), and the delete failure (`:198`, which currently discards `code`/`details`/`hint` by passing `getErrMsg(error)`). Promote `setCertState`'s `warn` (`:177`) on the same grounds. A failure that aborts a user's action is not a warning.
  - [ ] 2.3 Keep the `23505` branch behaving exactly as today — re-read rather than report — with the re-read now returning a result, and a failing re-read reporting its own failure instead of `null`.
  - Files: `backend/src/services/domains/domain/static/certs.ts`
  - Verify: `pnpm backend:typecheck` fails loudly at every unconverted call site — that list is the input to task 3. After task 3, `pnpm test` passes.
  - _Requirements: 4.1, 4.3, 4.8, 4.9_

- [ ] 3. Migrate the reconciler call sites and write the two incident messages
  - [ ] 3.1 Update the nine call sites: `aws.ts` (four), `gcp.ts` (three), `static/index.ts` (two — `previewDomainConfigStatic` and `getDomainDnsInstructionsStatic`, which surface the failure message instead of silently showing `pending`).
  - [ ] 3.2 Replace `"Could not record certificate state for … Try Sync again."` (`aws.ts:151-157` and the GCP twin) with the schema-drift message from the design: it names the cause (a database change for custom domains has not been applied), says retrying will not help, names the operator action (`pnpm db:migrate`) and points at `GET /readyz`. `retryable: false`.
  - [ ] 3.3 Replace `"Could not request a certificate: <raw AWS error>"` (`aws.ts:325`) with the IAM message: it names the denied action, points at `docs/operations/aws-static-hosting-iam.md` by path (R6.10), says retrying without the permission will not help, and tells the user to choose Resume afterwards. `retryable: false`.
  - [ ] 3.4 **R4.10 — a failed list is not an empty list.** Where `orphaned` is computed from `listStaticCertRows` (`aws.ts:113` and the GCP equivalent), an `ok: false` result **skips orphan cleanup entirely** and the reconcile continues; log the skip at `warn` with the failure kind. Never run a destructive delete over data that could not be read.
  - Files: `backend/src/services/domains/domain/static/aws.ts`, `gcp.ts`, `index.ts`
  - Verify: `pnpm test` — existing `static/__tests__/aws.test.ts` and `gcp.test.ts` pass (extended, not rewritten). Grep-free behavioural check: the companion reconcile case added in task 16 asserts orphan deletion is **not** called on a failed list.
  - _Requirements: 4.4, 4.5, 4.10, 6.10_

- [ ] 4. Make the reconcilers write their classified state (F1 + the transient rule)
  - [ ] 4.1 **Only `retryable: false` may write `failed`.** The attach-failure write (`aws.ts:200-209`) currently writes `verificationState: "failed"` for any `attach.ok === false`, including the `*_IN_PROGRESS` case that `aws.ts:515-523` classifies as `retryable: true`. Change it to write `verification_message` alone when the failure is retryable, leaving `verification_state` and the phase clock untouched. Apply the same rule to every `!ok` write in both reconcilers.
  - [ ] 4.2 **And a `retryable: false` failure always writes `failed`.** The `!cert.ok` return at `aws.ts:163-165` calls no `setCertState` at all, so the incident's denied `acm:RequestCertificate` leaves every row at `pending` with a null `verification_message` forever. Change it to write the classified message onto every row the reconcile holds, plus `verificationState: "failed"` when and only when `retryable === false`. Apply to every `!ok` return in both reconcilers **that holds rows**.
  - [ ] 4.3 The two `!ok` returns that hold no row are explicitly out of this rule and must stay as they are: the `ensureStaticCertRow` failure (the row could not be created, so the message travels in the apply response and `/readyz` is the operator surface) and the detach branch at `aws.ts:126`, reached only when `usable.length === 0` and the rows have just been removed as orphaned.
  - Files: `backend/src/services/domains/domain/static/aws.ts`, `gcp.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/` — new cases assert (a) an `AccessDeniedException` on `RequestCertificate` leaves every row at `verification_state = 'failed'` carrying the IAM message, (b) a throttling error on the same call leaves them at `pending` **with** the transient message written, (c) an `attaching` row whose `UpdateStack` answers `_IN_PROGRESS` keeps `verification_state = 'attaching'` and writes no `failed`.
  - _Requirements: 2.9, 4.5, 4.6, 4.7_

- [ ] 5. Propagate `retryable` to the apply response and the job layer
  - [ ] 5.1 Add `retryable?: boolean` to `ApplyDomainsResult` in both declarations (`applier.ts:31`, `static/index.ts:19`) and stop dropping it in `applyDomainConfigStatic` (`static/index.ts:62`).
  - [ ] 5.2 Add `retryable: z.boolean().optional()` to `applyDomainResponseSchema` (`domains/schemas.ts:93`) — additive, so the existing `{ success, message, ... }` contract holds.
  - [ ] 5.3 Change `isRetryableFailure` (`domains/domain/worker.ts:39`) to return the structured flag when it is defined and fall back to today's substring rule otherwise. The fallback is load-bearing: it preserves the legacy VPS string `"will be applied on next deployment"` verbatim, and the flag is `undefined` on the VPS and Dokploy paths, so neither branch changes behaviour.
  - Files: `backend/src/services/domains/domain/applier.ts`, `static/index.ts`, `backend/src/services/domains/schemas.ts`, `backend/src/services/domains/domain/worker.ts`
  - Verify: `pnpm test` plus a new worker case asserting a `retryable: false` result does **not** re-throw into pg-boss (no retries burned) while a VPS-shaped message with no flag still takes the legacy path.
  - _Requirements: 4.11, 4.12_

---

## Group 2 — Item 1: validate at the door

> **⚠ Tasks 6, 7 and 8 cannot land without sign-off on D1** (apex-on-AWS: refuse by default, allow a confirmed `apexAliasAck` override). If D1 is rejected in favour of "refuse always", task 6 loses the ack list and the checkbox, task 7 disappears, and `verifyFlattenedAlias` becomes dead code — so do not start them on spec. Tasks 9-11 are independent of D1 and may land first.

- [ ] 6. Resolve the cloud cheaply and refuse an un-acknowledged apex at add time **(needs D1)**
  - [ ] 6.1 Create `static/cloud.ts` with `resolveStaticCloud(projectId, tenantId) → { cloud: "aws" | "gcp" | null; routeTarget: string | null; apexAliasAck: string[] }`. **Two DB reads, no provider call:** `lookupActiveDeployment` (which never selects `settings`) for `cloud` and `routeTarget` (`infra.distributionDomain` / `infra.cdnIp`), plus an explicit `projects.select("settings")` for the ack list. No `resolveStaticTarget` — it costs `DescribeStacks` + `GetCallerIdentity`.
  - [ ] 6.2 The two reads have **deliberately opposite failure rules**, and both must be implemented as written: an unresolvable `cloud` **fails open** (`null`, apex check skipped, add succeeds — the reconcile backstop still fires), while a failed or absent settings read yields `apexAliasAck: []`, so a previously acknowledged apex is **refused again** with the full explanation and the checkbox. Do not unify them.
  - [ ] 6.3 In `POST /projects/:projectId/domains` (`domains/routes.ts:63`), gate on `cloud === "aws" && isApexDomain(normalized) && !acked`, where `acked = body.apexAliasAck === true || apexAliasAck.includes(normalized)` — the request body must be read first, because on a first add the stored list is always empty. Throw `DomainsError(apexRefusalMessage(normalized, "add-form"), "bad_request", undefined, { clientCode: "apex_requires_ack" })`. This service's code union is exactly `not_found | bad_request | conflict | internal`; there is no `precondition_failed`.
  - [ ] 6.4 Rewrite `apexRefusalMessage(host, surface: "add-form" | "persisted")` in `static/apex.ts` to list all four alternatives (subdomain; ALIAS/ANAME/flattening; Route 53 A-ALIAS; GCP static) in the design's exact wording. The two surfaces differ **only** in the final clause so the explanation cannot drift. Update all **three** call sites: the route (`"add-form"`), the reconcile backstop (`aws.ts:104`, `"persisted"`), and the "no usable domains, detach everything" branch (`aws.ts:125`, `"persisted"` — its output becomes an apply-response `apexNote`, a surface with no checkbox).
  - [ ] 6.5 Teach the reconcile backstop (`aws.ts:86-106`) to consult the ack list and skip the refusal for acknowledged hosts. Two enforcement points is correct: the route owns the conversation, the reconcile owns the invariant for rows created by any other path.
  - Files: `backend/src/services/domains/domain/static/cloud.ts` (new), `static/apex.ts`, `static/aws.ts`, `backend/src/services/domains/routes.ts`, `backend/src/services/domains/schemas.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/__tests__/validation.test.ts backend/src/services/domains/domain/__tests__/apex-message.test.ts` — apex refused on AWS without ack carrying `code: "apex_requires_ack"`; accepted with `apexAliasAck: true` on a first add; accepted from the stored list with no body flag; accepted on GCP; a failing settings read refuses an apex that **is** in the stored list; the `"persisted"` variant mentions no checkbox.
  - _Requirements: 1.1, 1.2, 1.9, 1.10, D1_

- [ ] 7. Persist and prune the apex acknowledgement **(needs D1)**
  - [ ] 7.1 Create `domains/domain/apex-ack.ts` with one helper each for `appendApexAck(tenantId, projectId, host)`, `removeApexAck(...)` and `isApexAcked(...)`, re-reading `projects.settings` inside the call and writing back `{ ...existing, apexAliasAck: [...set, host] }` — the same read-modify-write shape `updateProject` already uses (`projects/domain/projects.ts:266-297`), so there is exactly one merge rule. `projectSettingsSchema` is `.passthrough()`, so no schema change and no migration.
  - [ ] 7.2 Call `appendApexAck` **before** `createDomain`, never after: the reverse order leaves a window in which a reconcile refuses a domain the user just acknowledged. If the append fails, the add fails (`500`, nothing created).
  - [ ] 7.3 Prune the hostname on `DELETE /projects/:projectId/domains/:domainId`, best-effort — a failed prune logs at `warn` and does not fail the delete. Without the prune, delete-and-re-add silently re-acknowledges and suppresses the explanation the feature exists to give.
  - [ ] 7.4 Record the clobber window rather than engineering around it: a concurrent write to a different `projects.settings` key can be lost. The deferred mitigation is `jsonb_set` through the bare `pg.Client` seam task 13 introduces; it is deliberately **not** done now.
  - Files: `backend/src/services/domains/domain/apex-ack.ts` (new), `backend/src/services/domains/routes.ts`, `backend/src/services/domains/domain/domains.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/__tests__/validation.test.ts` — the ack survives a first add; the ack is pruned on delete so a re-add refuses again; a failing append fails the add and creates no domain row.
  - _Requirements: 1.1, 1.9, D1_

- [ ] 8. Serialise a machine-readable `code` on `bad_request`, and render the checkbox from it **(needs D1)**
  - [ ] 8.1 In `shared/http/error-handler.ts`, change the `bad_request` arm to read `error.metadata?.clientCode` (a string) and send `{ statusCode, error, message, ...(clientCode ? { code } : {}) }`. The payload must be byte-identical to `reply.badRequest(msg)` when no `clientCode` is present, so no other service's `bad_request` is affected. No change to `shared/supabase/errors.ts` — `metadata` is already the fourth constructor argument. `apex_requires_ack` is this mechanism's only current value.
  - [ ] 8.2 In `ProjectDomainsTab.tsx`, read `code` from the failed add and set `showApexAck` when it is `apex_requires_ack`, rendering the checkbox *"My DNS provider supports ALIAS, ANAME, or CNAME flattening at the domain root."* directly beneath the refusal, pre-focused, with the typed name still in the field. Re-submitting sends `{ name, apexAliasAck: true }`.
  - [ ] 8.3 Keep the pre-emptive render (`cloud === "aws"` **and** a frontend `isApexCandidate` mirror) as a pure optimisation only. Error-driven rendering is the guarantee, because the attachment endpoint returns `cloud` only when `supported: true` — exactly the cases where a `cloud`-gated checkbox would be absent while a `400` tells the user to tick it.
  - [ ] 8.4 Add `apexAliasAck` to `createDomain` in `frontend/src/services/domains.ts`.
  - Files: `backend/src/shared/http/error-handler.ts`, `frontend/src/pages/ProjectDetail/sections/ProjectDomainsTab.tsx`, `frontend/src/services/domains.ts`
  - Verify: `pnpm test` (the error-handler arm's existing cases still pass unchanged) and `cd frontend && pnpm lint` — no new errors. Behavioural check in the browser: adding `example.com` to an AWS static project shows the refusal **and** the checkbox under the input; ticking it and resubmitting creates the domain.
  - _Requirements: 1.3, 1.9, D1_

- [ ] 9. Add the pure domain-name validator (independent of D1)
  - [ ] 9.1 Create `domains/domain/validation.ts` with `validateDomainName(raw)` applying the design's eleven rules **in the design's order**, each with its own message: non-empty, no scheme, no path/query/port/whitespace, ≤253 chars, at least one dot, no empty label, labels 1-63, no leading/trailing hyphen, **wildcard rejected (rule 9, before the charset rule so `*.example.com` gets the wildcard message)**, charset `a-z0-9-` with no exceptions, TLD matching `/^(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/`.
  - [ ] 9.2 Run `normalizeHost` (`static/apex.ts:34`) first — trim, lowercase, strip one trailing dot — and return the normalized name for storage, so `WWW.Example.com.` and `www.example.com` are one domain (R1.5).
  - [ ] 9.3 Relax `createDomainBodySchema` (`schemas.ts:16-21`) to `z.string().min(1).max(253)` and add `apexAliasAck: z.boolean().optional()`. The regex's single `"Invalid domain name format"` cannot produce a per-problem message, which is what R1.4 requires. Leave `createCertificateBodySchema`'s regex untouched — no requirement covers it.
  - [ ] 9.4 Punycode is accepted as-is with no conversion; Unicode input fails the charset rule. Converting would need a new dependency, which `AGENTS.md` → *Things to avoid* rules out and no requirement asks for.
  - Files: `backend/src/services/domains/domain/validation.ts` (new), `backend/src/services/domains/schemas.ts`, `backend/src/services/domains/routes.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/__tests__/validation.test.ts` — one case per rule message, plus normalization, plus an assertion that `*.example.com` yields the wildcard message rather than the charset one (which is what makes the rule ordering observable) and that an `xn--` TLD is accepted.
  - _Requirements: 1.4, 1.5, 1.9, 1.10_

- [ ] 10. Duplicate handling with the right message per scope (independent of D1)
  - [ ] 10.1 Add a pre-check on `(projectId, normalized)` before `createDomain` → `DomainsError("… is already added to this project.", "conflict")`.
  - [ ] 10.2 Keep the `23505` path, but change its message: `idx_domains_name_unique` is on `(organization_id, name)` — **tenant-wide, not per-project** — so the existing `"Domain already exists"` becomes *"`<name>` is already used by another project in this organization. Remove it there first."* The pre-check cannot be skipped, because the two conditions need different messages.
  - Files: `backend/src/services/domains/domain/domains.ts`, `backend/src/services/domains/routes.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/__tests__/validation.test.ts` — duplicate-on-project returns the project message, duplicate-in-org returns the org message, and neither creates a second row.
  - _Requirements: 1.6, 1.9_

- [ ] 11. Conflicting-record advisory and field-level form errors (independent of D1)
  - [ ] 11.1 Add `existingRecordAdvisory(host, routeTarget)` — resolve `CNAME`, then `A` if that is empty, with `new dns.promises.Resolver({ timeout: 1200, tries: 1 })` and the whole call in a `Promise.race` against a 1.5 s timer so a pathological resolver cannot hold the HTTP request open. Use the `node:` import prefix.
  - [ ] 11.2 Suppress the advisory when the answer already matches this project's CDN: a CNAME equal to `distributionDomain` (lowercased, trailing dot stripped) or an A set containing `cdnIp`. This is the incident's own path — the user published the routing record first — and warning them their correct record "will be replaced" would be a false alarm. `NXDOMAIN`/`ENODATA` → no advisory. Any other failure → `logger.warn`, no advisory, add still succeeds (R1.8). Unknown `routeTarget` → advisory on any answer.
  - [ ] 11.3 Return it additively as `warning: z.string().optional()` on `domainSchema` (also the list element type, where an optional field is additive). Keep the wording true in every case it can fire, including the known imprecision for an ALIAS-flattened AWS apex whose A set is rotating CloudFront edge IPs.
  - [ ] 11.4 Frontend: the add `<Input>` gains `aria-invalid={Boolean(error)}` and `aria-describedby` pointing at the error paragraph, which gains `role="alert"` and an `id` from `useId()`. The advisory renders above the list as a dismissible `warning-surface` / `warning-line` / `warning-ink` note, visually distinct from the `danger` error styling. **No `dockier-*` berry class anywhere** — that scale is legacy, reserved for severity states.
  - Files: `backend/src/services/domains/routes.ts`, `backend/src/services/domains/schemas.ts`, `frontend/src/pages/ProjectDetail/sections/ProjectDomainsTab.tsx`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/__tests__/advisory.test.ts` — a CNAME equal to `distributionDomain` produces no advisory, a different CNAME does, an A record equal to `cdnIp` produces none, `NXDOMAIN` produces none, a resolver timeout produces none and does not throw. Then `cd frontend && pnpm lint` — no new errors.
  - _Requirements: 1.3, 1.7, 1.8_

---

## Group 3 — Item 5: pending migrations as a readiness problem

- [ ] 12. Generate and pin the migration manifest
  - [ ] 12.1 Create `backend/src/scripts/generate-migration-manifest.ts`, writing a sorted `MIGRATION_VERSIONS` list to `backend/src/shared/database/migration-manifest.ts` from the numeric filename prefixes (`/^(\d+)_/`) of `supabase/migrations/*.sql`. Wire it as `migrations:manifest` in `backend/package.json`.
  - [ ] 12.2 A checked-in manifest rather than a runtime directory read, because `backend/Dockerfile` copies only `backend` and `code-analysis` — `supabase/` is **not in the production image**. The manifest also makes the expected set diff-visible in review.
  - [ ] 12.3 Add `backend/src/shared/database/__tests__/migration-manifest.test.ts`, which reads the real `supabase/migrations/` directory (present in the repo and in CI) and asserts it matches the manifest, so a new migration without a regenerated manifest fails CI.
  - Files: `backend/src/scripts/generate-migration-manifest.ts` (new), `backend/src/shared/database/migration-manifest.ts` (new, generated), `backend/src/shared/database/__tests__/migration-manifest.test.ts` (new), `backend/package.json`
  - Verify: `pnpm --filter @dockier/backend-fastify migrations:manifest` regenerates with no diff, then `pnpm vitest --run --project backend backend/src/shared/database/__tests__/migration-manifest.test.ts` passes. Delete a line from the manifest and confirm the test fails.
  - _Requirements: 5.2, 5.9_

- [ ] 13. Read the applied ledger, cached and fail-open
  - [ ] 13.1 Create `backend/src/shared/database/migration-state.ts` returning `{ status: "ready" } | { status: "pending"; versions } | { status: "unknown"; reason }`. `supabase_migrations` is not in PostgREST's exposed schemas, so `supabaseAdmin` cannot read it: use a short-lived `pg.Client` on `DATABASE_URL` via `getPostgresConnectionConfig`, following the precedent in `services/code-analysis/domain/scan-queue-reconcile.ts:17-28`. `SELECT version FROM supabase_migrations.schema_migrations`, `statement_timeout = '2s'`, `client.end()` in a `finally`.
  - [ ] 13.2 `pending = canonical \ applied` as a set difference, not a max comparison — that is what makes the deliberately reserved `0074` (no file) never pending (R5.9).
  - [ ] 13.3 Module-level cache, 30 s TTL, single in-flight promise so concurrent probes share one query. Cache `pending` and `unknown` too, so neither a deploy-scale condition nor a broken ledger read costs a query per request.
  - [ ] 13.4 **Fails open (R5.7):** any read failure, and a missing `DATABASE_URL`, yield `unknown`, which never contributes to `degraded`. A diagnostic that invents outages is worse than none.
  - Files: `backend/src/shared/database/migration-state.ts` (new)
  - Verify: `pnpm backend:typecheck`, plus the unit cases in task 14's suite asserting a throwing client yields `unknown` and that two concurrent calls issue one query.
  - _Requirements: 5.2, 5.7, 5.8, 5.9_

- [ ] 14. Report it on the existing `GET /readyz`
  - [ ] 14.1 In `backend/src/app.ts`, extend the `/readyz` handler to `degraded = !queueReady || migrations.status === "pending"`, adding `migrations: migrations.status` always and `pendingMigrations: versions` only when pending. `503 degraded` / `200 ready` exactly as today otherwise.
  - [ ] 14.2 **`GET /healthz` must not change.** It stays the static literal; existing platform probes depend on its exact payload (`AGENTS.md` → *Health vs readiness*). The Dockerfile `HEALTHCHECK` keeps pointing at `/healthz`.
  - [ ] 14.3 `/readyz` stays **unwired from any platform probe** (R5.6). Failing closed would pull traffic from an instance that is serving HTTP correctly.
  - [ ] 14.4 Extend, do not rewrite, the two existing `/readyz` assertions in `shared/http/__tests__/app-hardening.test.ts:98-113`. They `toEqual` the whole body, so one key is added to each object literal (`migrations: "unknown"`, since tests run without `DATABASE_URL`); the test names and intent are unchanged. Add two new cases: ledger lagging → `503` with the versions named, and the ready path.
  - Files: `backend/src/app.ts`, `backend/src/shared/http/__tests__/app-hardening.test.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/shared/http/__tests__/app-hardening.test.ts` — all cases pass, including an assertion that the `/healthz` body is still byte-identical.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 7.7_

---

## Group 4 — Item 6: the IAM document

- [ ] 15. Extend `docs/operations/aws-static-hosting-iam.md` in place
  - [ ] 15.1 Append the two policy statements from IAM report §2.1: `StaticDomainCertificates` (`acm:RequestCertificate`, `acm:AddTagsToCertificate`, `acm:DescribeCertificate`, `acm:ListTagsForCertificate`) on `arn:aws:acm:us-east-1:<account-id>:certificate/*`, and `StaticDomainCertificateDiscovery` (`acm:ListCertificates`) on `"*"` with the one-line reason that a list operation has no resource in scope. Use the document's existing `<account-id>` placeholder style — substitute out the report's literal account id.
  - [ ] 15.2 Add four rows to the "what the adapter does" table (R6.7): request the certificate → `acm:RequestCertificate` + `acm:AddTagsToCertificate`; read status and the validation record → `acm:DescribeCertificate`; adopt an existing certificate → `acm:ListCertificates` + `acm:ListTagsForCertificate`; attach the alias → `cloudformation:UpdateStack` plus the already-granted CloudFront distribution-update actions.
  - [ ] 15.3 **Delete the final bullet** — *"Custom domains are not covered. They additionally need ACM in `us-east-1` plus DNS — Phase 4 of `.kiro/specs/static-deploy-targets/`"* — and replace it with a "Custom domains" subsection stating: ACM is the only new service (R6.4); its CloudFormation and CloudFront usage is a subset of what a static deploy already exercises; certificates are always requested in `us-east-1` (`ACM_REGION`), so the ACM statements can be region-pinned while the CloudFormation statement cannot, because a project's stack can live in any region (R6.6); and **no Route 53 permission is required**, because DNS verification is public resolution through `node:dns` including the ALIAS-flattening fallback, with no AWS call in that path (R6.5). §6 of the IAM report is why this file is the right home rather than a new one.
  - [ ] 15.4 Annotate `acm:AddTagsToCertificate` as inferred from the ACM tag-on-create contract rather than from a distinct SDK call, with the note that dropping it is survivable and watching for an `AddTagsToCertificate` denial is the fallback (R6.9, matching report §9's honesty).
  - [ ] 15.5 Add the operational consequence (R6.8): no ACM certificate is ever deleted, so unused `PENDING_VALIDATION` certificates accumulate in `us-east-1` until the account hits its ACM quota, at which point the quota message tells the operator to clean up by hand. Link it to the flagged follow-up at the end of this plan.
  - Files: `docs/operations/aws-static-hosting-iam.md`
  - Verify: apply the documented policy to a tenant's IAM user and complete one attach end to end — `Sync now` / `Check now` must reach a requested certificate with no `AccessDenied`. Document-only, so there is no unit test; the check is that the final "not covered" bullet is gone and that every ACM action named in task 3's error message appears in the policy block.
  - _Requirements: 6.1 - 6.10_

---

## Group 5 — Item 7: cover the write path that had none

- [ ] 16. Test `certs.ts` against faithfully-faked PostgREST errors
  - [ ] 16.1 Create `static/__tests__/certs.test.ts` mocking **only** `shared/supabase/client.js`, with a fake that mimics PostgREST's builder chain and returns real-shaped errors (`{ code, message, details, hint }`). Do **not** unpick `aws.test.ts:74`'s wholesale `../certs.js` mock — it is doing its job for the reconcile-logic tests and rewriting it would churn a passing suite (R7.8). Coverage is added one layer down, where the real query builder runs.
  - [ ] 16.2 One case each for `PGRST204`, `42703` and `23514`: assert `ok: false`, `failure.retryable === false`, `failure.kind === "schema_drift"`, and that the message does **not** contain `"Try Sync again"`.
  - [ ] 16.3 Assert `23505` still results in a re-read rather than a reported failure.
  - [ ] 16.4 Assert a failed `listStaticCertRows` returns `ok: false`, and — in the companion reconcile case — that orphan deletion was **not** called.
  - Files: `backend/src/services/domains/domain/static/__tests__/certs.test.ts` (new)
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/certs.test.ts` — all cases pass. Then revert task 2's classification temporarily and confirm the suite goes red; that is the proof the coverage is real.
  - _Requirements: 7.1, 7.2, 7.3, 4.10_

- [ ] 17. Reproduce the production failure in a unit test
  - [ ] 17.1 Create `static/__tests__/aws-cert-write.test.ts` mocking `lib/aws-sdk.js` (as the existing suite does) **and** `shared/supabase/client.js`, leaving the **real** `certs.ts` in the module graph. A separate file rather than an edit to `aws.test.ts`, because the two need incompatible module mocks.
  - [ ] 17.2 Assert that `reconcileAwsStaticDomains` against the pre-`0075` schema shape returns `retryable: false` with the schema-drift message and **never reaches `RequestCertificate`** (`acmSend` not called). That is the exact production failure, in a test that would have caught it.
  - [ ] 17.3 Assert the R7.4 row: an `AccessDeniedException` on `RequestCertificate` is non-retryable, names the action, references the IAM document path, **and leaves every certificate row at `verification_state = 'failed'` carrying that message** — the F1 regression guard. Companion case: a throttling error on the same call leaves the rows at `pending` **with** the transient message written.
  - Files: `backend/src/services/domains/domain/static/__tests__/aws-cert-write.test.ts` (new)
  - Verify: `pnpm test` — the new file passes and `aws.test.ts` / `gcp.test.ts` still pass. `pnpm backend:typecheck` — zero new errors.
  - _Requirements: 7.1, 7.4, 7.8_

---

## Group 6 — Item 2 (background sweep) then Item 3 (staged progress view)

> **⚠ Tasks 18-23 cannot land without sign-off on D2** (one pg-boss cron sweep at `* * * * *`; per-state cadence; per-cloud, per-clock deadlines with `timed_out` as the give-up state). The cadence and deadline tables, the clock split, and the `pending` 30-minute budget are all D2's content — if the cadence or the give-up policy changes, tasks 18, 21 and 22 change with it. Tasks 24-27 depend on D2 only for their terminal stage and Resume affordance; the stage model itself (task 24) is decided.

- [ ] 18. The pure deadline and cadence tables **(needs D2)**
  - [ ] 18.1 Create `static/deadlines.ts` with `pollIntervalMs(cloud, state: PollableCertState, status, phaseAgeMs): number` and `certDeadlineMs(cloud, state, status): { ms; clock: "phase" | "created" | "issued"; terminal: boolean } | null`, transcribing D2's two tables exactly, including the two AWS `awaiting_dns` rows split on `status === "active"`.
  - [ ] 18.2 Both are **exhaustive switches over the nine (cloud, state) pairs the sweep's filter admits**, with `assertNever(state)` on the default, so adding a state to the filter without a cadence is a compile error. Do **not** supply a permissive default — a lenient fallback is exactly what turned a state-less `pending` row into a permanent per-minute poll.
  - [ ] 18.3 `null` from `certDeadlineMs` has one meaning: "poll on the cadence, never time out", with the deadline comparison skipped entirely and **never** a fallback to `CERT_DEADLINE_MS`. After this revision no input produces it; the type is kept for a future cadence-only pair.
  - [ ] 18.4 **Move `CERT_DEADLINE_MS` out of `aws.ts:45`** (where it is module-private) into `deadlines.ts` and export it. `deadlines.ts` imports nothing from `aws.ts` — the dependency runs one way, which is what keeps it a pure, unit-testable table module.
  - Files: `backend/src/services/domains/domain/static/deadlines.ts` (new), `static/aws.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/deadlines.test.ts` — one case per table row, both tables. `pnpm backend:typecheck` — and confirm the compile error by temporarily adding a tenth state to `PollableCertState` without a cadence row.
  - _Requirements: 2.7, D2_

- [ ] 19. Extend `isPastCertDeadline` without breaking its existing callers **(needs D2)**
  - [ ] 19.1 Append the deadline as parameter **three**: `isPastCertDeadline(startedAtIso, now = Date.now(), deadlineMs = CERT_DEADLINE_MS)`. The existing tests pass `now` in the second position (`aws.test.ts:598`, `:603`), so inserting it earlier would break them. Keep the function in `aws.ts` so its three existing tests keep their import path; import the constant from `./deadlines.js`.
  - [ ] 19.2 Extend `static/__tests__/aws.test.ts` with new cases passing an explicit third-argument deadline, leaving the three existing two-argument cases unchanged.
  - Files: `backend/src/services/domains/domain/static/aws.ts`, `static/__tests__/aws.test.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/aws.test.ts` — the three original cases pass untouched and the new ones pass.
  - _Requirements: 2.7, D2_

- [ ] 20. Make the clocks mean what the deadlines assume **(needs D2)**
  - [ ] 20.1 Add `created_at`, `issued_at` and `updated_at` to `certs.ts`'s `SELECT_COLUMNS` and to `StaticCertRow`. All three already exist on `ssl_certificates` (`0050_domains_certificates.sql`) and are already written — they were simply dropped from the projection. **No migration.**
  - [ ] 20.2 **The phase-clock invariant.** `attach_started_at` is redefined as "when the current phase began" and is written **if and only if** the state being written differs from the one already persisted. `setCertState` takes the row's persisted `verificationState` (both reconcilers already hold the row) and stamps only on a difference. This is a **behaviour change on both clouds**: `gcp.ts:234` currently stamps unconditionally on every row write and `aws.ts:205-213` re-stamps on every `attaching` write. Under a repeating sweep a re-stamped clock never ages, which silently disables every deadline and both upper backoff tiers.
  - [ ] 20.3 **`issued_at` becomes write-once:** `cert.issued && row.issuedAt === null ? nowIso() : undefined`, replacing `aws.ts:173-178`'s unconditional re-stamp and the GCP twin. Otherwise the post-attach 72-hour routing deadline is as unreachable as a re-stamped phase clock.
  - [ ] 20.4 Document the widened meaning of `attach_started_at` in `certs.ts` and in `AGENTS.md`'s column list.
  - Files: `backend/src/services/domains/domain/static/certs.ts`, `static/aws.ts`, `static/gcp.ts`, `AGENTS.md`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/` — a second reconcile that re-asserts an unchanged state does not move `attach_started_at` (asserted on both the AWS `attaching` write and an unchanged GCP `provisioning` row), and a reconcile of an already-issued certificate whose row carries a non-null `issued_at` does not re-stamp it.
  - _Requirements: 2.5, 2.7, D2_

- [ ] 21. The DB-only sweep **(needs D2)**
  - [ ] 21.1 Add `listCertRowsForPoll()` and `touchCertPolled(id)` to `certs.ts`. The candidate query is `type IN ('acm','gcp_managed') AND verification_state IN ('pending','awaiting_dns','provisioning','attaching') ORDER BY updated_at ASC LIMIT 200` — a strict subset of `idx_ssl_certificates_pending_verification`'s predicate, so the partial index is usable (R2.3). `touchCertPolled` updates only `updated_at`; document in `certs.ts` that `updated_at` now means *last time we looked at this row*.
  - [ ] 21.2 Create `static/poll-sweep.ts`. **No provider calls.** Per row: derive `cloud` from `row.type` (total over the query's own type filter — no third branch); resolve the clock named by `certDeadlineMs` through its fallback chain (`phase → attach_started_at ?? created_at`, `issued → issued_at ?? attach_started_at ?? created_at`, `created → created_at`, which is `NOT NULL` so every chain terminates); write `timed_out` (or the AWS `provisioning` → `awaiting_dns` revert, `terminal: false`) when past it; otherwise evaluate `due = (now - updated_at) >= pollIntervalMs(cloud, state, status, now - phaseStart)`.
  - [ ] 21.3 **The sweep is the only writer of the poll clock:** `touchCertPolled(id)` for every **due** row, **before** the enqueue and even if the enqueue then throws. Several reconcile paths return without writing anything (the deadline path, a throw, the schema-drift case, an unresolvable target), so leaving the clock to the reconcile would re-enqueue that project every minute forever. A not-due row is not touched.
  - [ ] 21.4 One `enqueueDomainApply(tenantId, projectId)` per distinct due project, `singletonKey: domain-apply:<projectId>`. The state machine is **not** reimplemented — the existing reconcilers already own it.
  - [ ] 21.5 Each row is processed in its own `try`/`catch`; a failure is logged at `error` and written onto that row when the write path is healthy, and one row's failure never aborts the sweep (R2.9). A row holding a state outside `PollableCertState` is **skipped with an `error` log naming the pair**, never polled on a guessed interval.
  - Files: `backend/src/services/domains/domain/static/certs.ts`, `static/poll-sweep.ts` (new)
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/poll-sweep.test.ts` — the full R7.6 matrix: candidate filtering; the due-ness predicate; the two AWS `awaiting_dns` cadences split by `status`; `timed_out` with the routing message for `status = 'active'` and the validation message otherwise; the `provisioning` → `awaiting_dns` revert at 2 h; an oscillated row still timing out on `created_at` at 72 h; a post-attach row with `issued_at = null` still timing out on `created_at`; the 90-min `attaching` deadline reading `attach_started_at`; every due row touched including one whose enqueue throws; a not-due row untouched; one row throwing not aborting the sweep; one enqueue per project; `cloud` derived for both types; a `pending` row 31 minutes past its phase clock reaching `timed_out` on both clouds; the escalating `pending` cadence; an unlisted pair skipped and logged; a stubbed `null` deadline polling with no deadline comparison; and 200-row overflow with no starvation across two consecutive sweeps.
  - _Requirements: 2.1, 2.3, 2.4, 2.9, 2.11, 7.6, D2_

- [ ] 22. Register the worker and install the cron correctly **(needs D2)**
  - [ ] 22.1 Add `CERT_POLL_QUEUE` to the queue-name block in `shared/database/queue.ts`.
  - [ ] 22.2 Create `shared/workers/cert-poll.ts` using the existing `createWorker` factory (`retryLimit: 1`, `expireInSeconds: 120`, `pollingIntervalSeconds: 5`), inheriting its retry backoff and `correlationId` tracing. **No `setInterval`, no second scheduling mechanism** (R2.2).
  - [ ] 22.3 Export one `registerCertPollWorker()` that calls `certPollWorker.register()` (which creates the queue row) and **only then** `scheduleCertPollSweep()`. pg-boss's `pgboss.schedule` has an FK to the queue row and rewrites the violation to the unhelpful `Queue cert-poll not found`; `run-server.ts:128-131` runs `onStartup` **before** `register`, so installing the schedule in `onStartup` would throw on every first deploy. The registry entry therefore has **no `onStartup` hook at all**.
  - [ ] 22.4 `boss.schedule(CERT_POLL_QUEUE, "* * * * *", {}, { key: CERT_POLL_SCHEDULE_KEY, singletonKey: CERT_POLL_SCHEDULE_KEY })`, taking the handle from `getQueue()` with a `null` guard. A schedule's identity is `(name, key)`, so `key` is what makes repeated installation an upsert across split instances; `singletonKey` applies to the jobs the schedule sends and collapses two sweeps landing in the same minute.
  - [ ] 22.5 Guard with `isQueueReady()` and log a scheduling failure at `error` **without** taking the process down: a missing schedule degrades to today's manual behaviour, while a thrown startup is an outage.
  - [ ] 22.6 Add one `workerRegistry` entry in `run-server.ts` under `services: ["domains"]` whose `register` is `registerCertPollWorker`.
  - Files: `backend/src/shared/database/queue.ts`, `backend/src/shared/workers/cert-poll.ts` (new), `backend/src/run-server.ts`
  - Verify: `pnpm backend:typecheck`, then `pnpm backend:dev` with `SERVICE_NAME=domains` and a real `DATABASE_URL`: the boot logs show the worker registered and the schedule installed with no `Queue cert-poll not found`, and `SELECT name, key, cron FROM pgboss.schedule` returns exactly one `(cert-poll, cert-poll-sweep)` row after two restarts.
  - _Requirements: 2.1, 2.2, 2.12, D2_

- [ ] 23. Make `live` mean "serving", with an inconclusive check never stranding an apex **(needs D2; interacts with D1)**
  - [ ] 23.1 Carve `verifyRoutingRecordAws(host, distributionDomain): Promise<RoutingCheck>` out of `static/index.ts:113-155` as a pure `node:dns` function with four outcomes — `verified` / `inconclusive` / `missing` / `mismatched` — and `serverIp` on **every** variant (every current return path includes it, and the frontend reads it). It cannot be `verifyDomainDnsStatic`: that takes an `ActiveDeployment` and calls `resolveStaticTarget` first, which does STS `GetCallerIdentity` and may do `DescribeStacks`, while the reconcile holds an `AwsStaticTarget`. `verifyDomainDnsStatic` becomes a pure mapping over the helper; `verifyFlattenedAlias` stays as the internal `inconclusive`-vs-`verified` fallback.
  - [ ] 23.2 Gate the `attaching` → done transition on the outcome: `verified` → `live`, message cleared; **`inconclusive` on an `isApexDomain(host)` → `live` with the caveat message, never `awaiting_dns`**; `inconclusive` on a non-apex → treated as `missing`; `missing` / `mismatched` → post-attach `awaiting_dns` with the routing-record message. The apex rule is load-bearing for D1: `verifyFlattenedAlias` returns `null` on a miss *by design* (CloudFront's edges rotate between queries), so for the one configuration D1 enables, "no overlap" means *unknown*. Calling it `awaiting_dns` would strand a correctly configured apex and time it out 72 hours later.
  - [ ] 23.3 Extract `missingRoutingRecordMessage(host, expected)` and use it from **both** negative CNAME branches — the empty-answer branch (`index.ts:133-137`) and the `ENODATA`/`ENOTFOUND` catch after the flattening fallback misses (`:168-180`, the branch the incident actually hit). When the host is an apex it tells the user to use an ALIAS/ANAME/flattened record or a Route 53 A-ALIAS, because a CNAME at the root will be rejected; otherwise it emits today's CNAME guidance verbatim. Keep each branch's distinct "yet"/propagation wording as a parameter so neither message regresses.
  - [ ] 23.4 Make `provisioning` reachable on AWS: when the certificate is not yet issued, resolve the validation record's own name with a bare `dns.resolveCname` — resolves → `provisioning`, owner **AWS**; does not → `awaiting_dns`, owner **you**, today's message. ACM's API cannot tell these apart (`ValidationStatus` stays `PENDING_VALIDATION` until it flips), so the DNS lookup is the only available signal. **No new `verification_state` value**: `provisioning` and `timed_out` are both already in the `0075` CHECK and in `certVerificationStateSchema`.
  - [ ] 23.5 State the limitation in code comments: this is a DNS check, not a TLS handshake. A real end-to-end TLS assertion stays integration-only (R7.10).
  - Files: `backend/src/services/domains/domain/static/index.ts`, `static/aws.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/aws.test.ts backend/src/services/domains/domain/static/__tests__/index.test.ts` — `awaiting_dns` → `provisioning` on a resolvable validation record; `attaching` → `live` on `verified`; **an acked apex with `inconclusive` reaching `live` with the caveat, not post-attach `awaiting_dns`** (the D1 regression guard); a non-apex `inconclusive` treated as `missing`; `mismatched` likewise; and apex-aware guidance from both negative CNAME branches with unchanged guidance for a subdomain.
  - _Requirements: 2.6, D1, D2_

- [ ] 24. The backend-computed stage model
  - [ ] 24.1 Create pure `static/stages.ts` with `AttachmentStage` (`id`, `label`, `owner: "you" | "dockier" | "aws" | "google"`, `status: "done" | "current" | "pending" | "failed"`, `detail?`, `eta?`), `CertSnapshot`, and `buildAwsStages` / `buildGcpStages`. Every snapshot field is already in `certs.ts`'s `SELECT_COLUMNS` — including `status`, which the snapshot stops dropping rather than adds. No query change, no migration.
  - [ ] 24.2 Transcribe both **per-state × per-stage status matrices** from the design cell by cell — seven AWS stages, five GCP. Do **not** use a position-based rule: `awaiting_dns` + `status === "active"` is the **only non-monotonic row in either cloud**, with stage (e) `current` *and* stage (f) `done`, because `aws.ts:173` writes `status` and `verificationState` in the same call so that state is only reachable after the attach has run.
  - [ ] 24.3 `status === "active"` is the **sole** discriminator between stage (c) (publish the validation record) and stage (e) (publish the routing record). `attach_started_at` is explicitly not a discriminator — D2 re-stamps it on every phase entry. The same test drives the D2 cadence and deadline tables, so there is one discriminator in the whole design.
  - [ ] 24.4 Two separate builders rather than one parameterised one: GCP is fully monotonic, has no validation-record stage, and never writes `attaching`. `failed` / `timed_out` replace the trailing stages with one terminal stage carrying the R4 message plus `resumable`.
  - [ ] 24.5 Give every waiting stage a realistic ETA from verified behaviour: ACM validation within minutes of the record becoming visible, a CloudFront update 5-20 minutes, a Google-managed certificate 15-60 minutes after the A record is live. No stage is presented as instantaneous.
  - Files: `backend/src/services/domains/domain/static/stages.ts` (new)
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/domain/static/__tests__/stages.test.ts` — one case per row of each matrix asserting **all** statuses, not just which stage is current; owner labels; GCP never emitting a validation-record stage; `awaiting_dns` with the same `attach_started_at` yielding (c) or (e) purely on `status`; and specifically the non-monotonic row.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.8, 3.11, 7.6_

- [ ] 25. The attachment read endpoint and the target cache
  - [ ] 25.1 Add `GET /projects/:projectId/domains/attachment` (preHandler `PROJECT_VIEW`) returning the new `domainAttachmentResponseSchema`: `{ supported, cloud?, blocker?, domains: [{ domainId, domainName, verificationState, stages, records, note, resumable }] }`. One request per tab render. Keep the handler thin — `buildAttachmentView` in `static/index.ts` does the work, dispatched from `applier.ts`.
  - [ ] 25.2 `supported: false` for the Dokploy and legacy VPS branches, which keeps R3's "degrade to today's behaviour" a single frontend condition rather than a per-branch UI.
  - [ ] 25.3 **R3.13:** when `resolveStaticTarget` fails, `blocker` carries the existing actionable message verbatim ("Redeploy the project and try again" / the "deployed before custom domains were supported — redeploy once" message) and `domains` is still returned with whatever state is persisted, so the view shows a blocked attachment rather than an empty list.
  - [ ] 25.4 Create `static/target-cache.ts` memoising `resolveStaticTarget` per `projectId` for 60 s (`Map<string, { at; resolution }>`, single in-flight promise per key, cleared on process exit like the caches in `shared/permissions/authorization.ts`). With the tab polling every 20 s, an uncached `DescribeStacks` + `GetCallerIdentity` per request is unacceptable. **Read-side only** — the apply path keeps calling `resolveStaticTarget` directly.
  - [ ] 25.5 Keep `GET /projects/:projectId/domains/:domainId/dns-instructions` unchanged and in service: `DomainRow`'s instructions panel still calls it, and both surfaces are fed by the **same** builders (`awsDnsInstructions` / the GCP twin), so the records cannot diverge. Served fresh, never stored stale (R3.6).
  - Files: `backend/src/services/domains/routes.ts`, `backend/src/services/domains/schemas.ts`, `static/index.ts`, `static/target-cache.ts` (new), `backend/src/services/domains/domain/applier.ts`
  - Verify: `pnpm test`, then against a running backend: `GET /projects/<static-project>/domains/attachment` returns `supported: true` with a populated `stages` array; the same call against a Dokploy project returns `supported: false`; and a project whose CDN cannot be resolved returns a populated `blocker` with `domains` still present. Confirm from the logs that two calls within 60 s issue one `DescribeStacks`.
  - _Requirements: 3.6, 3.8, 3.11, 3.13_

- [ ] 26. `POST /domains/:domainId/resume` **(needs D2 — `timed_out` is D2's state)**
  - [ ] 26.1 Add the route with `preHandler: [app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE), tenantRateLimit({ max: 10, windowMs: 60_000, prefix: "domain-resume" })]` **in that order** — `tenantRateLimit` keys on `request.auth?.tenantId` and its own doc comment requires it to sit after the permission preHandler. The option is `windowMs`, not `windowSeconds`. **Do not add a project-keyed extractor** to `shared/http/rate-limit.ts`; tenant keying is the tighter of the two that exist. Precedent: the deploy hook's `rateLimit({ max: 5, windowMs: 60_000, prefix: "deploy-hook" })`.
  - [ ] 26.2 Return `resumeDomainResponseSchema { success, message, verificationState }` reusing the existing `certVerificationStateSchema` — not a bare `204`, because the attachment card re-derives its stages from `verificationState` immediately instead of waiting for the next 20 s poll.
  - [ ] 26.3 One rule covers every case: **only a `timed_out` or `failed` row is reset to `pending`** (fresh phase clock, `verification_message` cleared); every other state is left untouched and just re-enqueued. Implement all six edge rows: unknown domain → `404`; non-static project → `409` `"conflict"` with nothing enqueued; no certificate row → `200`, enqueue only (the job is what creates the row); a non-terminal row → `200`, no state write, enqueue; `live` → `200`, no state write, enqueue; `blocker` set → `200`, no state write, job still enqueued, `message` carrying **the blocker text verbatim** (not a `4xx` — nothing is wrong with the request, and the instruction is "redeploy first").
  - [ ] 26.4 `timed_out` is excluded from the sweep's state filter but stays in the partial index, so a timed-out row consumes no poll slots. On resume with a still-valid ARN on the row, the reconcile skips `RequestCertificate` entirely; when ACM has already discarded it, `describeCertificate` returns `null`, the adoption scan finds nothing, and a new certificate is requested — existing behaviour, no change needed.
  - Files: `backend/src/services/domains/routes.ts`, `backend/src/services/domains/schemas.ts`
  - Verify: `pnpm vitest --run --project backend backend/src/services/domains/__tests__/routes-resume.test.ts` — all six rows, with every `200` validating against `resumeDomainResponseSchema` and carrying a `verificationState`.
  - _Requirements: 2.8, 3.9, 3.10, D2_

- [ ] 27. The staged progress view in the Domains tab
  - [ ] 27.1 Create `frontend/src/pages/ProjectDetail/sections/DomainAttachment.tsx`, rendered by `ProjectDomainsTab` above `DomainsSection`: one card per domain, stages as an `<ol>`, each `<li>` carrying an icon (`CircleCheckIcon` / `LoaderIcon` / `CircleIcon` / `CircleAlertIcon` from the already-present `lucide-react`), the label, an owner pill reading **You** / **AWS** / **Google** / **Dockier**, the detail line and the ETA. React 19 function components and hooks only.
  - [ ] 27.2 Add `attachment(projectId)` and `resume(projectId, domainId)` to `frontend/src/services/domains.ts`, and `DomainAttachment` / `AttachmentStage` to `frontend/src/types/`.
  - [ ] 27.3 **Accessibility (R3.12):** status is never colour-only — an icon plus a text label (`Done`, `In progress`, `Waiting on you`, `Not started`, `Failed`) carries it and colour only reinforces. The current stage gets `aria-current="step"`. A `<div aria-live="polite" class="sr-only">` announces the current stage label when it changes. Everything interactive is a real `<button>` (per-record **Copy**, **Check now**, **Resume**), so no custom focus management is needed.
  - [ ] 27.4 Extract `frontend/src/pages/ProjectDetail/sections/DnsRecordCard.tsx` from `DomainRow`'s instructions panel (`ProjectDomainsTab.tsx:~210`) and use it on both surfaces so they cannot drift. Stage (c) keeps the existing "leave it published so AWS can renew" purpose text (R3.7).
  - [ ] 27.5 **Refresh (R3.8):** `setInterval` at 20 s while any domain is non-terminal, cleared when all are terminal, skipped while `document.hidden`. No websocket — this state changes on a minutes-to-hours timescale.
  - [ ] 27.6 **`Sync now` → `Check now` (R3.1).** The button keeps its `POST /domains/apply` call, moves into the attachment card, and is relabelled *"Check now"* with the sub-line *"Progress continues on its own — this just looks sooner."* The old sync-status bar stays, unchanged, for the `supported: false` branches.
  - [ ] 27.7 **Tokens only:** `text`, `text-secondary`, `text-muted`, `border`, `card`, `surface`, `bg`; `primary-500` for the current stage; `success-*` for done; `warning-*` for "waiting on you"; `danger-*` for failed; `settingsBadgeCls` for the owner pills. Space Grotesk is inherited from the body — declare no font. **No `dockier-*` berry class anywhere in this feature**: that scale is legacy and reserved for severity states and marketing.
  - Files: `frontend/src/pages/ProjectDetail/sections/DomainAttachment.tsx` (new), `DnsRecordCard.tsx` (new), `ProjectDomainsTab.tsx`, `frontend/src/services/domains.ts`, `frontend/src/types/`
  - Verify: `cd frontend && pnpm lint` and `pnpm frontend:typecheck` — no new errors (`eslint-plugin-better-tailwindcss` enforces canonical classes). Then a manual pass on a real static project: traverse the whole card by keyboard only; confirm the `aria-live` region announces a stage change; confirm every status is distinguishable in greyscale; and confirm `grep -rn "dockier-" frontend/src/pages/ProjectDetail/sections/DomainAttachment.tsx` returns nothing.
  - _Requirements: 3.1, 3.6, 3.7, 3.8, 3.9, 3.10, 3.12, NFR1, NFR6_

---

## Final verification

- [ ] 28. Whole-repo gate
  - [ ] 28.1 `pnpm backend:typecheck` — zero new errors.
  - [ ] 28.2 `pnpm test` — all existing and new suites pass, including `static/__tests__/aws.test.ts` and `gcp.test.ts` **extended rather than rewritten** (R7.8).
  - [ ] 28.3 `cd frontend && pnpm lint` — no new errors for any file touched by Group 2 or Item 3.
  - [ ] 28.4 Confirm `git status` shows **no** new file under `supabase/migrations/` (R2 non-functional requirement: `0075` is sufficient).
  - [ ] 28.5 Confirm `GET /healthz` returns a byte-identical payload to the pre-change literal.
  - _Requirements: 7.8, 7.9, NFR2, 5.5_

---

## First-deploy checks (carried forward from the design's unverified assumptions)

These are not implementation tasks. Each is an assumption the design rests on that could not be verified from the repository, with the consequence of it being wrong. Check them on the first deploy of the group that depends on each.

| # | Assumption | Depends on | If it is wrong |
|---|---|---|---|
| F-1 | The **runtime `DATABASE_URL` role can read `supabase_migrations.schema_migrations`.** It was read successfully during the investigation using `MIGRATE_URL`; the runtime grant was never confirmed. | Group 3 (tasks 13-14) | `/readyz` reports `migrations: "unknown"` and fails open, which is by design but makes the check useless in production. Grant the read, or accept the diagnostic is blind. |
| F-2 | The **Supabase CLI records the bare numeric prefix as the ledger `version`.** Consistent with the ledger topping out at `0073` for the file `0073_*.sql`, but the full-filename-vs-prefix question was not re-derived. The manifest-vs-disk CI test catches drift against the *directory*, not against the *ledger format*. | Group 3 (task 12) | Every migration reports as pending on the first deploy. The extraction becomes a prefix match; nothing else changes. Check alongside F-1. |
| F-3 | **`PgBoss.schedule` fan-out across split service instances.** The typings confirm that a schedule's identity is `(name, key)`, so repeated installation is an upsert, but whether two `domains` instances produce exactly one sweep per interval was not verified against a running pg-boss. | Group 6 (task 22) | Bounded, not harmful: the schedule's `singletonKey` collapses two sweep jobs in the same minute, and if one slips through, both sweeps enqueue the same `domain-apply`, whose own `singletonKey` collapses them. Worth checking; not worth pre-engineering. |
| F-4 | **ACM discards a `PENDING_VALIDATION` certificate after 72 hours.** Taken from AWS's documented behaviour and used to set the AWS `awaiting_dns` deadline. Not observed in this account. | Group 6 (task 18) | The 72-hour budget is wrong in one direction or the other. Adjust the one table row in `deadlines.ts`. |
| F-5 | **The live `dockier-dev` IAM policy grants `cloudfront:UpdateDistribution` WITH aliases set.** A redeploy with *empty* alias parameters did not prove it. The first successful attach is the proof. | Group 4 (task 15), Group 6 (task 23) | The alias attach fails with `AccessDenied`, which task 1's `classifyAwsError` now reports as a permanent permissions gap naming the action and the document — so the failure is at least self-describing. Add the action to the policy. |
| F-6 | **The `provisioning` heuristic.** Resolving the validation record's own name to infer "AWS can see it" is the only available signal, but a split-horizon or aggressively caching resolver on the backend host could report it visible before AWS sees it, or vice versa. | Group 6 (task 23) | A stage label that is briefly optimistic, not a stuck attachment. |
| F-7 | **Integration-only behaviours that must not be faked into unit tests (R7.10):** real ACM issuance timing, real CloudFront propagation, a real TLS handshake on the custom domain, real Google-managed certificate provisioning, and the actual application of a migration. | all groups | The attachment is not "done" until one real domain goes live on each cloud. A mocked suite cannot know any of this and must not pretend to. |

Rows mid-flight at ship time need **no** repair (NFR5). Because `attach_started_at` and `issued_at` are re-stamped on every reconcile today, an existing non-terminal row's clocks read "a few minutes ago" regardless of how long it has really been waiting, so the first sweep starts its budget from the deploy and it gets one extra full deadline. That is the forgiving direction, and it self-corrects after one phase transition. No backfill migration is proposed.

---

## FLAGGED FOLLOW-UP — not planned work

**The ACM certificate leak.** Nothing in `backend/src` calls `acm:DeleteCertificate`. A changed domain set requests a new certificate (`aws.ts:255-259`), removing a domain deletes only the database row (`certs.ts:181-197`), and no code path anywhere deletes the certificate — so unused `PENDING_VALIDATION` certificates accumulate in `us-east-1` until the account hits its ACM quota, at which point `aws.ts:323-331` tells the user to clean up by hand. Task 15 documents the consequence (R6.8); **this plan does not fix it.**

**Is it nearly free alongside Group 6's poller? Partly — the honest answer is "cheaper than before, not free."** The hard part of a cleanup has always been ordering and observation: ACM refuses to delete a certificate a distribution is using, so the alias must come off first and the distribution needs 5-20 minutes to finish before the delete can succeed. The sweep is exactly the "start it, observe it later" scaffolding that makes that tractable, and it already visits every project with in-flight certificate work. What is still needed beyond the sweep:

- `acm:DeleteCertificate` added to the policy in task 15 — a user-visible IAM change, so it cannot ride along silently.
- A way to find the superseded ARN after a swap. The old value is overwritten on the row, so discovery has to go through `ListCertificates` + `ListTagsForCertificate` filtered to this project and excluding the current ARN. Both permissions already exist.
- An age guard, so a certificate created seconds ago by a concurrent apply is never deleted.

**Sizing: roughly half a day of implementation plus a day of careful verification against a live account**, because the failure mode of getting it wrong is deleting a certificate that is serving traffic.

**Recommendation:** its own small spec after this one ships, when the sweep is proven in production. It is not one of the five approved items — flagged for the user to decide.

---

## Notes

- **D1 and D2 are still open (SIGN-OFF REQUIRED).** Tasks 6, 7, 8 need D1; tasks 18-23 and 26 need D2. Everything else lands without either.
- **No new dependency.** Group 6 uses the existing pg-boss worker factory, Group 3 the existing Supabase client and the existing `pg.Client` precedent, Item 3 the existing shadcn/ui primitives, `lucide-react` and the tokens in `frontend/src/index.css`.
- **No new migration, and no edit to an applied one.** `0075` already carries every column and both indexes; the apex ack lives in the existing `projects.settings` JSONB; the phase clock reuses `attach_started_at`.
- **No new `verification_state` value.** `provisioning` becomes reachable on AWS and `timed_out` becomes reachable on both clouds; both are already in the `0075` CHECK and in `certVerificationStateSchema`.
- **The legacy VPS and Dokploy branches must behave exactly as today.** The one shared change is `isRetryableFailure`, where the structured flag is `undefined` on those paths so the legacy substring rule still applies verbatim.
- **No job may block on a CDN update.** A CloudFront distribution update takes 5-20 minutes and `config-apply` jobs expire in 300 s; the update is started and observed on a later invocation.
- **`AGENTS.md` needs two amendments** when the work lands: the apex sentence (per D1) and a note on the widened meaning of `attach_started_at` (task 20.4).
- Phase-2-style extras — a TLS handshake probe, wildcard domains, IDN conversion, GCP IAM scope documentation, and a project-keyed rate-limit extractor — are deliberately out of scope and are not to be added opportunistically.
