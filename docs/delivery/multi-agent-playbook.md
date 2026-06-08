# Multi-agent delivery playbook

How we ship Dockier app UX parity and hardening while minimizing Cursor premium usage.

**Linear project:** [Dockier App — UX Parity & Hardening](https://linear.app/ailterego/project/dockier-app-ux-parity-and-hardening-fa524631fcdd)

**Design system (UX source of truth):** [`../web-berry/docs/design-guidelines.html`](../web-berry/docs/design-guidelines.html) — sibling repo `web-berry` (legacy platform name *Berry*; product is *Dockier*). Absolute path: `/Users/secret/Web/L42/web-berry/docs/design-guidelines.html`. Tokens in the app use `dockier-*` (brand red), `dusk`, `cream`, and `seed` scales.

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
| Human | Visual QA, sign-off | Screenshot compare vs design-guidelines.html |

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

## UX alignment checklist (design-guidelines.html)

| Element | Design system | App today | Action |
|---------|---------------|-----------|--------|
| Fonts | Bely / Bely Display + Soleil (Adobe Typekit) | Loaded via `use.typekit.net/how0krv.css`; `--font-sans`, `--font-display`, `--font-heading` in `@theme` | Verify weights/sizes |
| Brand | Dockier red `#8B1819` (`dockier-600` / `primary-600`) | `dockier-*` + `primary-*` alias in `@theme` | Audit CTAs and active states |
| Accent | Seed gold (`seed-400`–`seed-500`, `#E3AF45`) | `--color-accent`, `btnAccent` | Match hover/secondary highlights |
| Surfaces | Dusk (dark) + cream (light) scales | `dusk-*`, `cream-*`, semantic `--color-surface` / `--color-card` | Audit all pages |
| Dark mode | Yes | `data-theme=dark` (default) | Audit remaining pages |
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
| AIL-162 | Design system alignment with `web-berry/docs/design-guidelines.html` (dockier/dusk/cream/seed tokens) | 8 |
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
