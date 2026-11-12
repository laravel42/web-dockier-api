/**
 * Stack resolution tests for project-level teardown.
 *
 * Validates design Property 2 (resolution dedupes) and legacy fallback.
 * Uses generated row combinations to exercise the property across many inputs
 * (plain Vitest — fast-check is not a project dependency).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestEnv } from "../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));

/** One call per page requested by selectAllRows; an empty page ends the read. */
const mockPage = vi.fn();
const deploymentsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: (...args: unknown[]) => mockPage(...args),
};

vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: vi.fn(() => deploymentsChain) },
}));

const mockGetCreds = vi.fn();
vi.mock("../../../lib/provider-credentials.js", () => ({
  getProviderCredentialsSafe: (...args: unknown[]) => mockGetCreds(...args),
  toAwsCredentials: (credential: { accessKeyId: string; secretAccessKey: string }, region?: string) => {
    const base = { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey };
    return region === undefined ? base : { ...base, region };
  },
  toGcpServiceAccountKey: (credential: { serviceAccountKey: string }) => credential.serviceAccountKey,
}));

const { resolveProjectStacks } = await import("../domain/lifecycle/project-teardown.js");

// ─── Helpers ───────────────────────────────────────────────────────

const TENANT = "a1b2c3d4-1234-4abc-8def-111111111111";
const PROJECT = "b2c3d4e5-2345-4bcd-9abc-222222222222";

function infraRow(opts: {
  id: string;
  provider: string;
  stackName: string;
  region?: string;
  strategy?: string;
  providerId?: string;
  repo?: string;
}) {
  return {
    id: opts.id,
    provider_id: opts.providerId ?? "prov-1",
    deploy_strategy: opts.strategy ?? "managed",
    repo: opts.repo ?? "acme/my-app",
    tofu_script: "",
    status: "success",
    infra: {
      provider: opts.provider,
      service: opts.provider === "aws" ? "ecs" : "cloud-run",
      region: opts.region ?? "us-east-1",
      containerName: "my-app",
      stackName: opts.stackName,
    },
  };
}

function legacyRow(opts: { id: string; repo?: string; providerId?: string; strategy?: string }) {
  return {
    id: opts.id,
    provider_id: opts.providerId ?? "prov-legacy",
    deploy_strategy: opts.strategy ?? "managed",
    repo: opts.repo ?? "acme/legacy-app",
    tofu_script: "pulumi-program",
    status: "success",
    infra: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  deploymentsChain.select.mockReturnThis();
  deploymentsChain.eq.mockReturnThis();
  deploymentsChain.neq.mockReturnThis();
  deploymentsChain.order.mockReturnThis();
  mockPage.mockResolvedValue({ data: [], error: null });
});

// ─── Property 2: resolution dedupes ────────────────────────────────

describe("resolveProjectStacks — dedup (Property 2)", () => {
  it("collapses many deployments sharing one (provider, stackName) into a single stack", async () => {
    // Generate N duplicate rows referencing the same stack.
    for (const n of [1, 2, 5, 25, 100]) {
      const rows = Array.from({ length: n }, (_, i) =>
        infraRow({ id: `d${i}`, provider: "aws", stackName: "image-builder-app-my-app" }),
      );
      mockPage.mockResolvedValueOnce({ data: rows, error: null });

      const stacks = await resolveProjectStacks(PROJECT, TENANT);
      expect(stacks).toHaveLength(1);
      expect(stacks[0].provider).toBe("aws");
      expect(stacks[0].stackName).toBe("image-builder-app-my-app");
    }
  });

  it("returns one entry per distinct (provider, stackName) pair", async () => {
    const rows = [
      infraRow({ id: "d1", provider: "aws", stackName: "image-builder-app-alpha" }),
      infraRow({ id: "d2", provider: "aws", stackName: "image-builder-app-alpha" }), // dup
      infraRow({ id: "d3", provider: "gcp", stackName: "image-builder-app-alpha" }), // same name, diff provider
      infraRow({ id: "d4", provider: "aws", stackName: "image-builder-app-beta" }),
    ];
    mockPage.mockResolvedValueOnce({ data: rows, error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    const keys = stacks.map((s) => `${s.provider}:${s.stackName}`).sort();
    expect(keys).toEqual([
      "aws:image-builder-app-alpha",
      "aws:image-builder-app-beta",
      "gcp:image-builder-app-alpha",
    ]);
  });

  it("keeps the most recent occurrence (rows are newest-first)", async () => {
    const rows = [
      infraRow({ id: "newest", provider: "aws", stackName: "image-builder-app-x", region: "eu-west-1" }),
      infraRow({ id: "older", provider: "aws", stackName: "image-builder-app-x", region: "us-east-1" }),
    ];
    mockPage.mockResolvedValueOnce({ data: rows, error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].sampleDeploymentId).toBe("newest");
    expect(stacks[0].region).toBe("eu-west-1");
  });
});

// ─── Legacy fallback ───────────────────────────────────────────────

describe("resolveProjectStacks — legacy fallback", () => {
  it("derives stack name from repo when infra metadata is absent", async () => {
    mockGetCreds.mockResolvedValue({ provider: "aws", region: "us-east-1", credential: { kind: "aws", accessKeyId: "k", secretAccessKey: "s" } });
    mockPage.mockResolvedValueOnce({ data: [legacyRow({ id: "d1", repo: "acme/legacy-app" })], error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].provider).toBe("aws");
    expect(stacks[0].stackName).toBe("image-builder-app-legacy-app");
  });

  it("dedupes legacy rows against metadata rows targeting the same stack", async () => {
    mockGetCreds.mockResolvedValue({ provider: "aws", region: "us-east-1", credential: { kind: "aws", accessKeyId: "k", secretAccessKey: "s" } });
    const rows = [
      infraRow({ id: "d1", provider: "aws", stackName: "image-builder-app-my-app", repo: "acme/my-app" }),
      legacyRow({ id: "d2", repo: "acme/my-app" }), // derives image-builder-app-my-app → same key
    ];
    mockPage.mockResolvedValueOnce({ data: rows, error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    expect(stacks).toHaveLength(1);
  });

  it("skips legacy rows whose provider credentials cannot be resolved", async () => {
    mockGetCreds.mockResolvedValue(null);
    mockPage.mockResolvedValueOnce({ data: [legacyRow({ id: "d1" })], error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    expect(stacks).toHaveLength(0);
  });
});

// ─── Empty / error handling ────────────────────────────────────────

describe("resolveProjectStacks — edge cases", () => {
  it("returns empty for a project with no deployments", async () => {
    mockPage.mockResolvedValueOnce({ data: [], error: null });
    const stacks = await resolveProjectStacks(PROJECT, TENANT);
    expect(stacks).toEqual([]);
  });

  it("throws when the query errors", async () => {
    mockPage.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(resolveProjectStacks(PROJECT, TENANT)).rejects.toThrow("Failed to resolve project stacks");
  });
});

describe("resolveProjectStacks — past the 1000-row cap", () => {
  it("tears down a stack that only appears beyond the first page of deployments", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => infraRow({ id: `new-${i}`, provider: "aws", stackName: "current" }));
    mockPage
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [infraRow({ id: "old", provider: "gcp", stackName: "forgotten" })], error: null });

    const stacks = await resolveProjectStacks(PROJECT, TENANT);

    expect(stacks.map((s) => `${s.provider}:${s.stackName}`).sort()).toEqual(["aws:current", "gcp:forgotten"]);
    expect(mockPage.mock.calls.map((c) => c[0])).toEqual([0, 1000, 1001]);
  });
});
