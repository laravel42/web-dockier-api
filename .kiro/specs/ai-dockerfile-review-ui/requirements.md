# Requirements Document

## Introduction

Phase 1 shipped the backend AI Dockerfile review layer (`aiReviewDockerfile()` in `backend/src/lib/repo-analyzer/ai-review.ts`), wired into `analyzeAndGenerate()` and running inside the deploy pipeline's background job. Its outcomes are only visible in the deploy logs, after a deploy has started.

This phase (Phase 2) surfaces the review **before** the user deploys, as a preview in the Deploy Wizard's Build step. The user sees the Dockerfile Dockier will build with, whether the AI revised it, and a structured list of what changed and why — so they can review and trust it, or switch to their own repo Dockerfile, before committing to a deploy.

This is deliberately an **informational preview**. It does not change what gets deployed (the pipeline still generates and reviews the Dockerfile at deploy time against the then-current commit), and it must never block the user from proceeding.

## Glossary

- **Preview endpoint**: A new stateless backend route that clones the repo, generates a Dockerfile, runs the AI review, and returns the results without deploying or persisting anything.
- **Mechanical Dockerfile**: The rule-based `generateDockerfile()` output (Phase 1 terminology).
- **Final Dockerfile**: The Dockerfile after the optional AI review — equal to the mechanical one when the review is skipped or approves it unchanged.
- **Build step**: Step index 4 (`StepCompose`) of the Deploy Wizard, where Docker build options and the IaC script preview already live.
- **Repo Dockerfile path**: When the user chooses "Use repository Dockerfile" (`useRepoDockerfile = true`), Dockier uses the committed Dockerfile as-is and the AI review does not run.

## Constraints

- The preview MUST be informational only. It MUST NOT block wizard navigation, and a preview failure MUST NOT prevent the user from deploying.
- The preview MUST be stateless — no writes to the `deployments` table or any other persistence. No schema change.
- The preview MUST reuse the same generation and review primitives the deploy pipeline uses (`cloneRepo`, `analyzeRepoConfig`, `generateDockerfile`, `aiReviewDockerfile`), so it is representative of the real deploy. It MUST NOT fork or reimplement generation logic.
- The AI review gating MUST be identical to Phase 1: it runs only when `OPENAI_API_KEY` is set and `AI_DOCKERFILE_REVIEW !== "off"`.
- The preview MUST NOT run the AI review when the user selected their own repo Dockerfile (`useRepoDockerfile = true`) or for static deploys.
- Cloning is heavy (network + disk, up to a 120s clone timeout). The endpoint MUST clean up its temp working directory in all paths, apply a per-tenant rate limit, and use a bounded handler timeout.
- No secrets or `.env` values may be sent to the AI (inherited from Phase 1 behavior). Only `.env.example` variable names and non-secret manifests.
- Frontend work MUST follow existing conventions: `deployApi` in `frontend/src/services/deploy.ts`, wizard state in `WizardState`, panel rendered in `StepCompose` using existing design tokens/components.

## Requirements

### Requirement 1: Dockerfile preview endpoint

**User Story:** As a developer, I want a backend endpoint that returns the Dockerfile Dockier would build and any AI improvements, so the wizard can show it before I deploy.

#### Acceptance Criteria

1. A new route `POST /deploy/dockerfile/preview` SHALL be registered in the deploy service using the typed `ZodTypeProvider` pattern with `tags: ["deploy"]` and a summary.
2. The route SHALL be guarded by `app.requirePermission(PERMISSIONS.DEPLOY_CREATE)`.
3. The route SHALL apply a per-tenant rate limit and a bounded `handlerTimeout` sized to cover a shallow clone plus the AI review.
4. The request body SHALL accept `gitConnectionId`, `repo`, `branch`, optional `projectId`, and optional `useRepoDockerfile`. The platform override SHALL be resolved server-side from `projectId` (via `getProjectDeployConfig`), not supplied by the client.
5. The response SHALL include: `aiEnabled` (boolean), `source` (`"generated" | "repo"`), `mechanicalDockerfile` (string), `finalDockerfile` (string), `revised` (boolean), `changes` (array of `{ what, why }`), optional `skipReason`, and `runtime`/`framework` context strings.
6. The endpoint SHALL perform no database writes and SHALL remove its temp working directory in all paths (success and failure).
7. Git credentials SHALL be resolved scoped to the authenticated tenant (never accept raw tokens from the client).

### Requirement 2: Single source of truth via `analyzeAndGenerate`

**User Story:** As a developer, I want the preview to run the exact same generation and review code path as a real deploy, so what I see matches what will ship and the logic never drifts.

#### Acceptance Criteria

1. `analyzeAndGenerate()` SHALL be extended with an opt-in "capture" mode that additionally returns the effective Dockerfile content (`mechanicalDockerfile`, `finalDockerfile`), the review `changes`, an optional `skipReason`, the `source` (`"generated" | "repo"`), and `aiEnabled` — without changing its default behavior for the deploy pipeline.
2. The preview domain function SHALL delegate generation and review to `analyzeAndGenerate()` in capture mode; it SHALL NOT reimplement the generate/gate/review sequence.
3. When `useRepoDockerfile` is true, the preview SHALL call `analyzeAndGenerate` with `skipExistingDockerfile: true`; capture mode SHALL return the repo's Dockerfile with `source: "repo"`, `revised: false`, and SHALL NOT run the AI review.
4. AI gating and non-fatal fallback SHALL be inherited from `analyzeAndGenerate` unchanged: review runs only when `OPENAI_API_KEY` is set AND `AI_DOCKERFILE_REVIEW !== "off"` AND `source` is `"generated"`; any AI failure yields `finalDockerfile === mechanicalDockerfile`, `revised: false`, and a `skipReason`.
5. The preview domain function SHALL remove the temp working directory in all paths.
6. The platform override SHALL be resolved server-side from `projectId` via `getProjectDeployConfig` and passed as `knownPlatform` to `analyzeAndGenerate`, exactly as the deploy pipeline does — so the preview matches deploy behavior.
7. The extension to `analyzeAndGenerate` SHALL NOT change the deploy pipeline's observable behavior; existing Phase 1 tests SHALL continue to pass.

### Requirement 3: Frontend API client and types

**User Story:** As a frontend developer, I want a typed client method for the preview endpoint, so the wizard can call it consistently with other deploy APIs.

#### Acceptance Criteria

1. A `previewDockerfile` method SHALL be added to `deployApi` in `frontend/src/services/deploy.ts` using the shared `request<...>()` helper.
2. The method's request and response types SHALL mirror the backend schema (Requirement 1.4, 1.5).

### Requirement 4: Wizard state and preview trigger

**User Story:** As a user, I want the Dockerfile preview to load automatically when I reach the Build step, so I don't have to take an extra action.

#### Acceptance Criteria

1. `WizardState` SHALL gain fields to hold the preview result, and `useDeployWizard` SHALL expose `previewLoading` and `previewError` parallel to `tofuLoading`/`tofuError`.
2. The preview SHALL be fetched when the user is on the Build step (index 4) with `useDocker === true`, `useRepoDockerfile === false`, and `deployStrategy !== "static"`.
3. The preview SHALL be fetched at most once per input set (repo, branch, `useRepoDockerfile`) — not re-fetched on unrelated re-renders.
4. Toggling between "Let Dockier generate" and "Use repository Dockerfile" SHALL refresh or clear the preview accordingly.
5. Preview state SHALL be reset when the wizard opens and cleared when it closes.

### Requirement 5: Build step preview UI

**User Story:** As a user, I want to see the Dockerfile and any AI improvements in the Build step, so I can review before deploying.

#### Acceptance Criteria

1. `StepCompose` SHALL render a Dockerfile preview panel in the Build step, consistent with the existing IaC script preview block and design tokens.
2. The panel SHALL render distinct states: loading, error, approved (no changes), revised (with change list), and skipped.
3. The revised state SHALL show the structured `changes` (`what` + `why`) and the final Dockerfile.
4. When `source` is `"repo"`, the panel SHALL show the repo's Dockerfile with a note that the user's own Dockerfile is being used and no review runs.
5. When `aiEnabled` is false, the panel SHALL show the mechanical Dockerfile without AI review messaging.
6. The panel SHALL be scrollable and not overflow the wizard layout.

### Requirement 6: Non-blocking, informational UX

**User Story:** As a user, I want the preview to be helpful but never in my way, so a slow or failed preview doesn't stop me from deploying.

#### Acceptance Criteria

1. The Build step's `canNext` SHALL NOT depend on preview success or completion.
2. A preview error SHALL be shown as an informational message while still allowing the user to proceed to deploy.
3. The preview SHALL NOT alter deployment inputs; the pipeline SHALL still generate and review the Dockerfile at deploy time. UI copy SHALL make clear the preview is representative, not a guarantee, since the deploy runs against the then-current commit.

### Requirement 7: Testing and verification

**User Story:** As a developer, I want confidence the preview is correct and safe.

#### Acceptance Criteria

1. Backend tests SHALL cover the preview domain function for: generated + revised, generated + approved, repo-Dockerfile path (review skipped), and AI-disabled — with clone and OpenAI mocked or using a temp fixture.
2. A backend route test SHALL assert the auth guard and request/response schema.
3. The backend SHALL type-check with zero new errors (`pnpm backend:typecheck`) and all existing tests SHALL pass (`pnpm test`).
4. The frontend SHALL type-check, lint, and build cleanly (`cd frontend && pnpm lint && pnpm build`).
