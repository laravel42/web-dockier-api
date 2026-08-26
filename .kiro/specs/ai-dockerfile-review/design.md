# Design Document

## Overview

Insert an optional, non-fatal AI review step into the existing Dockerfile generation flow. The mechanical generator remains authoritative; the AI reviews its output against repository context and may return a validated improved version. If anything goes wrong — no API key, network error, truncation, malformed JSON, or a revision that fails validation — the pipeline uses the mechanical Dockerfile unchanged.

This is a **review-and-patch** design, deliberately not "generate from scratch with AI":
- The mechanical generator is fast, deterministic, and reliable for the common case.
- A reviewer preserves graceful degradation — the deploy never depends on the AI.
- Changes are explainable via a structured `changes` array.

## Architecture

The AI review is a self-contained step that lives entirely inside `analyzeAndGenerate` in `backend/src/lib/build-pipeline.ts`. It sits between mechanical generation and the single Dockerfile write. No new pipeline stage is introduced, so `stageAnalyze` and the deploy orchestrator are untouched. The new module (`ai-review.ts`) depends only on the OpenAI REST API (via `fetch`) and the `RepoConfig` type; it has no dependency on the deploy pipeline, keeping it independently testable.

```
┌──────────────────────────────────────────────────────────────┐
│ analyzeAndGenerate(repoDir, logger, skipExistingDockerfile)    │
│                                                                │
│   analyzeRepoConfig(repoDir)        → RepoConfig               │
│   generateDockerfile(repoConfig)    → mechanical Dockerfile    │
│                                                                │
│   IF generated AND OPENAI_API_KEY AND review enabled:          │
│     ┌────────────────────────────────────────────────┐        │
│     │ ai-review.ts : aiReviewDockerfile(input)         │        │
│     │   buildPrompt → callOpenAI → validateRevision     │        │
│     │   returns { approved | revised, dockerfile, ... } │        │
│     └────────────────────────────────────────────────┘        │
│     IF revised & valid → df = revised; re-derive port          │
│     ELSE               → df unchanged (graceful fallback)      │
│                                                                │
│   writeFile(repoDir/Dockerfile, df)   ← single write point     │
│   writeFile(repoDir/.dockerignore)                             │
└──────────────────────────────────────────────────────────────┘
```

### Current Flow (unchanged mechanics)

```
stageAnalyze(ctx)
  └─ analyzeAndGenerate({ repoDir, logger, skipExistingDockerfile, knownPlatform })
       ├─ analyzeRepoConfig(repoDir)            → RepoConfig
       ├─ applyKnownPlatform(...)               (optional override)
       ├─ generateDockerfile(repoConfig, ...)   → mechanical Dockerfile string
       ├─ writeFile(repoDir/Dockerfile, df)     ← write happens here today
       └─ writeFile(repoDir/.dockerignore, ...)
```

### Proposed Flow

```
analyzeAndGenerate(...)
  ├─ analyzeRepoConfig(repoDir)            → RepoConfig
  ├─ generateDockerfile(repoConfig, ...)   → mechanical Dockerfile (df)
  │
  ├─ IF df was generated AND env.OPENAI_API_KEY AND review enabled:
  │     review = await aiReviewDockerfile({ apiKey, model, dockerfile: df, repoConfig, manifest, envExample, fileTree })
  │     IF review.revised AND review validation passed:
  │           df = review.dockerfile
  │           re-derive detectedPort from df EXPOSE
  │     log outcome (approved / revised / skipped)
  │
  ├─ writeFile(repoDir/Dockerfile, df)     ← write happens after review
  └─ writeFile(repoDir/.dockerignore, ...)
```

The single write point moves to *after* the (optional) review. No new pipeline stage is introduced — this lives entirely inside `analyzeAndGenerate`, so `stageAnalyze` and the orchestrator are untouched.

## File Structure

```
backend/src/lib/repo-analyzer/
├── ai-review.ts            ← NEW: aiReviewDockerfile(), prompt, OpenAI call, validation
├── __tests__/
│   └── ai-review.test.ts   ← NEW: unit tests (OpenAI mocked)
├── index.ts                ← UNCHANGED (generateDockerfile stays as-is)
└── dockerfiles/*.ts        ← UNCHANGED

backend/src/lib/
└── build-pipeline.ts       ← MODIFIED: call aiReviewDockerfile inside analyzeAndGenerate

backend/src/shared/
└── config.ts               ← MODIFIED (optional): add AI_DOCKERFILE_REVIEW flag
```

## Data Models

The `ai-review.ts` module defines the following types. `RepoConfig` is imported from the existing `backend/src/lib/repo-analyzer/types.ts` and is not redefined.

```typescript
export interface DockerfileReviewInput {
  apiKey: string;
  model: string;
  /** The mechanically generated Dockerfile. */
  dockerfile: string;
  /** Detected stack config (runtime, framework, pm, versions, features). */
  repoConfig: RepoConfig;
  /** Raw primary manifest content (package.json / composer.json / etc.), truncated. */
  manifest?: { name: string; content: string };
  /** .env.example content — variable NAMES only, never real secret files. */
  envExample?: string;
  /** Capped, filtered top-level file listing. */
  fileTree: string[];
  /** Optional request timeout override (ms). */
  timeoutMs?: number;
}

export interface DockerfileChange {
  what: string;
  why: string;
}

export interface DockerfileReviewResult {
  /** True when the AI (or a fallback) leaves the Dockerfile unchanged. */
  approved: boolean;
  /** True only when a validated revision replaced the mechanical Dockerfile. */
  revised: boolean;
  /** The Dockerfile to write — revised content when revised, else the input. */
  dockerfile: string;
  /** Structured, human-readable changes (empty when approved). */
  changes: DockerfileChange[];
  /** Populated when review was skipped or a revision was rejected. */
  skipReason?: string;
}
```

The internal OpenAI response shape (not exported):

```typescript
interface RawReviewResponse {
  approved?: boolean;
  revisedDockerfile?: string;
  changes?: Array<{ what?: string; why?: string }>;
}
```

## Components and Interfaces

The module exposes one public function, `aiReviewDockerfile(input: DockerfileReviewInput): Promise<DockerfileReviewResult>`, backed by private helpers (`buildPrompt`, `callOpenAI`, `validateRevision`, `sanitizeChanges`) and the context readers used by the pipeline (`readPrimaryManifest`, `readEnvExample`, `listTopLevelFiles`).

### Constants

```typescript
const AI_REVIEW_TIMEOUT_MS = 20_000;
const AI_REVIEW_MAX_TOKENS = 4096;
const MAX_MANIFEST_CHARS = 6_000;
const MAX_TREE_ENTRIES = 120;
const MIN_REVISION_RATIO = 0.5; // reject revisions < 50% of original length
```

### OpenAI call (matches existing pattern)

```typescript
async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<RawReviewResponse | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: AI_REVIEW_MAX_TOKENS,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) { /* log status + provider message */ return null; }
  const data = await res.json();
  if (data.choices?.[0]?.finish_reason === "length") return null; // truncated
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  try { return JSON.parse(text) as RawReviewResponse; } catch { return null; }
}
```

### Prompt (single user message, JSON mode)

```
You are a Docker and DevOps expert reviewing an auto-generated Dockerfile.

**Generated Dockerfile:**
```
<df>
```

**Project context:**
- Runtime: <runtime>, Framework: <framework|generic>
- Package manager: <pm> (<pmVersion>), Runtime version: <runtimeVersion>
- Detected start command: <startCommand>
- Features: <comma-separated features>
- Subdirectory: <subDir|/>

**Primary manifest (<name>, truncated):**
```
<manifest.content>
```

**Environment variable names (from .env.example):**
<names or "none">

**File tree (top <n>):**
<listing>

Review the Dockerfile for:
1. Correctness — will it build and run?
2. Accuracy of build and start commands vs. the manifest scripts
3. Layer caching (copy manifests before source, install before copying all files)
4. Security (non-root USER, minimal/pinned base image, no secrets baked into layers)
5. Missing system packages for native dependencies
6. EXPOSE port matches the app's actual listening port

If the Dockerfile is already correct and near-optimal, set "approved": true and return it unchanged.
Only revise when it materially improves correctness, security, or build efficiency.

Return ONLY valid JSON:
{
  "approved": true | false,
  "revisedDockerfile": "<full corrected Dockerfile — complete file, not a diff>",
  "changes": [{ "what": "short change", "why": "short reason" }]
}

CRITICAL:
- revisedDockerfile MUST be a complete, valid Dockerfile starting with FROM and containing EXPOSE.
- Do NOT introduce secrets, tokens, or credentials.
- Preserve the detected runtime and framework intent.
- Prefer minimal changes.
```

### Validation

```typescript
function validateRevision(original: string, revised: string): { ok: boolean; reason?: string } {
  const r = revised.trim();
  if (!r) return { ok: false, reason: "empty revision" };
  if (!/^FROM\s+/im.test(r)) return { ok: false, reason: "missing FROM" };
  if (!/^EXPOSE\s+\d+/im.test(r)) return { ok: false, reason: "missing EXPOSE" };
  if (r.length < original.length * MIN_REVISION_RATIO) return { ok: false, reason: "suspiciously short" };
  if (SECRET_PATTERNS.some((re) => re.test(r))) return { ok: false, reason: "possible secret introduced" };
  return { ok: true };
}
```

`SECRET_PATTERNS` covers e.g. `AWS_SECRET_ACCESS_KEY=...`, `-----BEGIN * PRIVATE KEY-----`, long hex/base64 token assignments in `ENV`/`ARG` lines. This is a guardrail, not a full scanner.

### Entry point behavior

```typescript
export async function aiReviewDockerfile(input: DockerfileReviewInput): Promise<DockerfileReviewResult> {
  const passthrough = (skipReason: string): DockerfileReviewResult =>
    ({ approved: true, revised: false, dockerfile: input.dockerfile, changes: [], skipReason });

  if (!input.apiKey) return passthrough("no API key");

  const raw = await callOpenAI(input.apiKey, input.model, buildPrompt(input), input.timeoutMs ?? AI_REVIEW_TIMEOUT_MS)
    .catch((e) => { /* log */ return null; });
  if (!raw) return passthrough("AI unavailable or invalid response");

  if (raw.approved === true || !raw.revisedDockerfile) {
    return { approved: true, revised: false, dockerfile: input.dockerfile, changes: sanitizeChanges(raw.changes) };
  }

  const check = validateRevision(input.dockerfile, raw.revisedDockerfile);
  if (!check.ok) return passthrough(`revision rejected: ${check.reason}`);

  return {
    approved: false,
    revised: true,
    dockerfile: raw.revisedDockerfile.trim() + "\n",
    changes: sanitizeChanges(raw.changes),
  };
}
```

The function never throws — the caller treats every non-`revised` result as "use the mechanical Dockerfile".

## Integration in `build-pipeline.ts`

Inside `analyzeAndGenerate`, the generation branch changes from *write immediately* to *review then write*:

```typescript
// ... existing: const df = generateDockerfile(repoConfig, repoDir);
if (df) {
  let finalDf = df;
  let aiReviewed = false;
  let aiRevised = false;

  if (env.OPENAI_API_KEY && aiReviewEnabled()) {
    const started = Date.now();
    const review = await aiReviewDockerfile({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      dockerfile: df,
      repoConfig,
      manifest: readPrimaryManifest(repoDir, repoConfig),   // package.json / composer.json / ...
      envExample: readEnvExample(repoDir),                  // .env.example only
      fileTree: listTopLevelFiles(repoDir, MAX_TREE_ENTRIES),
    });
    aiReviewed = true;
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    if (review.revised) {
      finalDf = review.dockerfile;
      aiRevised = true;
      await logger.success(`AI improved Dockerfile in ${elapsed}s: ${review.changes.map(c => c.what).join("; ")}`);
    } else if (review.skipReason) {
      await logger.warn(`AI Dockerfile review skipped (${review.skipReason}) — using generated Dockerfile [${elapsed}s]`);
    } else {
      await logger.info(`AI Dockerfile review passed — no changes needed [${elapsed}s]`);
    }
  }

  await writeFile(join(repoDir, "Dockerfile"), finalDf, "utf-8");
  dockerfileGenerated = true;

  const exposeMatch = finalDf.match(/EXPOSE\s+(\d+)/);
  if (exposeMatch) detectedPort = parseInt(exposeMatch[1], 10);

  // ... existing success log
}
```

`AnalyzeResult` gains two optional booleans: `aiReviewed?: boolean` and `aiRevised?: boolean`. Existing consumers ignore them; they are available for future UI/analytics.

### Helper reads (context gathering)

- `readPrimaryManifest(repoDir, repoConfig)` — picks the manifest by runtime (`package.json`, `composer.json`, `requirements.txt`/`pyproject.toml`, `go.mod`), reads from `repoConfig.subDir` when set, truncates to `MAX_MANIFEST_CHARS`. Returns `undefined` if none found.
- `readEnvExample(repoDir)` — reads `.env.example` if present; never reads `.env`.
- `listTopLevelFiles(repoDir, cap)` — shallow listing (top level plus `subDir`), filtered to skip `node_modules`, `.git`, `dist`, `vendor`, etc., capped at `cap`.

These live in `ai-review.ts` (or a small `ai-review-context.ts`) so `build-pipeline.ts` stays thin.

## Configuration

`backend/src/shared/config.ts` — reuse existing `OPENAI_API_KEY` / `OPENAI_MODEL`. Optionally add:

```typescript
AI_DOCKERFILE_REVIEW: z.enum(["on", "off"]).default("on"),
```

`aiReviewEnabled()` returns `env.AI_DOCKERFILE_REVIEW !== "off"`. With no key, the review is skipped regardless.

## Data / secrets handling

- Only `.env.example` (names, not values) and non-secret manifests/config are sent.
- `.env` and any file matching secret-file patterns are never read for context.
- The validation layer rejects revisions that appear to bake in secrets, as a second line of defense.

## Correctness Properties

These invariants must hold for any input and any AI response:

### Property 1: Never fails the pipeline

`aiReviewDockerfile` never throws; every error path resolves to a `DockerfileReviewResult`. The caller always has a Dockerfile to write.

**Validates: Requirements 1.6, 3.4**

### Property 2: Fallback safety

If `revised` is `false` for any reason (approved, no key, error, or rejected revision), the written Dockerfile is byte-for-byte the mechanical output.

**Validates: Requirements 2.5, 3.4**

### Property 3: Validated revisions only

A revised Dockerfile is written only when it passes every rule in `validateRevision` (starts with `FROM`, contains `EXPOSE`, length ≥ 50% of original, no secret patterns).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 4: Port consistency

After the write, `detectedPort` is always re-derived from the Dockerfile that was actually written, so downstream stages never see a port from a discarded version.

**Validates: Requirements 3.3**

### Property 5: No secret egress

Only `.env.example` variable names and non-secret manifests are ever sent to the AI; `.env` and secret-file patterns are never read for context.

**Validates: Requirements 1.3, 2.4**

### Property 6: Gated execution

No OpenAI request is made when `env.OPENAI_API_KEY` is absent or the feature flag is `off`, or when an existing repo Dockerfile is used via `skipExistingDockerfile`.

**Validates: Requirements 3.2, 5.2**

### Property 7: Bounded latency

Every AI call is subject to `AI_REVIEW_TIMEOUT_MS`; a timeout is indistinguishable from a skip to the caller.

**Validates: Requirements 3.6, 5.3**

## Error Handling

The design treats the AI review as best-effort. Failure modes and handling:

| Failure mode | Detection | Handling |
|--------------|-----------|----------|
| No API key / disabled | Checked before any call | Skip; write mechanical Dockerfile; no log noise beyond debug |
| Network error / timeout | `fetch` throws / `AbortSignal.timeout` | `.catch` → `null` → passthrough; `warn` log with reason |
| Non-2xx HTTP response | `!res.ok` | Log status + provider message; return `null` → passthrough |
| Truncated response | `finish_reason === "length"` | Return `null` → passthrough (avoids using a half-written Dockerfile) |
| Malformed JSON | `JSON.parse` throws | Caught; return `null` → passthrough |
| Valid JSON, wrong shape | Missing `revisedDockerfile` when not approved | Treated as approved-unchanged |
| Invalid revision | `validateRevision` fails | Passthrough with `skipReason = "revision rejected: <reason>"` |

All non-fatal outcomes are surfaced through the `ContextualLogger` (`info` for pass, `success` for a revision, `warn` for skip/failure) so deploy logs remain a complete audit trail. No error from this module propagates to `executePipeline`'s catch block.

## Testing Strategy

`backend/src/lib/repo-analyzer/__tests__/ai-review.test.ts`, OpenAI mocked via a `fetch` mock:

| Case | Setup | Expectation |
|------|-------|-------------|
| Approved unchanged | `{ approved: true }` | `revised=false`, dockerfile === input |
| Valid revision | valid Dockerfile with FROM+EXPOSE | `revised=true`, dockerfile === revision |
| Missing FROM | revision without FROM | rejected, passthrough, reason set |
| Missing EXPOSE | revision without EXPOSE | rejected, passthrough |
| Too short | revision < 50% length | rejected, passthrough |
| Secret introduced | revision with `AWS_SECRET_ACCESS_KEY=...` | rejected, passthrough |
| HTTP 500 | mock non-ok response | passthrough, `skipReason` set |
| Truncated | `finish_reason: "length"` | passthrough |
| Malformed JSON | non-JSON body | passthrough |
| No API key | `apiKey: ""` | passthrough, no fetch call |

Integration-level (in `build-pipeline` tests, if present): assert no OpenAI call when key absent, and that a thrown/failed review still writes the mechanical Dockerfile.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI returns broken Dockerfile that builds-then-crashes | Medium | High | Structural validation (FROM/EXPOSE/length); prefer minimal changes; health check already exists downstream |
| Latency added to every deploy | High | Low | Bounded timeout (20s) treated as skip; runs inside async background job, not request path |
| AI bakes a secret into a layer | Low | High | Never send secret files; reject revisions matching secret patterns |
| Non-determinism between deploys | Medium | Low | `temperature: 0`; Phase 2 caching keyed on config+Dockerfile hash |
| Cost per deploy | Medium | Low | `gpt-4o-mini`, single call, ~4-6K tokens; gated by config flag |
| Truncated response accepted | Low | High | `finish_reason === "length"` → skip; length-ratio guard |

## Out of Scope (Phase 2)

- Caching AI review results keyed on `(repoConfig hash, Dockerfile hash)` to avoid repeat calls on redeploy.
- Surfacing the `changes` array in the Deploy Wizard Build step for user preview.
- Feeding repo context to AI *before* mechanical generation to influence template selection.
- A feedback loop that tracks AI-revised Dockerfiles causing build failures to refine the prompt.
