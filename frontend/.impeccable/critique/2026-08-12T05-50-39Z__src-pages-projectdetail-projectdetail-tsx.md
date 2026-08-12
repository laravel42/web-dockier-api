---
target: ProjectDetail page
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-12T05-50-39Z
slug: src-pages-projectdetail-projectdetail-tsx
---
Method: dual-agent (Assessment A design review · Assessment B detector evidence, run in isolation)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Deploys/scans fetched once on mount, no polling or WS; in-flight deploys never update |
| 2 | Match System / Real World | 3 | Domain vocabulary is right; "pattern-based scanner" copy contradicts the AI endpoint it calls |
| 3 | User Control and Freedom | 2 | Deploy wizard blocks dismissal; only labeled exit is destructive "Cancel Deploy" |
| 4 | Consistency and Standards | 1 | Four active-tab treatments, three dialog implementations, deploy list rendered twice |
| 5 | Error Prevention | 2 | Teardown/delete are exemplary; "Fix with AI" opens a real PR with no preview |
| 6 | Recognition Rather Than Recall | 2 | 12 tabs overflow with no affordance; sub-tab state dies on reload |
| 7 | Flexibility and Efficiency | 2 | Correct roving-tabindex keyboard nav, but no shortcuts, bulk actions, search or sort |
| 8 | Aesthetic and Minimalist | 2 | Flat-by-law honored, but two effective type sizes plus 9-11px micro-text with no contrast |
| 9 | Error Recovery | 2 | Most errors are a bare red line; `.catch(() => {})` renders an empty page silently |
| 10 | Help and Documentation | 1 | Two genuinely good strings exist; no glossary, no docs link, no AI-action explanation |
| **Total** | | **19/40** | **Poor** |

Dragged by systemic failures (focus, consistency, help), not weak components.

## Design Specificity Verdict

**Split: the components are Dockier's, the composition is anyone's.**

The parts show real authorship — the stats strip's `gap-px` lattice with zeros held at 70%, `StatusRingIcon` over a provider ring, OSV vulnerability chips, the language bar. Strip the labels off the page, though, and it is the universal SaaS resource-detail template: back-link, avatar + name + primary button, two label/value cards, horizontal tab strip with underlined active state.

The page is organized **by data category** (Dependencies, Sensitive Data, Network, Observe, Domains), never **by the job**. PRODUCT.md's differentiating mechanism — "the unbroken path from repository to shipped fix" — has no structural expression, and the scan half of it has no entry point at all.

Three choices are category-generic: the default tab is a README in a rich-text editor (PRODUCT.md describes an eight-section AI analysis); emoji as icon vocabulary (`📄` at `text-3xl`, `🚀` in the deploy stepper, while `RocketIcon` sits on the header button); and the tab active state uses `border-b-2 border-primary-500` where DESIGN.md's Navigation rule says the accent is "a background tint, never a text color or an underline."

**Deterministic scan:** 71 findings across `src/pages/ProjectDetail`, all `design-system-font-size`, all advisory. Off-ramp values: 11px x32, 10px x31, 14px x4, 9px x2, 0.75rem x1, 20px x1. Top files: ProjectDescription 24, ProjectCommandsTab 6, ProjectProcessesTab 6. Five shared components scanned clean (verified genuine, not a skipped engine).

Triage: 65 true positives (9/10/11px are invented steps documented nowhere), 4 false positives (14px IS documented in DESIGN.md prose and exists as `--text-sm`; the detector reads only the five frontmatter roles). Root cause of the false positives is a DESIGN.md frontmatter/prose desync, not code drift.

The detector under-counts: repeated identical values are sampled at stride 3. Real census is 76 sites vs 71 reported.

**Visual overlays:** none. No browser automation tool is exposed in this session — verified, not assumed. No overlay or screenshot evidence exists and none is claimed.

## What's Working

**The tab keyboard implementation is correct, and rare.** `useTabListKeyboard.ts` provides arrow keys, Home/End, wraparound, focus movement and roving `tabIndex`, with `role="tab"`, `aria-selected`, `aria-controls` and matching panel/tab id helpers used consistently across all three tablists. Textbook WAI-ARIA APG.

**Deploy state is legible at the moment it matters.** `StepDeploy.tsx` is the strongest thing on the surface: phase timeline, live console on the sanctioned terminal palette, app URL as the reward object, and pre-emptive reassurance for VPS warm-up — "If you see an nginx welcome page, don't worry... typically resolves within 1-3 minutes". That is the most human sentence in the codebase.

**Two degraded states earn their keep.** The processes tab tells the truth and keeps the user productive rather than blocking; the no-provider case hands over a route out. PRODUCT.md principle 4 executed correctly.

## Priority Issues

### P0-1 - Nothing on this surface has a visible keyboard focus indicator
`index.css:351-356` removes the native outline from every button, input, select and textarea on `:focus-visible`. The replacement never arrives: `Button.tsx:5-6` defines `base` with no `focus-visible:` classes, and across 26 ProjectDetail files there are 2 focus declarations, both on selects in one file. Deploy, Tear down infrastructure, Delete permanently and Fix with AI all receive focus with zero visual change. The edit-name button is `opacity-0` with no focus override, so keyboard users tab onto an invisible control. The Sensitive Data entry point is a bare `<div onClick>` over a `display:none` input — keyboard users cannot start a scan at all.

DESIGN.md names this exact trap: "native outlines are globally suppressed, so omitting the ring leaves the control with no focus affordance at all." The system documented it and the code walked into it.

### P0-2 - The Security tab renders blank, and no scan can be launched from this page
`RecentScans.tsx:44` is `if (!scans.length) return null;` — sitting directly above an `EmptyState` at `:46` that is therefore unreachable dead code. Identical bug at `RecentDeploys.tsx:52` vs `:57`. Because `securityPanel` is a truthy JSX element, the `?? renderMainTabPlaceholder("Security")` fallback never fires. Result: a highlighted Security tab over an empty 600px card.

Worse, `codeAnalysisApi.createScan` is reachable only from `/security/project/:projectId`, and nothing on this surface links there. PRODUCT.md's first success criterion is "a new user reaches their first security scan in under 5 minutes" — from the project page, they cannot.

### P1-3 - The 12-tab strip is the page's entire IA and fails three ways
Twelve flat, ungrouped, equally weighted tabs — three times working memory. It contradicts DESIGN.md's Navigation rule (underline instead of wash) while three other active-tab treatments coexist on the same page. It overflows behind a gradient mask with no arrows, no overflow menu and no off-screen count; at laptop width roughly four tabs are hidden, and the two most likely to be cut are Security and Settings. And the badges are on the wrong tabs: Dependencies and Sensitive Data carry counts while Security and Deployments — the two carrying actual risk and actual state — carry nothing, despite the data already being in the parent's hands.

### P1-4 - AI actions write to the user's repository with no preview and no confirmation
"Fix with AI" opens a real pull request from one click. "Review with AI" posts comments publicly on a colleague's PR, disclosing that fact only inside the spinner that appears after the click. "Close Issue" is `variant="danger"` with no confirm, beside a button labeled "Cancel" that means "dismiss this dialog" — two buttons named close in incompatible senses, one irreversible.

PRODUCT.md's positioning explicitly promises "AI fix generation, diff preview, and a real merge request". The diff preview is not in the flow. The system reassures you before destroying your own infrastructure and says nothing before writing to your team's repo.

### P1-5 - A stateful surface with no live state, plus three dead controls
`useProjectDeploys.ts:29-52` fetches once on mount with `.catch(() => {})` swallowing failures into an indistinguishable empty state. No polling, no subscription, despite `useWebSocketManager` existing in the app. `PullLogModal` is mounted but its handler is never called — the modal cannot open. `refreshAnalysis` is defined, returned, and destructured by nobody. The branch switcher that PRODUCT.md lists in the repository header now lives four clicks deep behind a `project:manage` permission most members lack.

## Persona Red Flags

**Alex (impatient power user):** the core loop cannot be closed — inspect a repo then run a scan is impossible from this page. No shortcuts, no bulk actions, no search or sort in the dependency table. Will be trapped by his own deploy, since the wizard refuses to close and Esc no-ops.

**Sam (accessibility-dependent):** focus is invisible on every control including destructive ones. A focusable button that cannot be seen. The Sensitive Data scan is mouse-only. Three unlabeled tablists on one page announce as "tab list" three times. Two dialogs Escape does not close. Status conveyed by color alone. 70 hand-set instances below 12px, down to 9px.

**Priya (engineering lead, from PRODUCT.md's secondary user):** the page has no posture summary. The six most prominent numbers are Stars, Forks, Watchers, Contributors — vanity metrics from the Git host — and zero Dockier signal: no finding count, no last-scan age, no deploy health. Risk is one click away and unmarked. Permission-hidden tabs create phantom gaps, so "check the Settings tab" fails for a Member.

## Minor Observations

- Responsive coverage is effectively absent against a confirmed product requirement: two breakpoint usages across 26 files. Hard-width sidebars (`w-36`, `w-44`, `w-48`) leave ~180px of content at 375px.
- No max-width on the page container; at 2560px the info cards stretch past 1200px each.
- The deploy list is rendered twice, in two different visual languages, stacked.
- `text-ui` — the system's designated workhorse — is used twice on this entire surface, against 237 `text-xs`, 168 `text-sm` and 75 arbitrary px values.
- The Sensitive Data flow asks the user to drag `schema.sql` off their laptop for an already-connected repo, contradicting PRODUCT.md principle 1 ("zero configuration is the product").
- `text-3xl` emoji breaks the 22px ceiling; the `:is(h1..h6)` guard does not catch a `div`.
- Ad-hoc z-index scale: `z-99999`, `z-100`, `z-50`, `z-20`, `z-10`.
- Parsed schema field names classified as `secret` are written to `sessionStorage` with no disclosure and no clear-on-logout.
- 14 undeclared hex colours sit in bare array literals the colour rule structurally cannot see (`settings/shared.tsx`, `UserJourneyTree.tsx`), including light-theme tints in a dark-first system.

## Questions to Consider

1. What is this page's job, and why is it organized by data category instead? What would it look like if the top answered "is it safe? is it shipped?" and the tabs were the drill-down rather than the interface?
2. Why does the product's flagship promise have no button? Deploy has a primary ochre button; Scan has nothing, and the tab that should hold it renders blank. Is scanning genuinely a peer of deploying in this product's mind?
3. The system reassures you before you destroy your own infrastructure and says nothing before it writes to your team's repository. Is that the right allocation of the reassurance budget?
4. If the Overview tab is a README editor, what happened to the eight-section AI analysis — and does the page still know what makes this product different?
