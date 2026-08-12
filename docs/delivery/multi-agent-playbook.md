# Multi-agent delivery playbook

How we ship Dockier app UX parity and hardening while minimizing Cursor premium usage.

**Linear project:** [Dockier App — UX Parity & Hardening](https://linear.app/ailterego/project/dockier-app-ux-parity-and-hardening-fa524631fcdd)

**Design system (UX source of truth):** [`frontend/DESIGN.md`](../../frontend/DESIGN.md) — the visual system this product actually ships, plus its sidecar `frontend/src/index.css` for the tokens themselves.

> **Superseded:** `../web-berry/docs/design-guidelines.html` (the Berry system — Bely/Soleil, `dockier-*` brand red, dusk/cream/seed) no longer describes this product. The same correction was already made in `AGENTS.md`. Berry red survives only as `legacy-berry`, reserved for severity states and marketing accents; it is not the product's identity.

---

## Goals

1. Align in-app UX with the web design system (typography, color, layout patterns, four-step narrative).
2. Verify every feature advertised on dockier.dev and in `PRODUCT.md`.
3. Add automated tests (unit → integration → smoke E2E).
4. Route work to the cheapest capable agent.

---

## Agent roles (minimum viable contribution)

| Role | Tool | Best for | Cursor quota |
|------|------|----------|--------------|
| **Planner** | Claude + Linear MCP | Epics, estimates, acceptance criteria, issue breakdown | None |
| **Explorer** | Cursor `explore` subagent (readonly) | Codebase maps, parity gaps, file lists | Low |
| **Implementer** | Cursor Agent | Multi-file UI/API changes, refactors | High |
| **Reviewer** | Claude API | PR review, security notes, doc accuracy | None |
| **Test scaffolder** | OpenAI API | Vitest/Playwright from issue specs | None |
| **Docs** | Claude | `AGENTS.md`, `PRODUCT.md`, API docs | None |

**Rule:** Cursor implements; Claude/OpenAI plan, review, and generate boilerplate. Never use Cursor for read-only audits that an explore subagent can do.

---

## Quota budget (per 2-week sprint)

| Resource | Budget | Notes |
|----------|--------|-------|
| Cursor Agent sessions | 8–12 focused tasks | ~40% of story points |
| Cursor explore subagents | Unlimited (readonly) | Parallel gap analysis |
| Claude API | Planning + review | Use for issue bodies, matrices, PR comments |
| OpenAI API | ~$5 | Test generation, microcopy drafts |
| Human | Visual QA, sign-off | Screenshot compare vs `frontend/DESIGN.md` |

**Story point total (initial epics):** 47 points → ~19 points suitable for Cursor implementation per sprint.

---

## Linear workflow

### Issue labels (create in Linear as needed)

- `agent:cursor` — requires code edits in repo
- `agent:claude` — planning, audit, docs only
- `agent:openai` — test/copy generation
- `epic` — parent issue; not implemented directly
- `ux` / `backend` / `testing` — domain

### Issue template

```markdown
## Outcome
One sentence.

## Acceptance criteria
- [ ] …

## Agent
cursor | claude | openai

## Est. Cursor quota
0 | 0.5 session | 1 session

## Files (if known)
- frontend/src/…
```

### Execution order

1. **AIL-163** Feature parity audit (Claude explore) → child issues per gap
2. **AIL-162** Design tokens (Claude audit → Cursor implement)
3. **AIL-166** Core flows (Cursor, depends on AIL-162)
4. **AIL-164** Tests (OpenAI scaffolds → Cursor wires → CI)
5. Close loop with smoke E2E

### Branch naming

Use Linear git branch names: `andrea/ail-###-short-description`

### PR checklist

- [ ] Links Linear issue (`AIL-###`)
- [ ] Acceptance criteria met
- [ ] `pnpm lint` / `pnpm test` / `pnpm backend:typecheck` pass
- [ ] Screenshot if UX change

---

## Feature parity matrix (living doc)

Track in **AIL-163**. Initial snapshot:

| Feature | Marketing | UI route | API | Verified |
|---------|-----------|----------|-----|----------|
| AI project analysis | ✓ | `/projects/:id` | `GET /git/.../repo-analyze` | ☐ |
| Security scanning | ✓ | `/security` | code-analysis | ☐ |
| Sensitive data | ✓ | ProjectDetail tab | `GET /git/.../sensitive-data` | ☐ |
| OSV dependencies | ✓ | ProjectDetail tab | OSV batch | ☐ |
| AI remediation PRs | ✓ | ScanDetail modal | `POST /git/.../create-mr` | ☐ |
| Jira/Linear issues | ✓ | ScanDetail modal | integrations | ☐ |
| AWS/GCP deploy | ✓ | Deploy wizard | deploy | ☐ |
| Notifications | ✓ | `/notifications`, Settings | notifications | ☐ |
| RBAC | ✓ | Settings/Users | roles | ☐ |
| SonarQube | ✓ | Settings scan tools | code-analysis | ☐ |

---

## UX alignment checklist (`frontend/DESIGN.md`)

North Star: **The Lamplit Control Room** — warm graphite surfaces, one ochre light source, no true gray.

| Element | Design system | App today | Action |
|---------|---------------|-----------|--------|
| Fonts | Space Grotesk, one family across sans/display/heading/mono | `--font-family` in `@theme`; self-hosted | Verify weights against the type ramp |
| Type ramp | 8 steps, 22px→12px; **12px is the floor** | `typography.scale` in DESIGN.md frontmatter | No `text-[Npx]` below 12px |
| Brand | Lamplight Ochre `oklch(0.78 0.08 70)` — the **One Light Rule**: ≤10% of any screen | `--color-primary-*`, `--color-accent` | Audit that ochre marks interaction only, never decoration |
| Neutrals | Warm graphite, hue 50–60 at chroma 0.008–0.012 — **no true gray** | `--color-secondary-*`, surfaces | A `#71717a` reads instantly as foreign |
| Severity | Five ordinal signal steps + success, each `surface`/`line`/`ink`, ≥4.5:1 in both themes | `--color-{danger,caution,warning,info,success}-*` | See `palette-token-mapping.md`; low is `info`, never `success` |
| AI actions | `--color-ai-*` marks work a model performs on the user's behalf | `ai-surface`/`line`/`ink` | Use for AI triggers and previews (epic E) |
| Elevation | Exactly two: `--shadow-xs` resting, `--shadow-overlay` floating | `index.css` | `shadow-sm/md/lg/xl` are banned |
| Dark mode | Dark-first `:root`; light is the `[data-theme="light"]` override | Both themed | Every colour decision must hold in both |
| Four-step journey | Connect → Analyze → Fix → Deploy | **Done** — dashboard `GettingStarted` stepper (**AIL-169**) | — |
| Integration logos | Strip on homepage | Missing in app | Add component |
| Auth pages | Design system sign-in patterns | `AuthLayout`, `btnPrimaryAuth`, `labelCls` | Verify parity |
| Pricing/compare | Marketing only | N/A in app | Out of scope for app shell |

---

## OpenAI / Claude integration (save Cursor usage)

### OpenAI (already in backend)

- Project analysis: `gpt-5.4-mini` server-side only
- **New use:** batch-generate Vitest tests from Linear issue acceptance criteria (script in `scripts/generate-tests.ts` — future task)

### Claude

- Linear MCP for issue management (this playbook)
- Readonly parity audits via API or Cursor explore
- PR review comments pasted into GitHub

### Cursor

- Reserved for: React components, hooks, Fastify routes, migrations, CI wiring

---

## Epics (Linear)

| ID | Title | Points |
|----|-------|--------|
| AIL-162 | Design system alignment with `frontend/DESIGN.md` (graphite + ochre, Space Grotesk, signal ramp) | 8 |
| AIL-166 | Core app flows UX | 13 |
| AIL-163 | Feature parity audit | 13 |
| AIL-164 | Test infrastructure & smoke E2E | 8 |
| AIL-165 | Multi-agent delivery playbook | 5 |

**Total:** 47 points

---

## Next actions

1. Run **AIL-163** parity audit (assign to Claude explore subagent).
2. Continue **AIL-162** token audit; open child issues for remaining page gaps.
3. Add Linear labels `agent:cursor`, `agent:claude`, `agent:openai`.
4. Pick next Cursor task from **AIL-166** (four-step stepper shipped in **AIL-169**).
