# Implementation Plan

## Overview

Add an optional, non-fatal AI review step to Dockerfile generation. Each task compiles and keeps existing tests passing. The mechanical generator remains the fallback at every step.

## Task Dependency Graph

```
1. Module skeleton (types, constants, callOpenAI)
      │
      ▼
2. Prompt + validation + entry point ──┐
      │                                │
      ▼                                │
3. Context-gathering helpers            │
      │                                │
      ├────────────┐                   │
      ▼            ▼                   ▼
4. Config flag   5. Integrate into analyzeAndGenerate
                     │
        ┌────────────┴───────────┐
        ▼                        ▼
6. Unit tests (mocked)   7. Integration-level safety tests
        └────────────┬───────────┘
                     ▼
              8. Final verification
```

Dependencies:
- **Task 1** is the foundation — types and the OpenAI caller. Everything depends on it.
- **Task 2** (prompt, validation, `aiReviewDockerfile`) depends on 1.
- **Task 3** (context readers) depends on 1 and is consumed by 5; independent of 2 and can run in parallel with 2.
- **Task 4** (config flag) depends only on the repo config module; can proceed any time after 1 and is used by 5.
- **Task 5** (pipeline integration) depends on 2, 3, and 4.
- **Task 6** (unit tests) depends on 2 (and 3 for helper coverage).
- **Task 7** (integration safety tests) depends on 5.
- **Task 8** (final verification) depends on all prior tasks.

Wave definitions (tasks within a wave can run in parallel; each wave depends on the previous):

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "dependsOn": [],
      "description": "Module skeleton: types, constants, and the OpenAI caller."
    },
    {
      "wave": 2,
      "tasks": ["2", "3", "4"],
      "dependsOn": ["1"],
      "description": "Prompt/validation/entry point, context-gathering helpers, and the config flag — independent of each other."
    },
    {
      "wave": 3,
      "tasks": ["5"],
      "dependsOn": ["2", "3", "4"],
      "description": "Integrate the review into analyzeAndGenerate."
    },
    {
      "wave": 4,
      "tasks": ["6", "7"],
      "dependsOn": ["5"],
      "description": "Unit tests (mocked) and integration-level safety tests."
    },
    {
      "wave": 5,
      "tasks": ["8"],
      "dependsOn": ["6", "7"],
      "description": "Final verification: type-check, tests, lint, manual sanity."
    }
  ]
}
```

## Tasks

- [ ] 1. Create the AI review module skeleton
  - [ ] 1.1 Create `backend/src/lib/repo-analyzer/ai-review.ts` with types (`DockerfileReviewInput`, `DockerfileChange`, `DockerfileReviewResult`) and constants (`AI_REVIEW_TIMEOUT_MS`, `AI_REVIEW_MAX_TOKENS`, `MAX_MANIFEST_CHARS`, `MAX_TREE_ENTRIES`, `MIN_REVISION_RATIO`)
  - [ ] 1.2 Implement `callOpenAI()` following the `ai-fix.ts` pattern (JSON mode, `temperature: 0`, `AbortSignal.timeout`), returning `null` on HTTP error, truncation, or parse failure
  - [ ] 1.3 Verify backend type-check passes (`pnpm backend:typecheck`)
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 5.3_

- [ ] 2. Implement prompt, validation, and entry point
  - [ ] 2.1 Implement `buildPrompt(input)` producing the single-message JSON-mode prompt from the design
  - [ ] 2.2 Implement `validateRevision(original, revised)` covering FROM, EXPOSE, length ratio, and secret patterns
  - [ ] 2.3 Implement `sanitizeChanges()` to coerce/trim the `changes` array safely
  - [ ] 2.4 Implement `aiReviewDockerfile(input)` — passthrough on no key / null response / rejected revision; return validated revision otherwise; never throw
  - [ ] 2.5 Verify type-check passes
  - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 3. Implement context-gathering helpers
  - [ ] 3.1 Implement `readPrimaryManifest(repoDir, repoConfig)` — select manifest by runtime, honor `subDir`, truncate to `MAX_MANIFEST_CHARS`
  - [ ] 3.2 Implement `readEnvExample(repoDir)` — read `.env.example` only; never read `.env`
  - [ ] 3.3 Implement `listTopLevelFiles(repoDir, cap)` — shallow, filtered, capped listing
  - [ ] 3.4 Verify type-check passes
  - _Requirements: 1.3_

- [ ] 4. Configuration flag (optional but recommended)
  - [ ] 4.1 Add `AI_DOCKERFILE_REVIEW: z.enum(["on","off"]).default("on")` to `backend/src/shared/config.ts`
  - [ ] 4.2 Add an `aiReviewEnabled()` helper (or inline check) used by the pipeline integration
  - [ ] 4.3 Document the flag in `.env.example`
  - [ ] 4.4 Verify type-check passes
  - _Requirements: 5.1, 5.2_

- [ ] 5. Integrate into `analyzeAndGenerate`
  - [ ] 5.1 In `backend/src/lib/build-pipeline.ts`, move the Dockerfile write to after the review branch
  - [ ] 5.2 Call `aiReviewDockerfile` only when a Dockerfile was mechanically generated, `env.OPENAI_API_KEY` is set, and review is enabled
  - [ ] 5.3 On accepted revision, use revised content and re-derive `detectedPort` from its `EXPOSE`
  - [ ] 5.4 Add info/success/warn logging for approved / revised / skipped outcomes, including elapsed time
  - [ ] 5.5 Extend `AnalyzeResult` with optional `aiReviewed` / `aiRevised` (non-breaking)
  - [ ] 5.6 Ensure the existing repo-Dockerfile path (`skipExistingDockerfile`) does NOT trigger review
  - [ ] 5.7 Verify type-check passes
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Unit tests (OpenAI mocked)
  - [ ] 6.1 Create `backend/src/lib/repo-analyzer/__tests__/ai-review.test.ts`
  - [ ] 6.2 Cover: approved-unchanged, valid-revision-accepted
  - [ ] 6.3 Cover each validation rejection: missing FROM, missing EXPOSE, too short, secret introduced
  - [ ] 6.4 Cover: HTTP error, truncated (`finish_reason: "length"`), malformed JSON
  - [ ] 6.5 Cover: no API key → passthrough with no fetch call
  - [ ] 6.6 Run `pnpm test` — all pass
  - _Requirements: 6.1_

- [ ] 7. Integration-level safety tests
  - [ ] 7.1 Assert `analyzeAndGenerate` writes the mechanical Dockerfile and makes no OpenAI call when `OPENAI_API_KEY` is absent
  - [ ] 7.2 Assert a failing/throwing review still results in the mechanical Dockerfile being written (no throw propagates)
  - [ ] 7.3 Run `pnpm test` — all pass
  - _Requirements: 6.2, 6.3_

- [ ] 8. Final verification
  - [ ] 8.1 `pnpm backend:typecheck` — zero new errors
  - [ ] 8.2 `pnpm test` — all existing + new tests pass
  - [ ] 8.3 ESLint — no new errors for added files
  - [ ] 8.4 Manual sanity: run a deploy with a key set and confirm logs show the review outcome; run with no key and confirm identical-to-today behavior
  - _Requirements: 6.4, 6.5, 6.6_

## Notes

- `generateDockerfile()` and the `dockerfiles/*.ts` templates are NOT modified — the AI layer is strictly additive and runs after them.
- The review MUST remain non-fatal: any error, timeout, or invalid revision falls back to the mechanical Dockerfile.
- Never send `.env` or secret files as AI context; only `.env.example` variable names and non-secret manifests.
- Follow the existing raw-`fetch` OpenAI convention (no shared client exists); do not introduce a new AI SDK dependency for this feature.
- Phase 2 items (caching, wizard preview, pre-generation AI, feedback loop) are tracked in the design's Out of Scope section and are not part of this spec.
