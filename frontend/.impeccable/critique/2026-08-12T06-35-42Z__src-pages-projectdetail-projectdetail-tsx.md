---
target: ProjectDetail page
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
timestamp: 2026-08-12T06-35-42Z
slug: src-pages-projectdetail-projectdetail-tsx
---
Method: dual-agent (Assessment A design review · Assessment B detector evidence, run in isolation; both barred from reading the prior snapshot)

## Design Health Score

| # | Heuristic | Score | Δ | Key Issue |
|---|-----------|-------|---|-----------|
| 1 | Visibility of System Status | 2 | = | Deploys/scans fetched once, never refresh, on a product whose deploys are long-running |
| 2 | Match System / Real World | 3 | = | Security / Sensitive Data / Dependencies split one mental model across three peers |
| 3 | User Control and Freedom | 2 | = | Two hand-rolled dialogs are keyboard traps; no dropdown closes on Esc |
| 4 | Consistency and Standards | 2 | +1 | Tab treatments unified, but two identical-looking navs where only one is a real tablist |
| 5 | Error Prevention | 1 | -1 | Eight destructive actions with no confirm, incl. wiping a production log and arbitrary shell exec |
| 6 | Recognition Rather Than Recall | 3 | +1 | All twelve tabs now visible at once; only 2 of 12 carry counts |
| 7 | Flexibility and Efficiency | 2 | = | No shortcuts, no bulk actions, sub-tab state still unlinkable |
| 8 | Aesthetic and Minimalist | 3 | +1 | Restrained and consistent; six KPIs squeezed 3-across in a half-width card |
| 9 | Error Recovery | 2 | = | Silent catches turn network failure into a false "never happened" |
| 10 | Help and Documentation | 2 | +1 | One doc link on a twelve-tab surface; InfoIcon beside 11 labels does nothing |
| **Total** | | **22/40** | **+3** | **Acceptable — significant improvements needed** |

No heuristic scored n/a; applicable maximum 40.

Both P0s from the previous run are resolved and absent from this one. Error Prevention fell a point not through regression but through deeper inspection: the second pass enumerated eight unconfirmed destructive actions the first pass had not reached.

## Design Specificity Verdict

**Partially specific — the components are authored for this product, the composition is not.**

Genuinely Dockier: the language-breakdown bar with per-segment tooltips and a role="img" summary; the personal/sensitive/secret vocabulary with a hashed-vs-plaintext credential distinction; OSV vulnerability chips inline in a dependency row; the hairline-lattice KPI strip.

Category-interchangeable: the skeleton. Back-link, title with two right-aligned buttons, two summary cards, one large tabbed card. Swap the twelve labels for Billing / Invoices / Members / Webhooks and this is any B2B admin product.

The structure still does not express what the product is for. PRODUCT.md's mechanism is "the unbroken path from repository to shipped fix"; the page renders it as twelve peers of identical weight, with Security carrying the same visual authority as Domains. The signature eight-section AI analysis PRODUCT.md describes is not on the page at all — Overview is a BlockNote editor over README.md, and refreshAnalysis is wired to nothing.

**Deterministic scan: 0 findings** across 54 ProjectDetail files and 7 shared components, down from 71. Verified genuine rather than a skipped engine via four independent checks including controlled probes that fired correctly (font, colour, radius, font-size) inside the same scan tree. The typography.scale block added to DESIGN.md is honoured — 20px and 14px reach the resolved allowlist from the scale alone.

**Visual overlays:** none. No browser automation tool is exposed in this session, verified by tool search. Seventeen browser-only rules (contrast, occlusion, overflow, line-length, heading rhythm, nested cards and others) were therefore never evaluated; the clean CLI result covers static rules only.

## What's Working

**The tablist is careful, correct engineering.** Roving tabIndex, aria-controls/aria-labelledby paired through shared helpers, Arrow/Home/End with wraparound, and tab state in the URL so any tab is deep-linkable and survives refresh. The "both" keyboard orientation is a considered call with its reasoning written down: the axis changes with the viewport, so accepting either is a superset of the APG pattern.

**Degraded states are designed, not accidental.** The sensitive-data scan falls back from the AI analyzer to the static regex parser and still returns useful fields. The dropzone is a real button wrapping an sr-only input, with the reason recorded in place.

**The permission model is honest and self-healing.** Every tab is gated, and when permissions exclude a deep-linked tab the component redirects to the first visible one with replace rather than dead-ending.

## Priority Issues

### P1-1 - Guardrails are inversely proportional to blast radius
Eight destructive actions have no confirmation: delete custom domain, delete SSL certificate, delete security rule, delete credential, delete redirect rule, delete heartbeat, wipe a production log, delete command record. Arbitrary shell execution on the production server submits on Enter with no confirm. Meanwhile deleting a *process configuration row* requires a modal.

Deleting a domain takes a live site off the internet. Clearing a log destroys the only forensic record of a failed deploy. The one action that is protected is the least consequential of the set.

### P1-2 - The surface breaks for keyboard, screen reader, and light theme
Two hand-rolled dialogs are keyboard traps: Escape is bound to a tabIndex={-1} div that never receives focus, and the inner container stops propagation on keydown. Neither traps focus, restores focus, nor locks scroll — all of which the shared Modal already does.

Every label in the 11-field Create Process form and in Observe lacks htmlFor and does not wrap its control, and the shared Input generates no id, so screen readers announce unnamed edit fields. The log-type select has no accessible name; three adjacent icon-only buttons carry title but no aria-label, including the destructive one.

The Observe section nav is visually identical to the Settings tablist but has no role, no aria-selected, no roving tabindex and no arrow keys.

The severity palette is dark-theme-only: text-red-300 / orange-300 / amber-300 / emerald-300 over bg-*-500/30 with no light-theme override, roughly 2:1 on the light card. DESIGN.md states plainly that a value working in only one theme is a bug.

### P1-3 - The navigation model is twelve flat peers
Three times the working-memory limit at one decision point, with every tab claiming equal importance so nothing signals where the risk is. The sidebar pivot fixed overflow, not count. Only 2 of 12 tabs carry counts, and neither is Security or Deployments — the two carrying actual risk and actual state.

### P1-4 - Deploy and scan status is frozen; failed fetches render as "never happened"
Deploys and scans are fetched once on mount with no polling and no subscription, and failures are swallowed, so a network error renders "This project hasn't been deployed yet" for a project with deploys. Internally inconsistent: a running command refreshes every 3 seconds while a running deploy never does.

### P1-5 - AI writes to the user's repository with no preview, scope statement, or undo
Fix with AI creates a branch and opens a PR on one click. Review with AI posts review comments publicly on a teammate's PR, disclosing the scope only mid-flight in the spinner. PRODUCT.md specifies diff preview as part of this flow. Less ceremony than deleting a process config row.

## Persona Red Flags

**Alex (impatient power user):** no shortcut for either headline action; zero bulk actions anywhere; cannot link a teammate to "Observe → Logs" because every sub-tab is local state; changing the deployed branch costs four clicks through Settings while the branch is displayed non-interactively two cards above.

**Sam (accessibility-dependent):** cannot close the Observe activity dialog; hears eleven consecutive unnamed edit fields in Create Process; gets no selected state on the Observe nav while the visually identical Settings nav announces correctly; hears "button, button, button" in Logs where one permanently destroys a production log; severity badges at ~2:1 in light theme with ++/-- distinguished by colour alone.

**Riley (stress tester):** kills the network and the page asserts the project has never been deployed or scanned; deletes a heartbeat while the API is down and the row stays with no error; ConfirmModal closes synchronously before onConfirm resolves so a failed delete is invisible; action menus only close on outside mousedown, and the Domains row menu has no outside-click handler at all.

## Minor Observations

- `scrollbar-none` is not a real utility. Used on four nav strips; Tailwind v4 ships no such class and index.css defines only `.scrollbar-hide`. Verified absent from the built CSS, so the global 10px ochre thumb renders under every tab strip — also spending accent budget the One Light Rule reserves for interaction.
- `aria-orientation="vertical"` is hardcoded on a tablist that is horizontal below md. The keyboard handler compensates; the announcement does not.
- `role="tabpanel"` without tabIndex={0} on scroll containers a keyboard user cannot reach to scroll.
- No scroll-into-view for the active tab, so deep-linking ?tab=settings on a phone leaves it off-screen behind a mask gradient.
- Heading levels are inconsistent across sibling tabs: Domains opens at h2, Network/Processes/Commands/Observe at h3, Activity at h2.
- Control heights drift off-system: h-9 against the 28/32/40 scale, and one focus ring at ring-1 where DESIGN.md mandates 3px.
- Everything is fetched eagerly: three Git-host round trips for commits, issues and PRs on mount even if Activity is never opened.
- Two orphaned components imported nowhere: DataFlowDiagram (98 lines) and UserJourneyTree (169 lines).
- Emoji as category labels in a typographically strict system.
- ProjectStatsStrip is designed as a 6-column lattice but rendered inside a half-width card, so it never exceeds 3 columns.
- Detector-invisible drift (greps, not detector output): 85 unsanctioned Tailwind palette classes outside log surfaces, 17 undeclared hex values in bare array literals, and 5 `shadow-sm` uses resolving to Tailwind stock — a third elevation value against the Flat-By-Law Rule.
- One keyboard-inaccessible trigger remains: a bare div with onClick, no role, no tabIndex, no key handler.
- The global focus rule is unlayered, so it outranks Tailwind's `.outline-none` in the cascade. Four controls that pair outline-none with their own ring therefore render both a native outline and a ring.

## Questions to Consider

1. If this page could only answer one question, what would it be? It answers twelve equally. What would it look like if the top 200px were a posture line — last deploy, open criticals, infra state — instead of a name and a creation date?
2. Why does deleting a process config row require a modal while running rm -rf on production does not? What would a single blast-radius tier — reversible / disruptive / destructive — do to the twenty-odd actions here if applied uniformly?
3. Is "Sensitive Data / Dependencies / Security" three tabs, or one job split three ways? What if there were one Findings surface where every result carried the same terminal action?
4. The headline claim is deployment with no build authoring at all. Where does this page say so? The Deploy button looks like every other Deploy button in the category.
5. Should twelve tabs really be one page? Processes/Network/Domains/Observe are server-operations concerns; Overview/Activity/Dependencies/Security are repository concerns. Is this two pages that have not been separated yet?
