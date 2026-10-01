import { describe, expect, it } from "vitest";
import { parseStages, stageDefsFor } from "@/components/DeployWizard/steps/deployStages";

/**
 * The deploy timeline is driven entirely by `[stage:<id>]` markers in the log.
 *
 * The bug these tests pin: static deploys route to the native pipeline, but the
 * timeline only knew Dokploy's stages, so it showed "Provision Server" for a
 * deploy that provisions no server and left every step pending forever.
 */

/** Section markers from a real successful static deploy, in order. */
const STATIC_LOG = [
  "[2026-09-29 22:20:01] ▶ Starting deployment pipeline...",
  "[2026-09-29 22:20:02] ℹ Strategy: static",
  "[2026-09-29 22:20:03] [stage:clone] ── Clone Repository ───────────────",
  "[2026-09-29 22:20:05] ✓ Repository cloned (commit: 227da72c)",
  "[2026-09-29 22:20:06] [stage:analyze] ── Analyze Repository ───────────────",
  "[2026-09-29 22:20:09] ✓ Generated Dockerfile (node/spa, pm: pnpm, subDir: /)",
  "[2026-09-29 22:20:10] ℹ Using adapter: aws-s3",
  "[2026-09-29 22:20:11] [stage:build-site] ── Build Static Site ──────────────",
  "[2026-09-29 22:21:52] ✓ Static site built",
  "[2026-09-29 22:21:53] [stage:upload] ── Upload to S3 ───────────────────",
  "[2026-09-29 22:21:54] ℹ Bucket: dockier-251486138355-web-inky-static",
  "[2026-09-29 22:25:31] ✓ 1873 files uploaded to s3://dockier-251486138355-web-inky-static",
  "[2026-09-29 22:25:32] [stage:cdn] ── CloudFormation Deploy ──────────",
  "[2026-09-29 22:28:57] ✓ CloudFormation stack: CREATE_COMPLETE",
  "[2026-09-29 22:28:59] [stage:verify] ── Health Check ──────────────────",
  "[2026-09-29 22:29:00] ✓ Health check passed — application is live",
];

describe("stageDefsFor", () => {
  it("uses the static timeline for a static deploy", () => {
    const labels = stageDefsFor("static").map((s) => s.label);
    expect(labels).toEqual([
      "Clone Repository",
      "Analyze Repository",
      "Build Site",
      "Upload Files",
      "Provision CDN",
      "Verify",
    ]);
  });

  it("never shows server-provisioning steps for a static deploy", () => {
    const ids = stageDefsFor("static").map((s) => s.id);
    expect(ids).not.toContain("provision-server");
    expect(ids).not.toContain("ensure-project");
  });

  it("keeps the Dokploy timeline for vps and managed deploys", () => {
    for (const strategy of ["vps", "managed", ""]) {
      expect(stageDefsFor(strategy).map((s) => s.id)).toEqual([
        "ensure-project",
        "sync-git",
        "provision-server",
        "configure-app",
        "deploy",
      ]);
    }
  });
});

describe("parseStages — static pipeline", () => {
  it("marks every stage successful on a completed deploy", () => {
    const { stages } = parseStages(STATIC_LOG, false, "static", true);
    expect(stages.map((s) => s.status)).toEqual(Array(6).fill("success"));
  });

  it("advances earlier stages as later ones start, mid-deploy", () => {
    // Cut the log at the upload marker: clone/analyze/build done, upload active.
    const partial = STATIC_LOG.slice(0, STATIC_LOG.indexOf(
      "[2026-09-29 22:21:53] [stage:upload] ── Upload to S3 ───────────────────",
    ) + 1);
    const { stages } = parseStages(partial, false, "static", false);
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.status]));
    expect(byId.clone).toBe("success");
    expect(byId.analyze).toBe("success");
    expect(byId["build-site"]).toBe("success");
    expect(byId.upload).toBe("in-progress");
    expect(byId.cdn).toBe("pending");
    expect(byId.verify).toBe("pending");
  });

  it("does not leave the first stage spinning once the second begins", () => {
    // The native pipeline emits only section starts, no per-stage ✓ line, so
    // this is the case that used to spin forever.
    const { stages } = parseStages(STATIC_LOG.slice(0, 6), false, "static", false);
    expect(stages[0].status).toBe("success");
    expect(stages[1].status).toBe("in-progress");
  });

  it("fails the active stage when the deploy failed without a tagged ✗", () => {
    const upTo = STATIC_LOG.indexOf(
      "[2026-09-29 22:21:53] [stage:upload] ── Upload to S3 ───────────────────",
    );
    const failed = [
      ...STATIC_LOG.slice(0, upTo + 1),
      "[2026-09-29 22:21:55] ✗ Deployment failed: s3:CreateBucket denied",
    ];
    const { stages } = parseStages(failed, true, "static", false);
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.status]));
    expect(byId.upload).toBe("failed");
    expect(byId["build-site"]).toBe("success");
    expect(byId.cdn).toBe("pending");
  });

  it("keeps a failed stage failed even when the deploy is later marked succeeded", () => {
    const logs = [...STATIC_LOG, "[2026-09-29 22:29:01] [stage:verify] ✗ something broke"];
    const { stages } = parseStages(logs, false, "static", true);
    expect(stages.find((s) => s.id === "verify")?.status).toBe("failed");
  });

  it("ignores Dokploy markers when rendering a static timeline", () => {
    const logs = [...STATIC_LOG, "[2026-09-29 22:29:02] [stage:provision-server] ✓ Server ready"];
    const { stages } = parseStages(logs, false, "static", false);
    expect(stages.map((s) => s.id)).not.toContain("provision-server");
  });
});

/**
 * The `[stage:<id>]` marker contract, frontend half.
 *
 * AUTHORITY for the set of emitted ids is `backend/src/lib/logging.ts`
 * (NATIVE_STAGE + DOKPLOY_STAGE, asserted there in
 * `backend/src/lib/__tests__/logging.test.ts`). The backend may not be imported
 * from here — they are separate packages — so the list is duplicated below as a
 * literal. If a stage id is renamed in `lib/logging.ts`, this is the test that
 * should fail.
 *
 * The relation is a SUBSET, not equality: the backend emits markers for work
 * that is not a timeline step (post-deploy commands, AI recovery, network and
 * domain application), and the timeline deliberately ignores them.
 */
const BACKEND_STAGE_IDS = [
  // DOKPLOY_STAGE
  "ensure-project",
  "sync-git",
  "provision-server",
  "provision-databases",
  "configure-app",
  "deploy",
  "post-deploy",
  "ai-recovery",
  "network",
  "domains",
  "verify",
  // NATIVE_STAGE
  "clone",
  "analyze",
  "build-site",
  "upload",
  "cdn",
  "build-image",
  "provision",
] as const;

describe("the [stage:<id>] marker contract", () => {
  const timelineIds = (strategy: string) => stageDefsFor(strategy).map((s) => s.id);

  it("renders only ids the backend actually emits", () => {
    const emitted = new Set<string>(BACKEND_STAGE_IDS);
    for (const strategy of ["static", "vps"]) {
      const unknown = timelineIds(strategy).filter((id) => !emitted.has(id));
      expect(unknown).toEqual([]);
    }
  });

  it("extracts every backend id with the parser regex, hyphens included", () => {
    for (const id of BACKEND_STAGE_IDS) {
      const match = `[2026-09-29 22:20:03] [stage:${id}] ── Something ───`.match(
        /\[stage:([\w-]+)\]/,
      );
      expect(match?.[1]).toBe(id);
    }
  });

  it("resolves a log line to a stage for EVERY id in the Dokploy timeline", () => {
    const ids = timelineIds("vps");
    const logs = ids.map((id) => `[2026-09-29 10:00:00] [stage:${id}] ── ${id} ───`);
    const { stages } = parseStages(logs, false, "vps", false);

    for (const id of ids) {
      const stage = stages.find((s) => s.id === id);
      expect(stage, `no stage resolved for ${id}`).toBeDefined();
      expect(stage?.logs.length, `no log line attached to ${id}`).toBeGreaterThan(0);
      expect(stage?.status).not.toBe("pending");
    }
  });

  it("resolves a log line to a stage for EVERY id in the static timeline", () => {
    const ids = timelineIds("static");
    const logs = ids.map((id) => `[2026-09-29 22:20:00] [stage:${id}] ── ${id} ───`);
    const { stages } = parseStages(logs, false, "static", false);

    for (const id of ids) {
      const stage = stages.find((s) => s.id === id);
      expect(stage, `no stage resolved for ${id}`).toBeDefined();
      expect(stage?.logs.length, `no log line attached to ${id}`).toBeGreaterThan(0);
      expect(stage?.status).not.toBe("pending");
    }
  });

  it("ignores backend ids that are not timeline steps without breaking the timeline", () => {
    const timeline = new Set<string>([...timelineIds("vps"), ...timelineIds("static")]);
    const nonTimeline = BACKEND_STAGE_IDS.filter((id) => !timeline.has(id));

    // Every id the backend emits but the timeline does not render. Pinned so a
    // new backend stage is a deliberate decision on this side too.
    expect([...nonTimeline].sort()).toEqual([
      "ai-recovery",
      "build-image",
      "domains",
      "network",
      "post-deploy",
      "provision",
      "provision-databases",
    ]);

    const logs = [
      "[2026-09-29 10:00:01] [stage:ensure-project] ✓ Project ready",
      ...nonTimeline.map((id) => `[2026-09-29 10:00:02] [stage:${id}] ── ${id} ───`),
    ];
    const { stages } = parseStages(logs, false, "vps", false);

    expect(stages.map((s) => s.id)).toEqual(timelineIds("vps"));
    expect(stages.find((s) => s.id === "ensure-project")?.status).toBe("success");
    expect(stages.find((s) => s.id === "sync-git")?.status).toBe("pending");
  });

  it("still reads the ai-recovery marker for retry info even though it is not a step", () => {
    const logs = [
      "[2026-09-29 10:00:01] [stage:deploy] Attempt 1/3",
      "[2026-09-29 10:00:02] [stage:ai-recovery] ✓ Fix applied: pinned the base image",
      "[2026-09-29 10:00:03] [stage:deploy] Attempt 2/3",
    ];
    const { stages, retries } = parseStages(logs, false, "vps", false);

    expect(stages.map((s) => s.id)).not.toContain("ai-recovery");
    expect(retries).toEqual([
      { attempt: 1, maxAttempts: 3, fixDescription: "pinned the base image" },
    ]);
  });
});

describe("parseStages — Dokploy pipeline is unaffected", () => {
  const DOKPLOY_LOG = [
    "[2026-09-29 10:00:01] [stage:ensure-project] ✓ Project ready",
    "[2026-09-29 10:00:02] [stage:sync-git] ✓ Git credentials synced",
    "[2026-09-29 10:00:03] [stage:provision-server] Provisioning...",
  ];

  it("still reads ✓ markers per stage", () => {
    const { stages } = parseStages(DOKPLOY_LOG, false, "vps", false);
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.status]));
    expect(byId["ensure-project"]).toBe("success");
    expect(byId["sync-git"]).toBe("success");
    expect(byId["provision-server"]).toBe("in-progress");
    expect(byId["configure-app"]).toBe("pending");
  });

  it("defaults to the Dokploy timeline when no strategy is passed", () => {
    const { stages } = parseStages(DOKPLOY_LOG, false);
    expect(stages[0].id).toBe("ensure-project");
  });
});
