/**
 * Static teardown routing under DEPLOY_PROVIDER=dokploy.
 *
 * Static sites always DEPLOY through the native path whatever DEPLOY_PROVIDER
 * says (`routePipeline` in ../domain/worker.ts) because object storage + CDN has
 * no Dokploy equivalent. Teardown must mirror that: routing on the provider flag
 * alone sent static projects to the Dokploy teardown, which found no dokploy_*
 * rows, reported "nothing to tear down", and left the bucket, CDN distribution
 * and CloudFormation stack running.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";
import type { ResolvedStack } from "../domain/lifecycle/project-teardown.js";

vi.mock("../../../shared/config.js", () => ({
  env: createTestEnv({ DEPLOY_PROVIDER: "dokploy" }),
}));

const infraStateUpdates: Array<{ table: string; payload: Record<string, unknown> }> = [];
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        infraStateUpdates.push({ table, payload });
        const thenable = {
          eq: () => thenable,
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
        return thenable;
      },
    }),
  },
}));

const teardownDokployProject = vi.fn();
vi.mock("../domain/lifecycle/dokploy-teardown.js", () => ({
  teardownDokployProject: (...args: unknown[]) => teardownDokployProject(...args),
}));

const { teardownProjectInfrastructure } = await import("../domain/lifecycle/project-teardown.js");

const PROJECT = "b2c3d4e5-2345-4bcd-9abc-222222222222";
const TENANT = "a1b2c3d4-1234-4abc-8def-111111111111";

function stack(deployStrategy: string, name = `stack-${deployStrategy}`): ResolvedStack {
  return {
    provider: "aws",
    deployStrategy,
    stackName: name,
    region: "us-east-1",
    providerId: "prov-1",
    repo: "acme/my-app",
    tofuScript: "",
    sampleDeploymentId: `dep-${name}`,
  };
}

const NOTHING = { status: "nothing_to_tear_down" as const, message: "No Dokploy infrastructure found for this project.", steps: [] };

beforeEach(() => {
  infraStateUpdates.length = 0;
  teardownDokployProject.mockReset();
  teardownDokployProject.mockResolvedValue(NOTHING);
});

describe("teardownProjectInfrastructure — static stacks under DEPLOY_PROVIDER=dokploy", () => {
  it("destroys a static stack through the native adapter instead of no-oping", async () => {
    const destroy = vi.fn().mockResolvedValue({ success: true, message: "Destroyed stack, S3 bucket", errors: [] });

    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("static")],
      destroy,
    });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy.mock.calls[0][0].stackName).toBe("stack-static");
    expect(result.status).toBe("torn_down");
    expect(infraStateUpdates.find((u) => u.table === "projects")?.payload).toEqual({ infra_state: "torn_down" });
  });

  it("reports partial (not torn_down) when the static bucket cannot be deleted", async () => {
    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("static")],
      destroy: async () => ({ success: false, message: "Bucket delete: AccessDenied", errors: ["Bucket delete: AccessDenied"] }),
    });

    expect(result.status).toBe("partial");
    expect(
      infraStateUpdates.find((u) => u.table === "projects" && u.payload.infra_state === "torn_down"),
    ).toBeUndefined();
  });

  it("leaves vps/managed stacks to the Dokploy path", async () => {
    const destroy = vi.fn();

    await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("vps"), stack("managed")],
      destroy,
    });

    expect(destroy).not.toHaveBeenCalled();
    expect(teardownDokployProject).toHaveBeenCalledWith(PROJECT, TENANT);
  });

  it("tears down both worlds when a project has a static stack AND Dokploy infra", async () => {
    teardownDokployProject.mockResolvedValue({
      status: "torn_down",
      message: "Tore down 2 Dokploy resource(s).",
      steps: [
        { resource: "dokploy application app-1", success: true, message: "removed", kind: "record" },
        { resource: "cloud instance i-1", success: true, message: "removed", kind: "cloud" },
      ],
    });
    const destroy = vi.fn().mockResolvedValue({ success: true, message: "ok", errors: [] });

    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("static"), stack("vps")],
      destroy,
    });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(teardownDokployProject).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("torn_down");
    expect(result.perStack.map((s) => s.stackName)).toEqual([
      "stack-static",
      "dokploy application app-1",
      "cloud instance i-1",
    ]);
  });

  it("stays partial when the static stack succeeds but Dokploy teardown does not", async () => {
    teardownDokployProject.mockResolvedValue({
      status: "partial",
      message: "Some resources could not be removed: dokploy server srv-1.",
      steps: [{ resource: "dokploy server srv-1", success: false, message: "boom", kind: "record" }],
    });

    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("static")],
      destroy: async () => ({ success: true, message: "ok", errors: [] }),
    });

    expect(result.status).toBe("partial");
    expect(result.message).toContain("dokploy server srv-1");
  });

  it("carries through Dokploy's torn_down verdict when only its own records failed", async () => {
    teardownDokployProject.mockResolvedValue({
      status: "torn_down",
      message: "Infrastructure destroyed. Some Dokploy records could not be removed automatically.",
      steps: [
        { resource: "cloud instance i-1", success: true, message: "removed", kind: "cloud" },
        { resource: "dokploy server srv-1", success: false, message: "unreachable", kind: "record" },
      ],
    });

    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [],
      destroy: vi.fn(),
    });

    expect(result.status).toBe("torn_down");
  });

  it("still reports nothing_to_tear_down when neither world has anything", async () => {
    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [],
      destroy: vi.fn(),
    });

    expect(result.status).toBe("nothing_to_tear_down");
    expect(infraStateUpdates).toHaveLength(0);
  });
});
