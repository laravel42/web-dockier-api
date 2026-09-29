import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";
import type { PipelineInput } from "../pipeline/pipeline.js";

/**
 * Which pipeline a deployment takes.
 *
 * The rule that matters: a static deploy ALWAYS takes the native path, even when
 * DEPLOY_PROVIDER is "dokploy". Static sites go to object storage + CDN
 * (S3 + CloudFront / GCS + Cloud CDN), which is cheaper and edge-served compared
 * to running nginx on a VPS. Dokploy has no equivalent target — its own "static"
 * build type only copies build output already committed to the repo, which is a
 * different thing entirely.
 */

const mockEnv = createTestEnv({ DEPLOY_PROVIDER: "dokploy" }) as Record<string, unknown>;
vi.mock("../../../../shared/config.js", () => ({ env: mockEnv }));

const mockExecuteNative = vi.fn().mockResolvedValue(undefined);
const mockExecuteDokploy = vi.fn().mockResolvedValue(undefined);
const mockAssertDokployConfigured = vi.fn();

vi.mock("../pipeline/pipeline.js", () => ({
  executePipeline: (...args: unknown[]) => mockExecuteNative(...args),
}));
vi.mock("../dokploy/pipeline.js", () => ({
  executeDokployPipeline: (...args: unknown[]) => mockExecuteDokploy(...args),
}));
vi.mock("../dokploy/config.js", () => ({
  assertDokployConfigured: (...args: unknown[]) => mockAssertDokployConfigured(...args),
}));

// The worker module builds a pg-boss worker at import time; stub the factory so
// importing it doesn't try to reach a queue. `enqueue` is captured so we can
// invoke the registered handler (routePipeline) directly.
let registeredHandler: ((input: PipelineInput) => Promise<void>) | null = null;
vi.mock("../../../../shared/database/queue.js", () => ({
  DEPLOY_QUEUE: "deploy-pipeline",
  createWorker: (_queue: string, handler: (input: PipelineInput) => Promise<void>) => {
    registeredHandler = handler;
    return { register: vi.fn(), enqueue: vi.fn() };
  },
}));

await import("../worker.js");

function event(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    deploymentId: "dep-1",
    tenantId: "tenant-1",
    providerId: "prov-1",
    gitConnectionId: "conn-1",
    repo: "acme/site",
    branch: "main",
    tofuScript: "",
    deployStrategy: "managed",
    ...overrides,
  };
}

async function route(input: PipelineInput): Promise<void> {
  if (!registeredHandler) throw new Error("deploy worker handler was not registered");
  await registeredHandler(input);
}

describe("routePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DEPLOY_PROVIDER = "dokploy";
  });

  describe("static always goes native", () => {
    it("routes a static deploy to the native pipeline under DEPLOY_PROVIDER=dokploy", async () => {
      await route(event({ deployStrategy: "static" }));
      expect(mockExecuteNative).toHaveBeenCalledOnce();
      expect(mockExecuteDokploy).not.toHaveBeenCalled();
    });

    it("does not require Dokploy configuration for a static deploy", async () => {
      // A tenant deploying only static sites should not need a working Dokploy
      // instance, so the config assertion must not run on this path.
      await route(event({ deployStrategy: "static" }));
      expect(mockAssertDokployConfigured).not.toHaveBeenCalled();
    });

    it("routes a static deploy to the native pipeline under DEPLOY_PROVIDER=native", async () => {
      mockEnv.DEPLOY_PROVIDER = "native";
      await route(event({ deployStrategy: "static" }));
      expect(mockExecuteNative).toHaveBeenCalledOnce();
      expect(mockExecuteDokploy).not.toHaveBeenCalled();
    });
  });

  describe("non-static respects DEPLOY_PROVIDER", () => {
    it("routes a managed deploy to Dokploy when configured", async () => {
      await route(event({ deployStrategy: "managed" }));
      expect(mockExecuteDokploy).toHaveBeenCalledOnce();
      expect(mockExecuteNative).not.toHaveBeenCalled();
      expect(mockAssertDokployConfigured).toHaveBeenCalledOnce();
    });

    it("routes a vps deploy to Dokploy when configured", async () => {
      await route(event({ deployStrategy: "vps" }));
      expect(mockExecuteDokploy).toHaveBeenCalledOnce();
      expect(mockExecuteNative).not.toHaveBeenCalled();
    });

    it("routes a vps deploy to the native pipeline when DEPLOY_PROVIDER=native", async () => {
      mockEnv.DEPLOY_PROVIDER = "native";
      await route(event({ deployStrategy: "vps" }));
      expect(mockExecuteNative).toHaveBeenCalledOnce();
      expect(mockExecuteDokploy).not.toHaveBeenCalled();
    });
  });

  it("passes the event through unchanged", async () => {
    const input = event({ deployStrategy: "static", repo: "acme/marketing" });
    await route(input);
    expect(mockExecuteNative).toHaveBeenCalledWith(input);
  });
});
