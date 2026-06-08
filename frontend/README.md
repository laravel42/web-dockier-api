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
├── components/     # shared UI
├── context/        # React context (auth, permissions, toast, theme)
├── hooks/          # shared hooks (e.g. useProjectBadges)
├── pages/          # route-level pages and sections/
├── services/       # API client modules
├── types/          # shared TypeScript types
└── utils/          # helpers (e.g. projectBadgeCache)
```

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

Copy `frontend/.env.example` if present, or set `VITE_API_BASE` to point at the backend (empty uses same-origin / dev proxy).
