/**
 * Deploy Pipeline Logging — Unit Tests
 *
 * Covers the stage-marker format, the NATIVE_STAGE / DOKPLOY_STAGE
 * vocabularies and the `[stage:<id>]` contract with the frontend deploy
 * timeline, plus both
 * ContextualLogger implementations. `logTimestamp` is mocked so the asserted
 * line formats are exact, and the shared pino logger is mocked so the console
 * logger's routing is observable.
 *
 * These tests pin EXISTING behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const FIXED_TIMESTAMP = "2025-01-01 00:00:00";

vi.mock("../../shared/utils/time.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/utils/time.js")>();
  return { ...actual, logTimestamp: () => FIXED_TIMESTAMP };
});

const mockInfo = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();
vi.mock("../../shared/logger.js", () => ({
  logger: {
    info: (...args: unknown[]) => mockInfo(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: (...args: unknown[]) => mockError(...args),
    debug: vi.fn(),
  },
}));

const {
  stageMarker,
  NATIVE_STAGE,
  DOKPLOY_STAGE,
  ALL_STAGE_IDS,
  createDeployLogger,
  createConsoleLogger,
  BuildError,
  ProvisionError,
} = await import("../logging.js");

// ─── stageMarker ───────────────────────────────────────────────────

describe("stageMarker", () => {
  it("wraps the id in the marker the frontend timeline parses", () => {
    expect(stageMarker("clone")).toBe("[stage:clone]");
  });

  it("passes hyphenated ids through unchanged", () => {
    expect(stageMarker("build-site")).toBe("[stage:build-site]");
  });

  it("does not sanitize or validate the id", () => {
    expect(stageMarker("")).toBe("[stage:]");
    expect(stageMarker("Not A Stage")).toBe("[stage:Not A Stage]");
  });
});

describe("NATIVE_STAGE", () => {
  it("declares the exact native pipeline vocabulary", () => {
    expect(NATIVE_STAGE).toEqual({
      CLONE: "clone",
      ANALYZE: "analyze",
      BUILD_SITE: "build-site",
      UPLOAD: "upload",
      CDN: "cdn",
      BUILD_IMAGE: "build-image",
      PROVISION: "provision",
      VERIFY: "verify",
    });
  });

  it("uses only marker-safe ids (the frontend regex is /\\[stage:([\\w-]+)\\]/)", () => {
    for (const id of Object.values(NATIVE_STAGE)) {
      expect(id).toMatch(/^[\w-]+$/);
    }
  });
});

// ─── The [stage:<id>] marker contract ──────────────────────────────

/**
 * The deploy timeline is driven entirely by `[stage:<id>]` markers in the log,
 * so the marker FORMAT and the set of ids are a cross-package contract with the
 * frontend. Renaming an id, or changing the marker's shape, silently leaves a
 * timeline step pending forever — there is no type checking across the two
 * packages to catch it (AGENTS.md forbids importing one from the other).
 *
 * These tests pin both halves on the backend side: the exact marker text, and
 * the full emitted vocabulary. The frontend half lives in
 * `frontend/src/__tests__/deploy-stages.test.ts`.
 */
describe("the [stage:<id>] marker contract", () => {
  it("formats every declared id as exactly `[stage:${id}]`", () => {
    for (const id of ALL_STAGE_IDS) {
      expect(stageMarker(id)).toBe(`[stage:${id}]`);
    }
  });

  it("declares the exact Dokploy pipeline vocabulary", () => {
    expect(DOKPLOY_STAGE).toEqual({
      ENSURE_PROJECT: "ensure-project",
      SYNC_GIT: "sync-git",
      PROVISION_SERVER: "provision-server",
      PROVISION_DATABASES: "provision-databases",
      CONFIGURE_APP: "configure-app",
      DEPLOY: "deploy",
      POST_DEPLOY: "post-deploy",
      AI_RECOVERY: "ai-recovery",
      NETWORK: "network",
      DOMAINS: "domains",
      VERIFY: "verify",
    });
  });

  it("pins the full set of emitted stage ids across both pipelines", () => {
    // Union of NATIVE_STAGE and DOKPLOY_STAGE, deduplicated. Confirmed against
    // every `[stage:...]` producer under backend/src.
    expect([...ALL_STAGE_IDS].sort()).toEqual([
      "ai-recovery",
      "analyze",
      "build-image",
      "build-site",
      "cdn",
      "clone",
      "configure-app",
      "deploy",
      "domains",
      "ensure-project",
      "network",
      "post-deploy",
      "provision",
      "provision-databases",
      "provision-server",
      "sync-git",
      "upload",
      "verify",
    ]);
  });

  it("deduplicates `verify`, which both pipelines emit", () => {
    expect(NATIVE_STAGE.VERIFY).toBe(DOKPLOY_STAGE.VERIFY);
    expect(ALL_STAGE_IDS.filter((id) => id === "verify")).toHaveLength(1);
    expect(new Set(ALL_STAGE_IDS).size).toBe(ALL_STAGE_IDS.length);
  });

  it("keeps every id extractable by the frontend parser regex", () => {
    // The parser at frontend/src/components/DeployWizard/steps/deployStages.ts
    // is /\[stage:([\w-]+)\]/ — hyphenated ids must survive it intact.
    for (const id of ALL_STAGE_IDS) {
      const match = /\[stage:([\w-]+)\]/.exec(`[2025-01-01 00:00:00] ${stageMarker(id)} ── X ──`);
      expect(match?.[1]).toBe(id);
    }
  });

  /**
   * Cross-package assertion. This is a SUBSET relation, not equality: the
   * backend intentionally emits ids that are not timeline steps (post-deploy,
   * ai-recovery, network, domains, provision-databases, build-image, provision).
   *
   * AGENTS.md forbids importing frontend code from the backend, so the frontend
   * list is duplicated here as a literal. AUTHORITY for the frontend side is
   * `frontend/src/components/DeployWizard/steps/deployStages.ts`
   * (DOKPLOY_STAGE_DEFS + STATIC_STAGE_DEFS); authority for the backend side is
   * `backend/src/lib/logging.ts`.
   */
  it("emits every id the frontend timeline renders (frontend ids ⊆ backend ids)", () => {
    const FRONTEND_TIMELINE_IDS = [
      // DOKPLOY_STAGE_DEFS
      "ensure-project",
      "sync-git",
      "provision-server",
      "configure-app",
      "deploy",
      // STATIC_STAGE_DEFS
      "clone",
      "analyze",
      "build-site",
      "upload",
      "cdn",
      "verify",
    ];

    const emitted = new Set(ALL_STAGE_IDS);
    const missing = FRONTEND_TIMELINE_IDS.filter((id) => !emitted.has(id));
    expect(missing).toEqual([]);
  });

  it("documents the backend-only ids the frontend timeline deliberately ignores", () => {
    const FRONTEND_TIMELINE_IDS = new Set([
      "ensure-project",
      "sync-git",
      "provision-server",
      "configure-app",
      "deploy",
      "clone",
      "analyze",
      "build-site",
      "upload",
      "cdn",
      "verify",
    ]);

    expect(ALL_STAGE_IDS.filter((id) => !FRONTEND_TIMELINE_IDS.has(id)).sort()).toEqual([
      "ai-recovery",
      "build-image",
      "domains",
      "network",
      "post-deploy",
      "provision",
      "provision-databases",
    ]);
  });

  it("produces the exact prefixes the Dokploy stage files used to hand-write", () => {
    // Output-preservation guard for the literal → stageMarker() refactor in
    // dokploy/stages/run-post-deploy.ts and dokploy/stages/ai-recovery.ts.
    expect(stageMarker(DOKPLOY_STAGE.POST_DEPLOY)).toBe("[stage:post-deploy]");
    expect(stageMarker(DOKPLOY_STAGE.AI_RECOVERY)).toBe("[stage:ai-recovery]");
  });
});

// ─── createDeployLogger ────────────────────────────────────────────

describe("createDeployLogger", () => {
  const DEPLOYMENT_ID = "dep-123";
  let lines: string[];
  let appendLog: (deploymentId: string, line: string) => Promise<void>;
  let calls: Array<{ deploymentId: string; line: string }>;

  beforeEach(() => {
    lines = [];
    calls = [];
    appendLog = async (deploymentId: string, line: string) => {
      calls.push({ deploymentId, line });
      lines.push(line);
    };
  });

  it("prefixes info lines with a timestamp and ℹ", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.info("cloning repository");
    expect(lines).toEqual([`[${FIXED_TIMESTAMP}] ℹ cloning repository`]);
  });

  it("prefixes success lines with ✓", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.success("image pushed");
    expect(lines).toEqual([`[${FIXED_TIMESTAMP}] ✓ image pushed`]);
  });

  it("prefixes warn lines with ⚠", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.warn("no Dockerfile found");
    expect(lines).toEqual([`[${FIXED_TIMESTAMP}] ⚠ no Dockerfile found`]);
  });

  it("prefixes error lines with ✗", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.error("build failed");
    expect(lines).toEqual([`[${FIXED_TIMESTAMP}] ✗ build failed`]);
  });

  it("writes every line against the deployment id it was built with", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.info("one");
    await log.section("Two");
    expect(calls.every((c) => c.deploymentId === DEPLOYMENT_ID)).toBe(true);
  });

  it("emits a blank timestamp line then the section line with a stage marker", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.section("Clone", "clone");
    expect(lines).toEqual([
      `[${FIXED_TIMESTAMP}]`,
      `[${FIXED_TIMESTAMP}] [stage:clone] ── Clone ───────────────`,
    ]);
  });

  it("omits the marker — and the space before ── — when no stageId is given", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.section("Summary");
    expect(lines).toEqual([
      `[${FIXED_TIMESTAMP}]`,
      `[${FIXED_TIMESTAMP}] ── Summary ───────────────`,
    ]);
  });

  it("emits a marker the frontend regex can extract", async () => {
    const log = createDeployLogger(appendLog, DEPLOYMENT_ID);
    await log.section("Build site", NATIVE_STAGE.BUILD_SITE);
    const match = /\[stage:([\w-]+)\]/.exec(lines[1]);
    expect(match?.[1]).toBe("build-site");
  });

  it("propagates an appendLog rejection to the caller", async () => {
    const failing = createDeployLogger(async () => {
      throw new Error("db down");
    }, DEPLOYMENT_ID);
    await expect(failing.info("x")).rejects.toThrow("db down");
  });
});

// ─── createConsoleLogger ───────────────────────────────────────────

describe("createConsoleLogger", () => {
  beforeEach(() => {
    mockInfo.mockReset();
    mockWarn.mockReset();
    mockError.mockReset();
  });

  it("routes info and success through logger.info", () => {
    const log = createConsoleLogger();
    log.info("starting");
    log.success("done");
    expect(mockInfo.mock.calls).toEqual([["starting"], ["✓ done"]]);
  });

  it("routes warn through logger.warn and error through logger.error", () => {
    const log = createConsoleLogger();
    log.warn("slow");
    log.error("broken");
    expect(mockWarn).toHaveBeenCalledWith("⚠ slow");
    expect(mockError).toHaveBeenCalledWith("✗ broken");
  });

  it("prefixes every line with the bracketed context when one is given", () => {
    const log = createConsoleLogger("image-builder");
    log.info("starting");
    log.success("done");
    log.warn("slow");
    log.error("broken");
    log.section("Build");
    expect(mockInfo.mock.calls).toEqual([
      ["[image-builder] starting"],
      ["[image-builder] ✓ done"],
      ["[image-builder] ── Build ──"],
    ]);
    expect(mockWarn).toHaveBeenCalledWith("[image-builder] ⚠ slow");
    expect(mockError).toHaveBeenCalledWith("[image-builder] ✗ broken");
  });

  it("ignores stageId — console sections carry no stage marker", () => {
    const log = createConsoleLogger();
    log.section("Clone", NATIVE_STAGE.CLONE);
    expect(mockInfo).toHaveBeenCalledWith("── Clone ──");
    expect(mockInfo.mock.calls[0][0]).not.toContain("[stage:");
  });

  it("uses no prefix when the context is an empty string", () => {
    const log = createConsoleLogger("");
    log.info("starting");
    expect(mockInfo).toHaveBeenCalledWith("starting");
  });
});

// ─── Typed error classes ───────────────────────────────────────────

describe("BuildError", () => {
  it("carries the phase, name, message and cause", () => {
    const cause = new Error("exit 1");
    const err = new BuildError("docker build failed", "docker-build", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BuildError");
    expect(err.message).toBe("docker build failed");
    expect(err.phase).toBe("docker-build");
    expect(err.cause).toBe(cause);
  });

  it("leaves cause undefined when none is passed", () => {
    expect(new BuildError("no Dockerfile", "dockerfile").cause).toBeUndefined();
  });
});

describe("ProvisionError", () => {
  it("carries the provider, resource, name and cause", () => {
    const cause = new Error("AccessDenied");
    const err = new ProvisionError("stack failed", "aws", "AWS::ECS::Service", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProvisionError");
    expect(err.provider).toBe("aws");
    expect(err.resource).toBe("AWS::ECS::Service");
    expect(err.cause).toBe(cause);
  });

  it("leaves resource undefined when none is passed", () => {
    expect(new ProvisionError("failed", "gcp").resource).toBeUndefined();
  });
});
