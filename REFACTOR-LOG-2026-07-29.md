# Refactor Log — 2026-07-29

Safe refactoring changes made without running the project (Windows environment, no deps installed).
All changes are cosmetic/structural — no behavior changes unless noted.

---

## 1. `frontend/src/services/projects.ts` — Use shared `buildQuery()` utility

**What:** Replaced manual `URLSearchParams` construction in `projectsApi.list()` with the shared `buildQuery()` helper already used by every other frontend service file.

**Why:** Consistency. All other service files use `buildQuery()` for query string building. This was the only outlier.

**Risk:** Very low. One minor improvement: `offset: 0` now correctly appears in the query string (the old `if (params?.offset)` was falsy for 0).

---

## 2. `frontend/src/hooks/useProjectBadges.ts` — Extract async function from promise chain

**What:** Extracted the fire-and-forget `.then().catch().finally()` chain inside `useEffect` into a named `async function fetchBadgesForProject()`.

**Why:** Readability. Named async functions with try/catch are easier to follow than chained promise methods.

**Risk:** None. Identical behavior — just restructured.

---

## 3. `backend/src/shared/retry.ts` — Modernize `withTimeout` implementation

**What:** Replaced `new Promise` + `.then()/.catch()` with `Promise.race()`. Added `timer.unref()`.

**Why:** `Promise.race()` is the idiomatic timeout pattern. `timer.unref()` prevents the timer from blocking Node process exit during tests/shutdown.

**Risk:** Low. The only behavioral change is `timer.unref()` — strictly better for graceful shutdown.

---

## 4. `frontend/src/types/deployment.ts` — Narrow `status` and `deployStrategy` to string literal unions

**What:** Changed `status: string` → `status: DeploymentStatus` and `deployStrategy: string` → `deployStrategy: DeployStrategy`, matching the backend's existing type definitions.

```ts
export type DeploymentStatus = "pending" | "building" | "deploying" | "success" | "failed" | "destroyed" | "cancelled";
export type DeployStrategy = "vps" | "managed" | "static";
```

**Why:** The backend already defines these unions (`backend/src/services/deploy/types.ts`). The frontend was using `string` which provides no autocomplete or exhaustiveness checking.

**Risk:** None. All existing comparisons in the frontend already use these exact literal values. TypeScript diagnostics confirm zero errors.

---

## 5. `frontend/src/types/scan.ts` — Narrow `Scan.status` to string literal union

**What:** Added `ScanStatus` type and applied it to `Scan.status`.

```ts
export type ScanStatus = "pending" | "running" | "completed" | "failed";
```

**Why:** Same as above — matches `backend/src/services/code-analysis/schemas.ts` (`scanStatusSchema`).

**Risk:** None. All frontend comparisons use these exact values.

---

## 6. `frontend/src/types/scan.ts` — JSDoc on `Finding` interface fields

**What:** Added descriptive JSDoc comments to all fields of the `Finding` interface.

**Risk:** None (comments only).

---

## 7. `frontend/src/types/project.ts` — JSDoc on `ProjectSettings` and `ProjectConfig`

**What:** Added field-level JSDoc to `ProjectSettings` explaining what each setting controls.

**Risk:** None (comments only).

---

## 8. `frontend/src/hooks/` — JSDoc on undocumented hooks

Added JSDoc to:
- `useAsyncData` — generic data-fetching hook
- `useDropdownPosition` — absolute dropdown positioning
- `useInfiniteScroll` — IntersectionObserver-based infinite scroll
- `useInAppNotificationsEnabled` — in-app notification channel status
- `useUnreadNotificationCount` — unread notification badge count

**Risk:** None (comments only).

---

## 9. `frontend/src/types/index.ts` — Remove dead `PostDeployCommand` export

**What:** Removed `PostDeployCommand` from the barrel export — it was re-exported from `./project` but never defined there (and never imported anywhere in the codebase).

**Risk:** None. The export referenced a non-existent type; removing it just cleans up dead code.

---

## 10. `frontend/src/types/index.ts` — Export new types

**What:** Added `DeploymentStatus`, `DeployStrategy`, `ScanStatus`, and `ProjectSettings` to the barrel export so consumers can import them directly from `../types`.

**Risk:** None (additive only).

---

## Summary

| # | File | Change type | Risk |
|---|------|-------------|------|
| 1 | `frontend/src/services/projects.ts` | Consistency (use `buildQuery`) | Very low |
| 2 | `frontend/src/hooks/useProjectBadges.ts` | Readability (async fn extraction) | None |
| 3 | `backend/src/shared/retry.ts` | Modernize (`Promise.race` + `unref`) | Low |
| 4 | `frontend/src/types/deployment.ts` | Type narrowing (string → union) | None |
| 5 | `frontend/src/types/scan.ts` | Type narrowing (string → union) | None |
| 6 | `frontend/src/types/scan.ts` | JSDoc | None |
| 7 | `frontend/src/types/project.ts` | JSDoc | None |
| 8 | `frontend/src/hooks/*.ts` (5 files) | JSDoc | None |
| 9 | `frontend/src/types/index.ts` | Remove dead export | None |
| 10 | `frontend/src/types/index.ts` | Add new type exports | None |

All changes pass type-checking (verified via IDE diagnostics). Functional verification pending tomorrow on macOS with dependencies installed.

---

## 11. `frontend/src/hooks/useViewMode.ts` — Extract shared hook (NEW FILE)

**What:** Created `useViewMode(storageKey, defaultMode?)` hook that encapsulates the repeated localStorage-backed cards/table toggle pattern.

**Why:** The exact same 5-line pattern was copy-pasted in `useProjects`, `useDeploy`, and `useSecurityScans`. Now it's one import.

**Risk:** None. Pure extraction — identical behavior.

---

## 12. `frontend/src/pages/Projects/useProjects.ts` — Use `useViewMode`

**What:** Replaced inline `useState` + `changeViewMode` function with `useViewMode("projects-view")`.

**Risk:** None.

---

## 13. `frontend/src/pages/Deploy/useDeploy.ts` — Use `useViewMode`

**What:** Same as above, using `useViewMode("deployments-view")`. Also removed unused `useState` import.

**Risk:** None.

---

## 14. `frontend/src/pages/SecurityScans/useSecurityScans.ts` — Use `useViewMode`

**What:** Same as above, using `useViewMode("security-scans-view")`. Also removed unused `useState` import.

**Risk:** None.

---

## 15. `frontend/src/components/SourceControlSelect.tsx` — Use shared `Connection` type

**What:** Removed local `interface Connection { id, provider, label }` and imported `Connection` from `../types` (which is a superset with the same required fields).

**Why:** Avoid type drift. If the shared `Connection` type gains or renames a field, this component stays in sync automatically.

**Risk:** None. The shared type is a superset — all existing property accesses remain valid.

---

## 16. `frontend/src/components/RepoSelect.tsx` — Use shared `Repo` type

**What:** Removed local `interface Repo { name, fullName, private }` and imported `Repo` from `../types`.

**Why:** Same reason — avoid type drift.

**Risk:** None. Shared `Repo` has all the fields the component accesses plus extras.

---

## 17. `frontend/src/pages/ProjectDetail/types.ts` — Remove duplicate `CommitInfo`

**What:** Replaced the locally-declared `CommitInfo` interface with a re-export from `../../types`. The local version was dead code — all consumers already imported from the shared types barrel.

**Risk:** None. Nobody imported `CommitInfo` from this file.

---

## Updated Summary

| # | File | Change type | Risk |
|---|------|-------------|------|
| 1 | `frontend/src/services/projects.ts` | Consistency (`buildQuery`) | Very low |
| 2 | `frontend/src/hooks/useProjectBadges.ts` | Readability (async fn extraction) | None |
| 3 | `backend/src/shared/retry.ts` | Modernize (`Promise.race` + `unref`) | Low |
| 4 | `frontend/src/types/deployment.ts` | Type narrowing (string → union) | None |
| 5 | `frontend/src/types/scan.ts` | Type narrowing (string → union) | None |
| 6 | `frontend/src/types/scan.ts` | JSDoc | None |
| 7 | `frontend/src/types/project.ts` | JSDoc | None |
| 8 | `frontend/src/hooks/*.ts` (5 files) | JSDoc | None |
| 9 | `frontend/src/types/index.ts` | Remove dead export | None |
| 10 | `frontend/src/types/index.ts` | Add new type exports | None |
| 11 | `frontend/src/hooks/useViewMode.ts` | NEW shared hook | None |
| 12 | `frontend/src/pages/Projects/useProjects.ts` | Use `useViewMode` | None |
| 13 | `frontend/src/pages/Deploy/useDeploy.ts` | Use `useViewMode` | None |
| 14 | `frontend/src/pages/SecurityScans/useSecurityScans.ts` | Use `useViewMode` | None |
| 15 | `frontend/src/components/SourceControlSelect.tsx` | Use shared `Connection` type | None |
| 16 | `frontend/src/components/RepoSelect.tsx` | Use shared `Repo` type | None |
| 17 | `frontend/src/pages/ProjectDetail/types.ts` | Remove duplicate `CommitInfo` | None |

All changes pass type-checking (verified via IDE diagnostics). Functional verification pending tomorrow on macOS with dependencies installed.

---

## 18. `frontend/src/types/scan.ts` — Narrow `Finding.severity` to string literal union

**What:** Added `FindingSeverity` type and applied it to `Finding.severity`.

```ts
export type FindingSeverity = "error" | "warning" | "info";
```

**Why:** Matches `backend/src/services/code-analysis/schemas.ts` (`findingSeveritySchema`). The `dedupeFindings` utility already used `Record<Finding["severity"], number>` assuming a finite set — now TypeScript actually enforces it.

**Risk:** None. All frontend comparisons use these exact values.

---

## 19. `frontend/src/pages/ProjectDetail/ProjectDetail.tsx` — Remove dead `"completed"` status check

**What:** Removed `|| d.status === "completed"` from the deploy URL lookup. `"completed"` is not a valid `DeploymentStatus` — it's a `ScanStatus`. The check was always `false`.

**Risk:** None (dead code removal). Deployment success is `"success"`, not `"completed"`.

---

## 20. `frontend/src/components/badges/StatusRingIcon.tsx` — Type the `status` prop

**What:** Changed `status: string` → `status: DeploymentStatus | ScanStatus | (string & {})`. This gives autocomplete for known values while still accepting arbitrary strings (for forward-compat).

**Risk:** None. Additive type information.

---

## 21. `frontend/src/services/users.ts` — Use `buildQuery()`

**What:** Replaced manual `URLSearchParams` in `usersApi.list()` with `buildQuery(params)`.

**Risk:** Very low. Same behavior as projects fix (#1) — `offset: 0` now correctly included.

---

## 22. `frontend/src/services/notifications.ts` — Use `buildQuery()`

**What:** Replaced manual `URLSearchParams` in `notificationsApi.list()` with `buildQuery()`.

**Risk:** None.

---

## 23. `frontend/src/hooks/useUnreadNotificationCount.ts` — Fix incorrect API call

**What:** Changed `notificationsApi.list(true)` → `notificationsApi.list({ unreadOnly: true })`.

**Why:** This was a pre-existing **bug** — passing a boolean directly instead of an options object. The old manual URLSearchParams implementation silently accepted it because the `params` arg was typed as optional. With `buildQuery()` TypeScript now correctly rejects it.

**Risk:** Very low. This is a bug fix — the old call was passing `true` as the params object, which meant `unreadOnly` was never actually sent to the server (notifications were loaded without the filter).

---

## 24. `frontend/src/services/observe.ts` — Use `buildQuery()`

**What:** Replaced manual `URLSearchParams` in `observeApi.listActivity()` with `buildQuery()`.

**Risk:** None.

---

## 25. `frontend/src/services/image-builder.ts` — Use `buildQuery()`

**What:** Replaced manual `URLSearchParams` in `imageBuilderApi.listBuilds()` and inline `?nextToken=` in `getBuildLogs()` with `buildQuery()`.

**Risk:** None.

---

## 26. `frontend/src/services/processes.ts` — Use `buildQuery()`

**What:** Replaced inline `?lines=${lines}` in `getProcessLogs()` with `buildQuery({ lines })`.

**Risk:** None.

---

## 27. `frontend/src/services/commands.ts` — Use `buildQuery()`

**What:** Replaced inline query string in `commandsApi.list()` with `buildQuery()`.

**Risk:** None.

---

## Final Summary

| # | File | Change type | Risk |
|---|------|-------------|------|
| 1 | `frontend/src/services/projects.ts` | Consistency (`buildQuery`) | Very low |
| 2 | `frontend/src/hooks/useProjectBadges.ts` | Readability (async fn) | None |
| 3 | `backend/src/shared/retry.ts` | Modernize (`Promise.race`) | Low |
| 4 | `frontend/src/types/deployment.ts` | Type narrowing | None |
| 5 | `frontend/src/types/scan.ts` | Type narrowing (`ScanStatus`) | None |
| 6 | `frontend/src/types/scan.ts` | JSDoc | None |
| 7 | `frontend/src/types/project.ts` | JSDoc | None |
| 8 | `frontend/src/hooks/*.ts` (5 files) | JSDoc | None |
| 9 | `frontend/src/types/index.ts` | Remove dead export | None |
| 10 | `frontend/src/types/index.ts` | Add new type exports | None |
| 11 | `frontend/src/hooks/useViewMode.ts` | NEW shared hook | None |
| 12 | `frontend/src/pages/Projects/useProjects.ts` | Use `useViewMode` | None |
| 13 | `frontend/src/pages/Deploy/useDeploy.ts` | Use `useViewMode` | None |
| 14 | `frontend/src/pages/SecurityScans/useSecurityScans.ts` | Use `useViewMode` | None |
| 15 | `frontend/src/components/SourceControlSelect.tsx` | Use shared type | None |
| 16 | `frontend/src/components/RepoSelect.tsx` | Use shared type | None |
| 17 | `frontend/src/pages/ProjectDetail/types.ts` | Remove dead type | None |
| 18 | `frontend/src/types/scan.ts` | Type narrowing (`FindingSeverity`) | None |
| 19 | `frontend/src/pages/ProjectDetail/ProjectDetail.tsx` | Remove dead code | None |
| 20 | `frontend/src/components/badges/StatusRingIcon.tsx` | Type prop | None |
| 21 | `frontend/src/services/users.ts` | Consistency (`buildQuery`) | Very low |
| 22 | `frontend/src/services/notifications.ts` | Consistency (`buildQuery`) | None |
| 23 | `frontend/src/hooks/useUnreadNotificationCount.ts` | **Bug fix** | Very low |
| 24 | `frontend/src/services/observe.ts` | Consistency (`buildQuery`) | None |
| 25 | `frontend/src/services/image-builder.ts` | Consistency (`buildQuery`) | None |
| 26 | `frontend/src/services/processes.ts` | Consistency (`buildQuery`) | None |
| 27 | `frontend/src/services/commands.ts` | Consistency (`buildQuery`) | None |

**Total: 27 changes across ~20 files.** All pass type-checking. One actual bug fix (#23).
Functional verification pending tomorrow on macOS with dependencies installed.


---

## 28. `frontend/src/hooks/useInAppNotificationsEnabled.ts` — Convert promise chain to async/await

**What:** Replaced `.then().catch().finally()` chain in the `load` callback with async/await + try/catch/finally.

**Why:** Consistency with the pattern established in #2. All hooks now use async functions instead of promise chains.

**Risk:** None. Identical behavior.

---

## 29. `frontend/src/hooks/useUnreadNotificationCount.ts` — Convert promise chain to async/await

**What:** Replaced the fire-and-forget `.then().catch()` chain with a named `async function fetchUnreadCount()` + `void fetchUnreadCount()`.

**Why:** Same readability improvement. Consistent pattern across all hooks.

**Risk:** None. Identical behavior.

---

## Final Total: 29 changes across ~22 files

All pass type-checking. One actual bug fix (#23 — unread notifications filter was never applied).
Functional verification pending tomorrow on macOS with dependencies installed.


---

## 30. `backend/src/shared/env/load.ts` — Remove dead deprecated function

**What:** Removed `loadDockierEnv()` — it was marked `@deprecated` and never imported anywhere in the codebase.

**Why:** Dead code. The function just called `loadDockierEnvFiles()` which is the one actually used by `bootstrapEnv()`.

**Risk:** None. Confirmed zero imports via grep.

---

## Absolute Final Total: 30 changes across ~22 files

All pass type-checking. One actual bug fix (#23).
