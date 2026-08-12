# Design detector exceptions

**AIL — task G1.** What `.impeccable/config.json` allows, and why.

The detector runs in CI over `frontend/src` and **exits 2 on any finding**, so the
exception list *is* the baseline. There is no recorded finding count to drift against: a new
violation anywhere fails the build.

Every exception is scoped to the file that earns it, so the same rule still fires everywhere else.
This was checked, not assumed — dropping a `text-[9px]` into a scratch file fails the gate.

| Rule | Scope | Why |
|---|---|---|
| `design-system-color` | `frontend/src/index.css` | The GitHub-derived syntax-highlighting theme (`#8b949e`, `#c9d1d9`, `#f97583`, `#7ee787`, `#d2a8ff`, `#ff7b72`, `#ffa657`) plus four scrollbar/overlay tints. A code theme is a published artifact, not a UI surface — see `palette-token-mapping.md`. |
| `design-system-radius` | `frontend/src/index.css` | `border-radius: 5px` on the scrollbar thumb. 4px reads as square against a 2px transparent border, 6px as a lozenge. Documented in DESIGN.md. |
| `bounce-easing` | `frontend/src/index.css` | `cubic-bezier(0.34, 1.2, 0.64, 1)` on `.input-enlarge-wrap`. DESIGN.md names this "the one place in the system where motion has personality" and it is guarded by `prefers-reduced-motion`. |
| `layout-transition` | `frontend/src/index.css` | The same rule animates `max-width`, which is a layout property. One isolated input for 320ms, not a list; animating a transform instead would distort the text inside it. |
| `overused-font` | project-wide | Space Grotesk. The detector is right that it is common; DESIGN.md commits to it deliberately as the single family across sans/display/heading/mono. A pinned brief beats a saturation warning. |

## Changing this list

Use the tool, not a hand-edit — the entries carry a scope and a timestamp:

```bash
node ~/.claude/skills/impeccable/scripts/hook-admin.mjs ignore-value <rule> "*" --file <glob>
node ~/.claude/skills/impeccable/scripts/hook-admin.mjs ignore-rule <rule>
```

An exception that cannot be justified in one sentence in the table above is a bug that should be
fixed instead. Two findings during this remediation looked like exceptions and were not: a
`text-[11px]` cluster heading (below the documented 12px floor) and `shadow-sm` (a third elevation
in a two-elevation system). Both were fixed.

## What CI runs

| Job | Gate |
|---|---|
| `verify` | typecheck → lint → test → build. Build is a separate step because `tsc -b` caches, and a stale `.tsbuildinfo` has already hidden a real error once. |
| `design` | `pnpm design:check` — detector over `frontend/src`, exit 2 fails. |
| `browser` | Playwright at 375 / 768 / 1440 (task G2). |
