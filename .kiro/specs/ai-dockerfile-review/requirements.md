# Requirements Document

## Introduction

Dockier's Dockerfile generation is currently entirely mechanical. During pipeline Stage 4 (Analyze), `analyzeRepoConfig()` detects the runtime/framework/package manager and `generateDockerfile()` stitches together a Dockerfile from hard-coded, rule-based templates (`backend/src/lib/repo-analyzer/dockerfiles/*.ts`). This handles the common case well but cannot reason about project specifics: non-standard entry points, monorepo pruning, missing system packages for native dependencies, security hardening (non-root user, minimal base image), or build/start command mismatches.

This feature adds an **optional AI review layer** that runs *after* mechanical generation. It inspects the generated Dockerfile alongside key repository files and either approves it or returns an improved version with a structured explanation of what changed and why. The mechanical generator remains the source of truth; the AI acts as a reviewer that can be safely skipped.

## Glossary

- **Mechanical Dockerfile**: The Dockerfile produced by the existing rule-based `generateDockerfile()` function.
- **AI Review**: A post-generation OpenAI call that evaluates the mechanical Dockerfile against repo context and optionally revises it.
- **Revised Dockerfile**: The AI's improved version, returned only when it determines changes are warranted.
- **Graceful degradation**: If the AI is unconfigured, errors, times out, or returns an invalid result, the pipeline proceeds with the mechanical Dockerfile unchanged.
- **`analyzeAndGenerate`**: The orchestrator in `backend/src/lib/build-pipeline.ts` that runs analysis, generation, and (with this feature) AI review before writing the Dockerfile to disk.

## Constraints

- The AI review MUST be non-fatal. A failure or invalid response MUST NOT fail the deployment — the pipeline falls back to the mechanical Dockerfile.
- The feature MUST be gated on `env.OPENAI_API_KEY` being present. When absent, generation behaves exactly as it does today.
- The existing `generateDockerfile()` behavior and signatures MUST NOT change. The AI layer is additive.
- When the user opted into their own repo Dockerfile (`skipExistingDockerfile === true` and a Dockerfile exists), the AI review MUST NOT run — the user's file is respected as-is.
- The feature MUST follow the existing raw-`fetch` OpenAI pattern used across `backend/src/services/git-integration/domain/ai/*` (JSON mode, `temperature: 0`, manual shape validation, `null` on failure).
- The AI review MUST respect a bounded latency budget and a token budget; oversized repo context MUST be truncated.
- No secrets or `.env` values MUST be sent to the AI. Only `.env.example` (variable names) and non-secret config files are eligible for context.

## Requirements

### Requirement 1: AI review module

**User Story:** As a developer, I want a self-contained module that reviews a generated Dockerfile, so the logic is testable in isolation and follows the existing AI conventions.

#### Acceptance Criteria

1. A new module SHALL be created at `backend/src/lib/repo-analyzer/ai-review.ts`.
2. The module SHALL export an async function `aiReviewDockerfile(input)` returning a typed `DockerfileReviewResult`.
3. The input SHALL include: the generated Dockerfile string, the `RepoConfig`, an optional primary manifest (`package.json`/`composer.json`/`requirements.txt`/`go.mod`), an optional `.env.example`, and a capped file-tree listing.
4. The function SHALL call OpenAI via `fetch` using `response_format: { type: "json_object" }` and `temperature: 0`, matching the pattern in `ai-fix.ts`.
5. The function SHALL accept `apiKey` and `model` as parameters rather than reading global config directly.
6. On any HTTP error, truncation (`finish_reason === "length"`), parse failure, or invalid shape, the function SHALL return a result indicating no usable revision (approved with the original Dockerfile) rather than throwing.

### Requirement 2: Response validation and safety

**User Story:** As a developer, I want the AI's proposed Dockerfile validated before use, so a hallucinated or truncated response can never produce a broken build.

#### Acceptance Criteria

1. A revised Dockerfile SHALL be accepted only if it begins with a `FROM` instruction.
2. A revised Dockerfile SHALL be accepted only if it contains an `EXPOSE` instruction.
3. A revised Dockerfile SHALL be rejected if it is empty or shorter than 50% of the mechanical Dockerfile's length (suspected truncation).
4. A revised Dockerfile SHALL be rejected if it introduces content matching common secret patterns (e.g. hardcoded tokens, `AWS_SECRET`, private keys).
5. When a revision is rejected by any validation rule, the function SHALL fall back to the mechanical Dockerfile and record the rejection reason.
6. The result SHALL expose whether the Dockerfile was `approved` (unchanged) or `revised`, the final Dockerfile string, and a structured `changes` array of `{ what, why }` entries.

### Requirement 3: Pipeline integration

**User Story:** As a developer, I want the AI review wired into the existing generation flow, so deployments benefit from it without changing how stages are called.

#### Acceptance Criteria

1. `analyzeAndGenerate()` in `backend/src/lib/build-pipeline.ts` SHALL invoke the AI review after `generateDockerfile()` produces a Dockerfile and before the Dockerfile is written to disk.
2. The AI review SHALL run only when `env.OPENAI_API_KEY` is present AND the Dockerfile was mechanically generated (not when an existing repo Dockerfile is used via `skipExistingDockerfile`).
3. When the AI returns an accepted revision, the written Dockerfile SHALL be the revised version and `detectedPort` SHALL be re-derived from the revised `EXPOSE`.
4. When the AI is skipped, errors, or its revision is rejected, the written Dockerfile SHALL be the mechanical version unchanged.
5. The `AnalyzeResult` SHALL be extended with optional fields indicating whether AI review ran and whether it revised the Dockerfile, without breaking existing consumers.
6. AI review latency SHALL be bounded by an explicit request timeout; a timeout SHALL be treated as a skip.

### Requirement 4: Logging and observability

**User Story:** As an operator, I want the deploy logs to show what the AI did, so I can understand and trust the generated Dockerfile.

#### Acceptance Criteria

1. When the AI approves the Dockerfile unchanged, a single informational log line SHALL note that AI review passed.
2. When the AI revises the Dockerfile, an informational log line SHALL summarize the changes (the `what` fields).
3. When the AI is skipped or fails, a warning log line SHALL state the reason and that the mechanical Dockerfile is used.
4. Log lines SHALL use the existing `ContextualLogger` passed into `analyzeAndGenerate`.
5. The time spent in the AI review SHALL be logged.

### Requirement 5: Configuration

**User Story:** As an operator, I want to control the AI review without code changes, so I can enable, disable, or tune it per environment.

#### Acceptance Criteria

1. The feature SHALL reuse the existing `OPENAI_API_KEY` and `OPENAI_MODEL` configuration; no new required env vars SHALL be introduced for the minimum viable version.
2. An optional env flag (e.g. `AI_DOCKERFILE_REVIEW`) MAY be added to explicitly disable the review even when an API key is present; when unset, the default behavior SHALL be enabled-if-key-present.
3. The AI request timeout and max token budget SHALL be defined as named constants in the module.

### Requirement 6: Testing and verification

**User Story:** As a developer, I want confidence the feature is correct and never breaks the pipeline.

#### Acceptance Criteria

1. Unit tests SHALL cover: approved-unchanged, valid-revision-accepted, revision-rejected-by-validation (each rule), HTTP error, truncated response, and malformed JSON — all with the OpenAI call mocked.
2. A test SHALL assert that when `OPENAI_API_KEY` is absent, `analyzeAndGenerate` writes the mechanical Dockerfile and makes no OpenAI call.
3. A test SHALL assert that an AI failure results in the mechanical Dockerfile being written (no throw).
4. The backend SHALL type-check with zero new errors (`pnpm backend:typecheck`).
5. All existing tests SHALL continue to pass (`pnpm test`).
6. ESLint SHALL report no new errors for the added files.
