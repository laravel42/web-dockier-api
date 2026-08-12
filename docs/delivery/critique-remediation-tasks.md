# Critique remediation — task breakdown

Source: dual-agent `/impeccable critique` of the Project Detail surface, run twice.
Snapshots in `frontend/.impeccable/critique/`. Score trend **19/40 → 22/40**.

**Linear project:** [Dockier App — UX Parity & Hardening](https://linear.app/ailterego/project/dockier-app-ux-parity-and-hardening-fa524631fcdd)

Format, agent roles, quota units and branch naming follow
[`multi-agent-playbook.md`](./multi-agent-playbook.md). Every task below is written to be
pasted directly as a Linear issue body.

**Routing rule applied throughout:** Cursor implements; Claude plans, audits, decides and
writes copy; OpenAI scaffolds tests. No Cursor session is spent on a read-only audit.

---

## Dependency graph

```
A1 ─┬─> A2 ──> A5
    └─> A4
A3 ─────> A2                    (ConfirmModal must be correct before it is adopted widely)

C1 ─┬─> C2
    ├─> C3
    └─> C4

F4 ─┬─> F5
    └─> B5                      (one palette decision serves both)

B1 ─> B6
D1 ─> D2

F1, F2, F3, F6, F7, F8          (independent — no blockers, ship anytime)
```

Roots with no blocker: **A1, A3, C1, D1, E1, E3, F1, F2, F3, F4, F6, F7, F8, B1, B2, B3, B4.**

---

# EPIC A — Destructive actions carry no guardrails

`epic` `backend` `ux` · Critique P1-1 · **highest severity in the report**

Eight irreversible actions have no confirmation, while deleting a *process configuration row*
requires a modal. Ceremony is currently allocated by how recently someone touched a component,
not by consequence.

---

## A1 — Define the blast-radius tier contract

### Outcome
A written three-tier classification and a table assigning every mutating action on Project Detail to a tier, so implementation tasks stop making case-by-case judgment calls.

### Acceptance criteria
- [ ] Tiers defined: **reversible** (no ceremony), **disruptive** (confirm naming the object), **destructive** (confirm + typed acknowledgement or Undo).
- [ ] Every mutating action on the surface is listed with file:line and assigned a tier — minimum: delete domain, delete SSL cert, delete security rule, delete credential, delete redirect rule, delete heartbeat, clear log, delete command record, run shell command, delete process, teardown infra, delete project.
- [ ] Each destructive tier entry states the real-world consequence in one sentence ("traffic to this domain stops immediately").
- [ ] Recorded in `DESIGN.md` or a sibling doc so it survives as a rule, not a ticket.

### Agent
claude

### Est. Cursor quota
0

### Files (if known)
- `frontend/DESIGN.md`
- read-only: `frontend/src/pages/ProjectDetail/sections/*.tsx`

### Blocks
A2, A4

---

## A3 — ConfirmModal resolves before it closes

### Outcome
A failed destructive action is visible to the user instead of the modal closing confidently on a rejected promise.

### Acceptance criteria
- [ ] `ConfirmModal` awaits `onConfirm()` and only closes on success.
- [ ] In-flight state disables the confirm button and shows progress.
- [ ] A rejection keeps the modal open and surfaces the error message in place.
- [ ] `handleDelete` in `ProjectProcessesTab` (currently no catch) propagates errors rather than swallowing them.
- [ ] Unit test covers the rejection path.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/components/ConfirmModal.tsx:18`
- `frontend/src/pages/ProjectDetail/sections/ProjectProcessesTab.tsx:212-215`

### Blocks
A2 — do not roll ConfirmModal out more widely until it reports failure correctly.

---

## A2 — Route every destructive action through ConfirmModal

### Outcome
No irreversible action on Project Detail fires from a single unguarded click.

### Acceptance criteria
- [ ] Confirmation added, per the A1 tier table, to: delete custom domain (`ProjectDomainsTab.tsx:150-157`), delete SSL certificate (`:399-405`), delete security rule (`ProjectNetworkTab.tsx:148-155`), delete credential (`:230-236`), delete redirect rule (`:617-625`), delete heartbeat (`ProjectObserveTab.tsx:170-177`), clear production log (`ProjectObserveTab.tsx:359-368`), delete command record (`ProjectCommandsTab.tsx:337-346`).
- [ ] Each confirm names the specific object, not the type ("Delete `api.acme.com`?").
- [ ] Each states the consequence, not just the action.
- [ ] Destroyed-forensics cases (log clear) are labelled destructive per A1 and worded accordingly.
- [ ] Success emits a toast; where the API supports restore, the toast offers Undo.

### Agent
cursor

### Est. Cursor quota
1 session

### Depends on
A1 (tier assignments), A3 (modal must report failure)

---

## A4 — Command runner confirms before executing on production

### Outcome
Arbitrary shell execution against the production server requires an explicit confirmation that echoes exactly what will run, where.

### Acceptance criteria
- [ ] Enter no longer submits directly; a confirm step intervenes.
- [ ] The confirm echoes the exact command string and the target project/environment.
- [ ] Execution context (user, working directory, timeout) is restated **inside** the confirm, not only in the paragraph above the field.
- [ ] Commands matching a destructive pattern (`rm`, `drop`, `truncate`, `>`), get the destructive-tier treatment from A1.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectCommandsTab.tsx:232-249`

### Depends on
A1

---

## A5 — Action-menu dismissal and keyboard parity

### Outcome
Every row action menu closes on Escape and on outside click, consistently.

### Acceptance criteria
- [ ] Escape closes all action menus (currently none do).
- [ ] The Domains row menu gains an outside-click handler (it currently has none and stays open until an action is taken).
- [ ] Menus with `role="menu"` implement arrow-key movement; menus without the role drop it consistently.
- [ ] Destructive entries are visually separated from `Copy ID`-class entries.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectProcessesTab.tsx:182-188, 229-261, 357-379`
- `frontend/src/pages/ProjectDetail/sections/ProjectDomainsTab.tsx:42, 95-158`

### Depends on
A2 (shares the same menus; sequence to avoid conflicts)

---

# EPIC B — Accessibility remediation

`epic` `ux` · Critique P1-2 · blocks the persona "Sam" from completing primary flows

---

## B1 — Replace the two hand-rolled dialogs with the shared Modal

### Outcome
Every dialog on the surface traps focus, restores it, locks scroll and closes on Escape.

### Acceptance criteria
- [ ] `ProjectObserveTab.tsx:563-575` and `ProjectCommandsTab.tsx:389-401` use `components/Modal.tsx`.
- [ ] The `stopPropagation()` on inner keydown that currently swallows Escape is removed.
- [ ] Focus is trapped on open and restored to the trigger on close.
- [ ] Body scroll locks while open.
- [ ] `VulnModal` (`ProjectDescription.tsx:590`) gains `aria-labelledby`.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Blocks
B6

---

## B2 — Associate every form label with its control

### Outcome
Screen readers announce field names instead of a run of unnamed edit fields.

### Acceptance criteria
- [ ] `components/ui/Input.tsx` generates a stable id (`useId`) when none is supplied.
- [ ] All 11 fields in the Create Process form carry `htmlFor`/`id` or wrap their control.
- [ ] The same for the Observe form fields.
- [ ] Verified: no `<label>` on this surface lacks an association.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/components/ui/Input.tsx:5-16`
- `frontend/src/pages/ProjectDetail/sections/ProjectProcessesTab.tsx:538-700`
- `frontend/src/pages/ProjectDetail/sections/ProjectObserveTab.tsx:253-282`

---

## B3 — Accessible names for icon-only and unlabelled controls

### Outcome
No control on the surface is announced as "button" with no name — least of all the destructive one.

### Acceptance criteria
- [ ] The log-type `<select>` gains an accessible name.
- [ ] The three icon-only log controls gain `aria-label` (currently `title` only), including the log-clear control.
- [ ] An audit pass confirms no remaining icon-only control lacks a name.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectObserveTab.tsx:348-356, 359-386`

---

## B4 — Promote the Observe section nav to a real tablist

### Outcome
Two navs that look identical behave identically for assistive technology.

### Acceptance criteria
- [ ] The Observe nav gains `role="tablist"`/`role="tab"`, `aria-selected`, `aria-controls`, roving `tabIndex`.
- [ ] It uses the shared `useTabListKeyboard` hook with the orientation matching its rendered axis.
- [ ] Its markup matches `ProjectSettingsTab.tsx:52-73`, which is already correct.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectObserveTab.tsx:672-687`

---

## B5 — Make the severity palette theme-aware

### Outcome
Severity badges meet contrast in both themes, and severity is never carried by colour alone.

### Acceptance criteria
- [ ] Severity styling maps to `--color-danger/warning/success` scales instead of hardcoded `text-red-300` / `orange-300` / `amber-300` / `emerald-300` over `bg-*-500/30`.
- [ ] Measured contrast ≥ 4.5:1 on both the dark and light card surfaces.
- [ ] `++`/`--` diff indicators carry a textual or iconographic cue in addition to colour.
- [ ] DESIGN.md records the severity ramp as tokens.

### Agent
cursor

### Est. Cursor quota
1 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectDescription.tsx:363-368, 536-547`
- `frontend/src/pages/ProjectDetail/sections/RecentCommits.tsx:138-139`
- `frontend/src/pages/ProjectDetail/sections/ContributorsGrid.tsx:82-83`

### Depends on
F4 — one palette decision covers both tasks; do not resolve severity tokens twice.

---

## B6 — Accessibility regression tests

### Outcome
The dialog, label and tablist fixes cannot silently regress.

### Acceptance criteria
- [ ] Tests assert: Escape closes each dialog, focus returns to trigger, every form control has an accessible name, each tablist exposes `aria-selected`.
- [ ] Runs in CI on the existing Vitest setup.
- [ ] A deliberately broken fixture fails the suite (proving the assertions are armed).

### Agent
openai (scaffold) → cursor (wire)

### Est. Cursor quota
0.5 session

### Depends on
B1, B2, B3, B4

---

# EPIC C — Navigation expresses no point of view

`epic` `ux` · Critique P1-3

The sidebar pivot fixed overflow, not count. Twelve peers in a column are still twelve peers,
and only two carry counts — neither of them Security or Deployments.

---

## C1 — Decide the information architecture

### Outcome
A decided grouping of the twelve tabs into 3–5 named clusters, plus the set of counts each tab should carry.

### Acceptance criteria
- [ ] Twelve tabs assigned to named clusters with a written rationale (candidate: Understand / Secure / Ship / Operate / Configure).
- [ ] Decides the open question: are Sensitive Data + Dependencies + Security three tabs or one **Findings** surface?
- [ ] Decides whether server-operations concerns (Processes, Network, Domains, Observe) belong on this page at all, or are a second page.
- [ ] Specifies which tabs carry a count and what each counts.
- [ ] Specifies the contents of a posture line: last deploy result, open critical findings, infra state.

### Agent
claude

### Est. Cursor quota
0

### Blocks
C2, C3, C4

---

## C2 — Implement grouped sidebar with counts

### Outcome
The nav shows structure and risk at a glance instead of twelve equal nouns.

### Acceptance criteria
- [ ] Clusters rendered with visible group headings per C1.
- [ ] Counts on every tab C1 specifies, sourced from data already in the parent (`recentScans[].summary`, `recentDeploys[0].status`).
- [ ] Counts use the severity tokens from B5, not ad-hoc colours.
- [ ] Active tab scrolls into view when deep-linked on narrow viewports.
- [ ] `aria-orientation` reflects the rendered axis (see F3).

### Agent
cursor

### Est. Cursor quota
1 session

### Depends on
C1; coordinate with B5 (count colours) and F3 (orientation)

---

## C3 — Posture line under the project title

### Outcome
The landing view answers "what needs me" before the user picks a tab.

### Acceptance criteria
- [ ] A status line beneath the title states last deploy result, open critical findings, and infra state.
- [ ] Each element links to the tab that resolves it.
- [ ] Degrades honestly when data is missing — never asserts "no findings" on a failed fetch (see D2).
- [ ] Replaces the current "Created <date>" as the primary secondary line, or sits above it.

### Agent
cursor

### Est. Cursor quota
1 session

### Depends on
C1, D2 (must distinguish empty from error before it can claim posture)

---

## C4 — Sub-tab state in the URL

### Outcome
"Observe → Logs → Nginx Error" is a linkable address.

### Acceptance criteria
- [ ] Sub-tab state moves from `useState` to a URL param in Observe, Settings and Processes.
- [ ] Deep links restore both main tab and sub-tab.
- [ ] Permission-hidden sub-tabs redirect to the first visible one with `replace`, matching the existing main-tab behaviour.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectObserveTab.tsx:659`
- `frontend/src/pages/ProjectDetail/sections/ProjectSettingsTab.tsx:31`
- `frontend/src/pages/ProjectDetail/sections/ProjectProcessesTab.tsx:852`

### Depends on
C1 (cluster/route naming)

---

# EPIC D — The surface has no live state

`epic` `backend` `ux` · Critique P1-4

---

## D1 — Subscribe deploys and scans to live updates

### Outcome
A deploy that finishes while the user watches updates the page.

### Acceptance criteria
- [ ] Deploys and scans subscribe via the existing `useWebSocketManager`, or poll while any record is in a non-terminal state and stop when all settle.
- [ ] A live status indicator appears beside the project name while a deploy is in flight.
- [ ] Polling interval is justified against the Commands tab's existing 3s cadence rather than invented.
- [ ] No polling occurs when everything is terminal.

### Agent
cursor

### Est. Cursor quota
1 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/hooks/useProjectDeploys.ts:29-52`

### Blocks
D2

---

## D2 — Distinguish "failed to load" from "never happened"

### Outcome
A network error stops telling the user their project has never been deployed.

### Acceptance criteria
- [ ] `.catch(() => {})` at `useProjectDeploys.ts:38` and `.catch(() => setRecentScans([]))` at `:51` are replaced with an error state.
- [ ] `RecentDeploys` and `RecentScans` render a distinct error state with Retry, separate from their empty state.
- [ ] The four silent catches in Observe (`:95, :111, :325, :433`) surface a message.
- [ ] Test: a rejected fetch renders the error state, not the empty state.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Depends on
D1 (same hook; sequence to avoid conflicts)

---

## D3 — Deploy empty state gets the CTA the scan one already has

### Outcome
The higher-value first action stops being the one without a button.

### Acceptance criteria
- [ ] `RecentDeploys` empty state carries a primary action opening the deploy wizard.
- [ ] Copy no longer says "Use Deploy above" — "above" is off-screen once the user has scrolled to the panel.
- [ ] Matches the pattern already in `RecentScans.tsx:53-58`.

### Agent
cursor

### Est. Cursor quota
0.5 session

---

# EPIC E — AI writes to the user's repository unannounced

`epic` `ux` · Critique P1-5 · contradicts a documented PRODUCT.md promise

---

## E1 — Diff preview before Fix with AI opens a pull request

### Outcome
The diff preview PRODUCT.md promises exists in the flow.

### Acceptance criteria
- [ ] Fix with AI generates, then shows summary, changed-file list and diff.
- [ ] The pull request is created only on an explicit second action ("Create pull request").
- [ ] Target branch is stated before the write.
- [ ] Cancel discards without touching the repository.

### Agent
cursor

### Est. Cursor quota
1 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/ProjectDetail.tsx:64-78`
- `frontend/src/pages/ProjectDetail/modals/IssueDetailModal.tsx:151-158`

---

## E2 — Comment preview before Review with AI posts publicly

### Outcome
Review comments are seen by their author before a teammate sees them.

### Acceptance criteria
- [ ] Generated comments are shown with count and severities before posting.
- [ ] Posting requires an explicit "Post N comments to PR #X".
- [ ] Individual comments can be dropped from the batch before posting.

### Agent
cursor

### Est. Cursor quota
1 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/ProjectDetail.tsx:83-94`
- `frontend/src/pages/ProjectDetail/modals/PRDetailModal.tsx:140-147`

---

## E3 — Disclose AI scope before the click, not in the spinner

### Outcome
"Posts comments directly on the PR" is readable before it is true.

### Acceptance criteria
- [ ] The disclosure currently at `PRDetailModal.tsx:133` (in-flight text) moves to helper text beside the trigger.
- [ ] "Close Issue" is renamed or confirmed so it no longer collides with the adjacent "Cancel" meaning "dismiss dialog".
- [ ] Copy states which model acts and what it can write.

### Agent
claude

### Est. Cursor quota
0

### Files (if known)
- `frontend/src/pages/ProjectDetail/modals/PRDetailModal.tsx:133`
- `frontend/src/pages/ProjectDetail/modals/IssueDetailModal.tsx:159-170`

---

# EPIC F — Design-system drift and dead code

`epic` `ux` · From detector coverage-limit greps and critique minor observations

---

## F1 — `scrollbar-none` is not a real class

### Outcome
Tab strips actually hide their scrollbar.

### Acceptance criteria
- [ ] All 4 usages replaced with `.scrollbar-hide` (the class this project actually defines).
- [ ] Verified: `.scrollbar-none` appears nowhere; `.scrollbar-hide` appears in the built CSS.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `ProjectDescription.tsx:986`, `ProjectSettingsTab.tsx:52`, `ProjectObserveTab.tsx:672`, `ProjectProcessesTab.tsx:918`

### Notes
Regression introduced when the tab nav was pivoted to a sidebar; the class was copied from the pre-existing strip onto three more.

---

## F2 — The global focus rule is unlayered and doubles up

### Outcome
Controls that supply their own ring stop rendering a native outline as well.

### Acceptance criteria
- [ ] The focus-visible rule moves into `@layer base` so Tailwind's `.outline-none` in `@layer utilities` can override it.
- [ ] The four controls pairing `outline-none` with their own ring render one indicator, not two.
- [ ] Controls with no ring of their own still receive the base outline.
- [ ] The inline comment claiming components override the rule is corrected — it currently states the opposite of the cascade's behaviour.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/index.css:352-372`

---

## F3 — `aria-orientation` is hardcoded on a responsive tablist

### Outcome
The announced orientation matches the rendered axis at every width.

### Acceptance criteria
- [ ] `aria-orientation` is derived from the active breakpoint rather than fixed to `vertical`.
- [ ] The `"both"` keyboard orientation remains (it is correct and deliberate).
- [ ] `role="tabpanel"` containers that scroll receive `tabIndex={0}` so a keyboard user can scroll them.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `frontend/src/pages/ProjectDetail/sections/ProjectDescription.tsx:988, 1026-1031`

---

## F4 — Decide token mapping for the raw Tailwind palette

### Outcome
A decided mapping from 85 unsanctioned palette classes to system tokens, and a ruling on which are legitimate exceptions.

### Acceptance criteria
- [ ] Each of the 85 usages is classified: map to token / sanctioned exception / delete.
- [ ] The categorical language-bar palette and ANSI log palette are confirmed as sanctioned (DESIGN.md already covers the latter for log **content**; note the spinner at `PullLogModal.tsx:19` is chrome and excluded).
- [ ] Severity ramp decided once, for both this task and B5.
- [ ] DESIGN.md updated with whatever tokens the mapping introduces.

### Agent
claude

### Est. Cursor quota
0

### Blocks
F5, B5

---

## F5 — Replace raw palette values with tokens

### Outcome
Colour lives in the token system, including the values a detector cannot see.

### Acceptance criteria
- [ ] The 85 Tailwind palette classes are resolved per F4.
- [ ] The 17 undeclared hex values in bare array literals move to tokens: `settings/shared.tsx:5-8` (11), `UserJourneyTree.tsx:18-19` (10), `ProjectAvatar.tsx:5` (1).
- [ ] The five near-white light-theme fills hardcoded into a dark-first system are removed or made theme-aware.
- [ ] Detector re-run on `src` shows no new colour findings.

### Agent
cursor

### Est. Cursor quota
1 session

### Depends on
F4, F7 (UserJourneyTree may be deleted rather than fixed)

---

## F6 — `shadow-sm` is a third elevation value

### Outcome
The system has two elevations, as DESIGN.md states, not three.

### Acceptance criteria
- [ ] The 5 `shadow-sm` usages resolve to `--shadow-xs`, `--shadow-overlay`, or none.
- [ ] `shadow-sm` is added to the banned list in DESIGN.md alongside lg/md/xl.
- [ ] No utility resolving to Tailwind's stock shadow remains.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Files (if known)
- `ui/Button.tsx:17`, `ui/ToggleSwitch.tsx:28`, `StepEnvironment.tsx:80`, `StepProvider.tsx:58`, `UserJourneyTree.tsx:26`

---

## F7 — Delete orphaned components

### Outcome
267 lines of unreachable code stop being maintained and stop skewing audits.

### Acceptance criteria
- [ ] `DataFlowDiagram.tsx` (98 lines) and `UserJourneyTree.tsx` (169 lines) are confirmed at zero importers and removed.
- [ ] If either is intended for future use, it is documented instead of deleted.
- [ ] Typecheck and build pass.

### Agent
cursor

### Est. Cursor quota
0.5 session

### Blocks
F5 (UserJourneyTree holds 10 of the undeclared hex values)

---

## F8 — The playbook's UX checklist cites a superseded design system

### Outcome
`multi-agent-playbook.md` stops routing work against the retired Berry system.

### Acceptance criteria
- [ ] The UX alignment checklist referencing Bely/Soleil, Typekit and `dockier-*` red as the primary brand is corrected to the current system: graphite + sand/ochre, Space Grotesk, berry demoted to severity and marketing accents.
- [ ] The `../web-berry/docs/design-guidelines.html` reference is marked superseded, matching the correction already made in `AGENTS.md`.
- [ ] `frontend/DESIGN.md` is named as the UX source of truth.

### Agent
claude

### Est. Cursor quota
0

### Files (if known)
- `docs/delivery/multi-agent-playbook.md`

---

# EPIC G — Keep it fixed

`epic` `testing`

---

## G1 — Run the design detector in CI

### Outcome
Design-system drift fails the build instead of accumulating until the next audit.

### Acceptance criteria
- [ ] `detect.mjs` runs over `frontend/src` in CI.
- [ ] Exit code 2 fails the job; documented exceptions are configured in `.impeccable/config.json` rather than ignored ad hoc.
- [ ] Baseline recorded so only new findings fail.

### Agent
cursor

### Est. Cursor quota
0.5 session

---

## G2 — Close the browser-evidence gap

### Outcome
The seventeen browser-only rules that have never run against this product get evaluated.

### Acceptance criteria
- [ ] A Playwright job renders Project Detail at 375 / 768 / 1440 and runs the detector's browser rules.
- [ ] Covers contrast, occlusion, overflow, line-length, heading rhythm and nested cards — none of which the CLI scan can see.
- [ ] Runs against both themes.
- [ ] Failures report with a screenshot.

### Agent
openai (scaffold) → cursor (wire)

### Est. Cursor quota
1 session

### Notes
Both critique runs were static-only: no browser automation was available, so every rendered-DOM rule is currently unverified. This is the largest remaining blind spot in the report.

---

## Summary

| Epic | Tasks | Cursor sessions | Claude | OpenAI |
|---|---|---|---|---|
| A — Destructive actions | 5 | 2.5 | 1 | — |
| B — Accessibility | 6 | 3.5 | — | 1 |
| C — Navigation IA | 4 | 2.5 | 1 | — |
| D — Live state | 3 | 2.0 | — | — |
| E — AI previews | 3 | 2.0 | 1 | — |
| F — System drift | 8 | 3.5 | 2 | — |
| G — Keep it fixed | 2 | 1.5 | — | 1 |
| **Total** | **31** | **17.5** | **5** | **2** |

17.5 Cursor sessions against the playbook's 8–12 per sprint puts this at roughly two sprints.

**Suggested sprint 1** — everything with no blocker and real severity:
A1, A3, A2, A4 · B1, B2, B3, B4 · F1, F2, F3, F7 · D1, D2

**Suggested sprint 2** — the decisions and what they unblock:
C1, C2, C3, C4 · F4, F5, F6, F8 · B5, B6 · E1, E2, E3 · A5, D3 · G1, G2
