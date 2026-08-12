# Project Detail — information architecture

**AIL — task C1.** The decision C2, C3 and C4 implement against.

The sidebar pivot fixed overflow, not count. Twelve tabs in a column are still twelve peers, and only
two carry counts — neither of them Security or Deployments. This document decides the grouping, the
counts, and the posture line.

---

## The five clusters

| Cluster | Tabs | The question it answers |
|---|---|---|
| **Understand** | Overview · Activity | What is this, and what changed? |
| **Risk** | Security · Sensitive Data · Dependencies | What is wrong with it? |
| **Ship** | Deployments · Commands | How does it get out? |
| **Runtime** | Processes · Network · Domains · Observe | Is it healthy right now? |
| **Configure** | Settings | — |

Two departures from the candidate grouping in the brief:

**Dependencies moves from Understand to Risk.** The tab renders `VULN_STYLES` with
critical/high/medium/low severity — it is a vulnerability surface wearing an inventory's clothes. A
user who opens it is asking "what will bite me", not "what libraries do we use".

**Commands moves from Runtime to Ship.** Running a command is a deliberate act of changing the
deployed app — the same intent as a deploy, and per `blast-radius-tiers.md` some commands are
destructive. It belongs next to Deployments, not next to monitoring.

---

## Ruling 1 — Risk stays three tabs, not one Findings surface

**Decision: three tabs, one cluster heading.**

The merge is tempting and wrong, for three reasons grounded in the code:

1. **Different permissions.** `isMainTabVisible` gates Security on `scan:view`, while Sensitive Data
   and Dependencies need only `project:view`. A merged surface either leaks scan data to users
   without `scan:view`, or renders a third of itself empty with no explanation of why.
2. **Different lifecycles.** Security is a *history of scan runs* — each with a provider, a status
   and live progress. Sensitive Data is an annotation over a parsed schema. Dependencies is an
   inventory refreshed with the repo analysis. One table cannot hold three refresh models without
   inventing a fourth.
3. **The complaint was legibility, not count.** "Twelve peers" is fixed by grouping and counts,
   which C2 delivers. Merging three tabs into one would reduce the number to ten and lose the
   distinctions that make each findable.

The cluster heading **Risk** plus counts on all three gives the "one risk surface" read the critique
asked for, at a fraction of the cost and none of the loss.

---

## Ruling 2 — Runtime stays on this page, but hides until there is a runtime

**Decision: keep all four tabs here; render the entire Runtime cluster only once the project has at
least one successful deployment.**

Splitting them to a second page is wrong: in Dockier one project *is* one deployed app, and the tabs
are reached during incidents, when an extra navigation level is the last thing anyone wants.

But they are meaningless before the first deploy. Processes, Network, Domains and Observe on a
freshly connected repository are four dead ends. Gating them on `recentDeploys.some(d => d.status
=== "success")` removes **four of twelve tabs** from the nav for every project that has not shipped
yet — which is the exact moment a user is most likely to be lost.

This makes the nav answer a question it currently cannot: *has this thing ever run?*

---

## Ruling 3 — a count is an alarm, not an inventory

The current counts show totals. A total is only useful when zero is the good value; otherwise it is
decoration that trains the eye to ignore the badge.

**Every count in this nav counts things that need action.** Never a total.

| Tab | Counts | Source | Tone |
|---|---|---|---|
| **Security** | `errors + warnings` from the latest scan. Not `totalFindings` — infos are not action. | `recentScans[0].summary` | `danger` if `errors > 0`, else `warning` |
| **Sensitive Data** | Detected sensitive fields | `uploadedSensitiveData` / `aiSensitiveResult`, already local to `ProjectDescription` | `caution` |
| **Dependencies** | Outdated **or** vulnerable — not the total dependency count | `analysis.dependencies`, already a prop | `warning` |
| **Deployments** | Nothing. A number here would compete with the posture line, which already states the last result. | — | — |
| Overview · Activity · Commands · Settings | Nothing. Nothing here is ever "outstanding". | — | — |

### Runtime tabs carry no counts — and why

Processes, Network, Domains and Observe each fetch their own data **inside the tab component**
(`ProjectProcessesTab` holds its own `processes`/`jobs` state; Observe holds heartbeats). Nothing in
`ProjectDetail` knows how many processes are stopped or how many heartbeats have missed.

Sourcing those four badges means four extra requests on every project page load, for information
almost always equal to zero. **Not worth it.** They stay uncounted until a single
`GET /projects/:id/summary` endpoint exists — which is worth doing, but is its own task, not a
prerequisite for C2.

Stating this here so C2 does not quietly promise badges it cannot fill.

---

## Ruling 4 — the posture line

Three clauses beneath the project title, each a link to the tab that resolves it. It **replaces**
"Created &lt;date&gt;" as the primary secondary line; the creation date moves into Settings, where a
date belongs.

```
Deployed 2h ago · 3 critical findings · Running on ECS Fargate
     ↓ Deployments        ↓ Security            ↓ Settings
```

| Clause | Good | Bad | Missing |
|---|---|---|---|
| Last deploy | `Deployed 2h ago` | `Deploy failed 2h ago` (danger) | `Never deployed` |
| Open critical findings | `No critical findings` | `3 critical findings` (danger) | `Not scanned yet` |
| Infra state | `Running on ECS Fargate` | `Infrastructure torn down` (warning) | `No infrastructure` |

**It degrades honestly.** A failed fetch reads *"Deploy status unavailable"* — never
*"Never deployed"*, and never *"No critical findings"*. Asserting safety from an error is the single
worst thing this line could do, and it is the reason C3 depends on D2: the components must be able to
tell empty from failed before this line can claim anything.

---

## What each downstream task inherits

**C2 — grouped sidebar with counts.**
`ProjectDescription` currently receives pre-rendered `securityPanel` / `deploysPanel` ReactNodes, not
data. It has `analysis` but **not** `recentScans` or `recentDeploys`. C2's first move is threading
those two arrays down as props — without it, the Security and Deployments counts cannot be computed
at all. Counts use the `danger`/`caution`/`warning` tokens from the signal ramp
(`palette-token-mapping.md`), never ad-hoc colour. Group headings are not tabs and must not be
focusable; the tablist keeps its roving tabIndex across group boundaries.

**C3 — posture line.** Blocked on D2 as above. The line it replaces lives at
`ProjectHeader.tsx:129-133` and does double duty: alongside `Created <date>` it renders the inline
rename feedback (`nameSaving`, `nameError`). That feedback must survive the swap — it is the only
confirmation a user gets that a rename took, and it belongs next to the title it describes.

**C4 — sub-tab state in the URL.** Cluster names are **display-only** and never enter the URL. The
route stays `?tab=observe&section=logs` — a flat pair. Putting clusters in the path would make every
future regrouping a breaking change to saved links, which is precisely the cost this document is
trying not to impose twice.
