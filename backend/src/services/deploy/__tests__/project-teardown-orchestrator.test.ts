/**
 * Teardown orchestrator tests — design Properties 3, 4, 5, 6, 8.
 *
 * The orchestrator resolves distinct live stacks and destroys each, aggregating
 * to torn_down / partial / nothing_to_tear_down and writing project infra_state.
 * Resolution and single-stack destroy are injected so this test targets the
 * aggregation + state-write logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";
import type { ResolvedStack } from "../domain/lifecycle/project-teardown.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

// Capture project infra_state writes. `.eq()` is chainable AND awaitable.
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

const { teardownProjectInfrastructure, markProjectInfraLive } = await import("../domain/lifecycle/project-teardown.js");

const PROJECT = "b2c3d4e5-2345-4bcd-9abc-222222222222";
const TENANT = "a1b2c3d4-1234-4abc-8def-111111111111";

function stack(name: string, provider = "aws"): ResolvedStack {
  return {
    provider,
    deployStrategy: "managed",
    stackName: name,
    region: "us-east-1",
    providerId: "prov-1",
    repo: "acme/my-app",
    tofuScript: "",
    sampleDeploymentId: `dep-${name}`,
  };
}

beforeEach(() => {
  infraStateUpdates.length = 0;
});

// ─── Property 3: empty resolution is safe ──────────────────────────

describe("teardownProjectInfrastructure — Property 3: empty is safe", () => {
  it("returns nothing_to_tear_down and never invokes destroy", async () => {
    const destroy = vi.fn();
    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [],
      destroy,
    });

    expect(result.status).toBe("nothing_to_tear_down");
    expect(destroy).not.toHaveBeenCalled();
    expect(infraStateUpdates).toHaveLength(0);
  });
});

// ─── Property 6: full teardown sets torn_down ──────────────────────

describe("teardownProjectInfrastructure — Property 6: full success", () => {
  it("sets infra_state=torn_down when every stack destroy succeeds", async () => {
    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("s1"), stack("s2", "gcp")],
      destroy: async () => ({ success: true, message: "ok", errors: [] }),
    });

    expect(result.status).toBe("torn_down");
    const write = infraStateUpdates.find((u) => u.table === "projects");
    expect(write?.payload).toEqual({ infra_state: "torn_down" });
  });
});

// ─── Property 5: partial teardown preserves live ───────────────────

describe("teardownProjectInfrastructure — Property 5: partial preserves live", () => {
  it("does NOT set torn_down when any stack destroy fails", async () => {
    let call = 0;
    const result = await teardownProjectInfrastructure(PROJECT, TENANT, {
      resolve: async () => [stack("s1"), stack("s2")],
      destroy: async () => {
        call++;
        return call === 1
          ? { success: true, message: "ok", errors: [] }
          : { success: false, message: "nope", errors: ["e"] };
      },
    });

    expect(result.status).toBe("partial");
    const tornDownWrite = infraStateUpdates.find(
      (u) => u.table === "projects" && u.payload.infra_state === "torn_down",
    );
    expect(tornDownWrite).toBeUndefined();
  });
});

// ─── Property 8: multi-provider completeness ───────────────────────

describe("teardownProjectInfrastructure — Property 8: N stacks → N destroy calls", () => {
  it("invokes destroy exactly once per resolved stack", async () => {
    for (const n of [1, 2, 3, 7]) {
      const stacks = Array.from({ length: n }, (_, i) => stack(`s${i}`, i % 2 === 0 ? "aws" : "gcp"));
      const destroy = vi.fn().mockResolvedValue({ success: true, message: "ok", errors: [] });

      await teardownProjectInfrastructure(PROJECT, TENANT, {
        resolve: async () => stacks,
        destroy,
      });
      expect(destroy).toHaveBeenCalledTimes(n);
    }
  });
});

// ─── Property 4: state monotonicity on success ─────────────────────

describe("markProjectInfraLive — Property 4: deploy success → live", () => {
  it("writes infra_state=live when a projectId is present", async () => {
    await markProjectInfraLive(PROJECT);
    const write = infraStateUpdates.find((u) => u.table === "projects");
    expect(write?.payload).toEqual({ infra_state: "live" });
  });

  it("is a no-op when projectId is absent", async () => {
    await markProjectInfraLive(undefined);
    await markProjectInfraLive(null);
    await markProjectInfraLive("");
    expect(infraStateUpdates).toHaveLength(0);
  });
});
