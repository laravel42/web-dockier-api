# Dockier Frontend

React 19 SPA (Vite + Tailwind CSS v4) for the Dockier dashboard.

## Commands

```bash
pnpm install    # install dependencies
pnpm dev        # dev server (http://localhost:5173)
pnpm build      # production build
pnpm lint       # ESLint
pnpm lint:fix   # ESLint with auto-fix
pnpm preview    # preview production build
```

## Structure

```text
src/
├── components/     # shared UI (TopNavbar, badges, DeployWizard, …)
├── config/         # nav items (nav.ts)
├── context/        # React context (auth, permissions, toast, theme)
├── hooks/          # shared hooks (e.g. useProjectBadges)
├── pages/          # route-level pages and sections/
├── services/       # API client modules
├── types/          # shared TypeScript types
└── utils/          # helpers (styles, projectBadgeCache, …)
```

## Shell & routes

- **Layout:** `TopNavbar` + main content (no sidebar).
- **Nav:** Dashboard, Projects, Security, Settings — see `src/config/nav.ts`.
- **Also routed:** `/deploy`, `/deploy/:id`, `/notifications`, project and scan detail pages.

## Settings UI

Settings (`/settings`) uses permission-gated tabs: Profile, Users, Roles, Providers, SSH Keys, Source Control, Notification Channels, Integrations, Security Tools.

Status and category pills use **`settingsBadgeCls`** from `src/utils/styles.ts` (`primary`, `success`, `warning`, `muted`). Integration catalog categories use **`categoryBadgeCls()`** from `src/data/integrations.ts`.

## List pages

**Projects**, **Deployments**, and **Security Scans** share a card/table view toggle in the page header. Preference is stored in `localStorage`:

| Page            | Key                   |
| --------------- | --------------------- |
| Projects        | `projects-view`       |
| Deployments     | `deployments-view`    |
| Security Scans  | `security-scans-view` |

Table components: `ProjectTable`, `DeployTable`, `ScanProjectTable`.

## Tech badges

- Hook: `src/hooks/useProjectBadges.ts`
- Cache: `src/utils/projectBadgeCache.ts` (`localStorage`, per project)
- Displays top **4** technologies by `confidence` from `GET /git/repo-badges`
- Used on project/deploy/security scan cards and list tables; `PlatformBadge` when none detected

## shadcn/ui + Shadcn Blocks

The frontend uses [shadcn/ui](https://ui.shadcn.com/) primitives with the [Shadcn Blocks](https://www.shadcnblocks.com/) registry for richer input patterns.

### Setup

1. Add your API key to `.env.local` at the repo root (or `.env`):

```bash
SHADCNBLOCKS_API_KEY=your_api_key_here
```

2. Registry is configured in `components.json` under `@shadcnblocks`.

3. Install **blocks** (page sections) via CLI — slug is shown on each block page (e.g. `login1`, `hero1`):

```bash
pnpm ui:add input label                 # shadcn primitives
pnpm ui:add @shadcnblocks/login1        # free block example
pnpm ui:add @shadcnblocks/hero125         # pro block (valid API key required)
```

**Input components** ([catalog](https://www.shadcnblocks.com/components/input)) are **not** CLI-installable under names like `input-types-4`. Install the base `input` primitive, then copy the component source from the block page Code tab — or use the field helpers in `src/components/ui/fields/`.

### Project layout

| Path | Purpose |
| ---- | ------- |
| `src/components/ui/input.tsx` | Base shadcn `Input` primitive |
| `src/components/ui/combobox.tsx` | Searchable combobox (popover + command filter) |
| `src/components/ui/field.tsx` | shadcn `Field` layout (label, description, error) |
| `src/components/ui/label.tsx` | Base shadcn `Label` primitive |
| `src/components/ui/fields/` | Field compositions — `InputField`, `ComboboxField`, `PasswordInput`, `SearchInput` |
| `src/lib/utils.ts` | `cn()` helper for class merging |

Auth pages (`Login`, `Register`) use `InputWithLabel` / `PasswordInput`. Settings and modals still use legacy `inputCls` until migrated.

## Design system

**Source of truth:** [`../web-berry/docs/design-guidelines.html`](../web-berry/docs/design-guidelines.html) (legacy repo name *Berry*; product is *Dockier*).

### Typography (Adobe Typekit)

Loaded in `index.html` via `https://use.typekit.net/how0krv.css`:

| Token | Family | Use |
| ----- | ------ | --- |
| `--font-sans` | Soleil | UI body, labels, controls |
| `--font-heading` | Bely | Section headings |
| `--font-display` | Bely Display | Hero / marketing-style display type |

### Color scales (`src/index.css` `@theme`)

| Scale | Role |
| ----- | ---- |
| `dockier-*` / `primary-*` | Brand red; `#8B1819` at `dockier-600` / `primary-600` |
| `seed-*` | Gold accent (`seed-500` `#E3AF45`); highlights, badges |
| `dusk-*` / `secondary-*` | Dark neutrals; dark-mode surfaces and text |
| `cream-*` | Light neutrals; light-mode surfaces and auth cards |

Semantic tokens: `--color-brand`, `--color-accent`, `--color-surface`, `--color-card`, `--color-text`, etc. Dark mode is default (`data-theme=dark`).

### Design primitives

Shared Tailwind class strings live in `src/utils/styles.ts`. Prefer these over one-off button/card classes.

| Export | Use for |
| ------ | ------- |
| `btnPrimary` | Primary actions (save, create, submit) — dockier brand fill, `h-11`, subtle shadow, press scale |
| `btnPrimaryAuth` | Auth form primary CTA — theme-aware dusk gradient (light) / cream gradient (dark), full width |
| `btnSecondaryAuth` | Auth form secondary / outline CTA |
| `btnAccent` | Seed-gold accent CTA |
| `btnSecondary` | Secondary actions on neutral background |
| `btnOutline` | Outlined accent actions — `border-primary-400`, hover tint |
| `labelCls` | Auth field labels — 11px / bold / uppercase / tracking per design guidelines |
| `signinLogoCls` | 52px brand symbol block on auth pages |
| `cardCls` | Static panels and sections — border, card shadow, hover elevation |
| `cardInteractiveCls` | Clickable list/grid cards — primary border accent on hover |
| `settingsBadgeCls` | Settings status pills (Connected, Enabled, role badges) — dark-mode bordered tones |

## Linting

ESLint flat config (`eslint.config.js`) includes:

- TypeScript, React Hooks, React Refresh (Vite)
- **`eslint-plugin-better-tailwindcss`** — `enforce-canonical-classes` (warn, auto-fix)

Tailwind entry point for the plugin: `src/index.css` (`@theme` tokens).

Examples of auto-fixes:

- `rounded-[var(--radius-card)]` → `rounded-card`
- `shadow-[var(--shadow-card)]` → `shadow-(--shadow-card)`
- `w-2.5 h-2.5` → `size-2.5`

VS Code: `.vscode/settings.json` enables ESLint fix-on-save and disables duplicate Tailwind IntelliSense canonical hints.

## Environment

Set `VITE_API_BASE` in root `.env` (see `.env.example`) to point at the backend. Empty uses same-origin / dev proxy.
