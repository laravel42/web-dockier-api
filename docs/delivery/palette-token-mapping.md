# Palette token mapping

**AIL — task F4.** The ruling F5 implements against, and the ramp B5 adopts.

95 distinct raw-Tailwind palette classes appear across 27 files (212 occurrences). This document
classifies every one of them as **map**, **sanctioned**, or **delete**, and defines the signal ramp
that the "map" column points at.

---

## Why they exist

Not carelessness. The design system's signal colours were a four-step ramp — `50 / 100 / 500 / 700`
— carried as raw hex, where `-50` is a **light-mode tint**. On the dark card (`oklch(0.21 0.009 50)`)
`bg-danger-50` renders as a near-white pill. There was no dark-surface fill token at all, so every
badge author reached for `bg-red-500/30` instead. The raw palette is a symptom; the missing token is
the cause.

Measured, before this change:

| Pill | Dark card | Light card |
|---|---|---|
| `text-red-300` on `bg-red-500/30` | 4.41:1 (AA-large) | **1.49:1** |
| `text-amber-300` on `bg-amber-500/30` | 3.84:1 (AA-large) | **1.21:1** |
| `text-orange-300` on `bg-orange-500/30` | 4.09:1 (AA-large) | **1.36:1** |
| `text-emerald-300` on `bg-emerald-500/30` | 4.09:1 (AA-large) | **1.24:1** |
| `text-danger-500` on `bg-danger-50` | 4.65:1 | 3.44:1 |
| `text-warning-500` on `bg-warning-50` | 7.68:1 | **2.07:1** |
| `text-success-500` on `bg-success-50` | 6.75:1 | **2.41:1** |

Every severity pill in the product failed WCAG AA on the light card. Most were only AA-large on the
dark card they were tuned for.

---

## The signal ramp

Five ordinal steps plus success. Each carries three tokens:

| Token | Role |
|---|---|
| `--color-<signal>-surface` | badge fill |
| `--color-<signal>-line` | badge border |
| `--color-<signal>-ink` | text and icon on that fill |

Hues are fixed per signal; **lightness and chroma are uniform within a theme**, so the six steps read
as one family and differ only in hue. That is the whole reason for working in oklch.

| Signal | Hue | Means |
|---|---|---|
| `danger` | 25 | Critical / blocker / secret / deprecated |
| `caution` | 50 | High / sensitive |
| `warning` | 75 | Medium / personal / outdated / cancelled |
| `info` | 240 | Low / internal / informational |
| `success` | 155 | Clean / none / active / public |

```
dark   surface oklch(0.27  0.055 H)   line oklch(0.40 0.075 H)   ink oklch(0.72 0.13 H)
light  surface oklch(0.955 0.035 H)   line oklch(0.86 0.065 H)   ink oklch(0.50 0.14 H)
```

Measured after, ink against **its own fill** and against the **bare card**, in both themes:

| Signal | dark on-fill | dark on-card | light on-fill | light on-card |
|---|---|---|---|---|
| danger | 5.86 | 6.77 | 5.49 | 6.41 |
| caution | 5.92 | — | 5.44 | — |
| warning | 6.00 | 7.02 | 5.35 | 6.08 |
| info | 6.14 | 7.27 | 5.05 | 5.72 |
| success | 6.29 | 7.56 | 4.89 | 5.48 |

Worst case **4.89:1**. Nothing below 4.5:1.

### Two rulings the ramp settles

1. **Low severity is `info`, not `success`.** The codebase disagreed with itself: `RISK_COLORS.low`
   was emerald, `VULN_STYLES.low` was blue. A low finding is still a finding. Green is reserved for
   *clean / none / active* — states where there is nothing to do.
2. **`caution` exists because the ordinal scales have five steps, not four.** Sensitivity runs
   public → internal → personal → sensitive → secret; SonarQube runs BLOCKER → HIGH → MEDIUM → LOW →
   INFO. Collapsing to four would merge two adjacent risk levels into one colour.

---

## Classification

### Map to signal tokens — 20 distinct classes, 102 occurrences

Severity, sensitivity, risk, dependency status, and the deploy/command status badges.

| Was | Now | Where |
|---|---|---|
| `bg-red-500/30` `text-red-300` `border-red-500/45` | `danger-surface` `danger-ink` `danger-line` | `ProjectDescription.tsx` (RISK, VULN, DEP), `SonarQubeRulesPanel.tsx`, `SensitivityBadge.tsx` |
| `bg-orange-500/30` `text-orange-300` `border-orange-500/45` | `caution-*` | `ProjectDescription.tsx`, `SensitivityBadge.tsx` |
| `bg-amber-500/30` `text-amber-300` `border-amber-500/45` | `warning-*` | `ProjectDescription.tsx`, `SonarQubeRulesPanel.tsx`, `styles.ts` |
| `bg-blue-500/30` `text-blue-300` `border-blue-500/45` | `info-*` | `ProjectDescription.tsx`, `SensitivityBadge.tsx` |
| `bg-emerald-500/30` `text-emerald-300` `border-emerald-500/45` | `success-*` | `ProjectDescription.tsx`, `SensitivityBadge.tsx` |
| `bg-sky-500/20` `text-sky-200` `border-sky-500/35` | `info-*` | `SeverityBadge.tsx` |
| `bg-danger-50` / `bg-warning-50` / `bg-success-50` + `-500` text | `*-surface` + `*-ink` | `SeverityBadge.tsx` |
| `bg-amber-500/10 text-amber-600` | `warning-surface` `warning-ink` | `styles.ts` (`cancelled`) |
| `text-emerald-400` / `text-danger-500` on `++`/`--` | `success-ink` / `danger-ink` | `RecentCommits.tsx`, `ContributorsGrid.tsx` |

**Status: done** — applied under B5.

### Sanctioned exceptions — 42 distinct classes

Legitimate categorical or externally-defined colour. These are **not** drift and must not be tokenised.

| Set | Where | Why |
|---|---|---|
| `langColors` — 12 × `bg-*-500` | `ProjectDetail/constants.ts` | Language bar. A categorical scale needs maximally distinguishable hues; a semantic ramp cannot express "TypeScript vs Go". |
| Integration brand tints — 30 classes | `data/integrations.ts` | Third-party brand identity (Slack, Jira, Sentry…). Not ours to re-map. |
| `text-green-400` (line 13), `text-red-400` (line 15) | `PullLogModal.tsx` | Terminal log **content**. Already sanctioned by DESIGN.md as the ANSI palette. |
| Syntax-highlighting hex (`#8b949e`, `#c9d1d9`, `#f97583`, `#7ee787`, `#d2a8ff`, `#ff7b72`, `#ffa657`) | `index.css` | A code theme is a published artifact, not a UI surface. |
| SonarQube severity emoji (🔴🟠🟡🔵⚪) | `RulesFilterSidebar` | Redundant with the adjacent text label; harmless. Not a colour-only cue. |

The F4 brief's carve-out is confirmed: `PullLogModal.tsx:19` is `border-green-400` on the loading
**spinner** — chrome borrowing the terminal's green, not log content. It is excluded from the ANSI
sanction and re-maps under F5. The same file's lines 13 and 15 *are* content and stay sanctioned.

### Delete or re-map — 33 distinct classes, deferred to F5

Decorative gradients and one-off icon tints with no semantic load. None are severity, so none block B5.

| Class | Where | Ruling |
|---|---|---|
| `from-amber-500 via-orange-400 to-rose-400` | `DataFlowDiagram.tsx` | Decorative gradient — re-map to `primary` ramp under F5. |
| `from-blue-500 via-indigo-400 to-purple-400` | `UserJourneyTree.tsx` | Same. |
| `bg-amber-100`, `bg-indigo-100`, `text-indigo-600` | `DataFlowDiagram.tsx`, `UserJourneyTree.tsx` | Light-only tints on a dark-first surface — **bug**, re-map to `*-surface`. |
| `text-blue-500`, `text-cyan-500`, `text-purple-500`, `text-orange-500` | `DeployWizard/steps/*` | Wizard step icons. Re-map to `primary-500` or `text-text-muted` under F5. |
| `border-violet-200` / `border-violet-500` | `FixWithAIModal.tsx` | AI-affordance accent. Needs a decision under F5: promote violet to a real `ai` token, or fold into `primary`. |
| `text-gray-300`, `text-slate-300` | `StepDeploy.tsx`, `integrations.ts` | Neutral drift — `text-text-secondary`. |
| `bg-amber-500/10`, `text-amber-500`, `border-amber-500/20…30` | `DeployWizard*`, `DeployDetail.tsx`, `ProjectDomainsTab.tsx`, `ProjectNetworkTab.tsx` | "Attention" callouts. Re-map to `warning-surface` / `warning-line` / `warning-ink`. |
| `border-green-400` | `PullLogModal.tsx:19` | Spinner chrome, not log content — `border-primary-500`. |

---

## What F5 inherits

- The severity mappings are already applied; F5 does not revisit them. Measured effect:
  **95 distinct classes / 212 occurrences → 75 / 110.**
- The 33 classes in the table above need the re-map listed. They are concentrated in
  `DeployWizard/steps/*` (wizard chrome), `SummaryCards`-adjacent surfaces, and two decorative
  gradients — no severity remains among them.
- One open decision for F5: **does violet become an `ai` signal token?** It appears only in
  `FixWithAIModal`, but epic E adds more AI surfaces, and a distinct accent for "this action calls a
  model" may be worth a token rather than a one-off.
