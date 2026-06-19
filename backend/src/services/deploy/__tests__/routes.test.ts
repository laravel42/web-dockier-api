/**
 * Deploy Routes Integration Tests
 *
 * Tests the deploy route handlers via Fastify's inject() method.
 * Mocks Supabase and domain modules to test route logic,
 * schema validation, permission enforcement, and tenant isolation.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  TEST_JWT_SECRET,
  TEST_TENANT_ID,
  TEST_PROVIDER_ID,
  TEST_DEPLOYMENT_ID,
  TEST_GIT_CONNECTION_ID,
  authHeader,
  makeProviderRow,
  makeDeploymentRow,
  ADMIN_MEMBERSHIP,
  ADMIN_ROLE,
} from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../shared/config.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    SERVICE_NAME: "gateway",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_minimum_length",
    SUPABASE_SECRET_KEY: "sb_secret_test_key_minimum_length_value",
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: "*",
    WEBHOOK_SECRET: "test-webhook-secret-for-testing",
  },
}));

// Mock Supabase client
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() },
  },
}));

// Mock deploy domain modules
const mockCreateProvider = vi.fn();
const mockListProviders = vi.fn();
const mockGetProviderForTenant = vi.fn();
const mockUpdateProvider = vi.fn();
const mockDeleteProvider = vi.fn();
const mockGetProviderCredentials = vi.fn();

vi.mock("../domain/providers.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createProvider: (...args: unknown[]) => mockCreateProvider(...args),
    listProviders: (...args: unknown[]) => mockListProviders(...args),
    getProviderForTenant: (...args: unknown[]) => mockGetProviderForTenant(...args),
    updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
    deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
    getProviderCredentials: (...args: unknown[]) => mockGetProviderCredentials(...args),
  };
});

const mockListDeployments = vi.fn();
const mockGetDeployment = vi.fn();
const mockGetDeploymentForDestroy = vi.fn();
const mockGetDeploymentForWebhook = vi.fn();
const mockUpdateDeploymentStatus = vi.fn();
const mockCreateAndEnqueueDeployment = vi.fn();

vi.mock("../domain/deployments.js", () => ({
  listDeployments: (...args: unknown[]) => mockListDeployments(...args),
  getDeployment: (...args: unknown[]) => mockGetDeployment(...args),
  getDeploymentForDestroy: (...args: unknown[]) => mockGetDeploymentForDestroy(...args),
  getDeploymentForWebhook: (...args: unknown[]) => mockGetDeploymentForWebhook(...args),
  updateDeploymentStatus: (...args: unknown[]) => mockUpdateDeploymentStatus(...args),
  createAndEnqueueDeployment: (...args: unknown[]) => mockCreateAndEnqueueDeployment(...args),
}));

const mockCreateDeploymentRecord = vi.fn();
const mockApplyDeploymentWebhookUpdate = vi.fn();

vi.mock("../domain/processor.js", () => ({
  createDeploymentRecord: (...args: unknown[]) => mockCreateDeploymentRecord(...args),
  applyDeploymentWebhookUpdate: (...args: unknown[]) => mockApplyDeploymentWebhookUpdate(...args),
}));

const mockEnqueueDeployment = vi.fn();
vi.mock("../domain/worker.js", () => ({
  enqueueDeployment: (...args: unknown[]) => mockEnqueueDeployment(...args),
  registerDeployWorker: vi.fn(),
}));

const mockDestroyDeployment = vi.fn();
vi.mock("../domain/destroy.js", () => ({
  destroyDeployment: (...args: unknown[]) => mockDestroyDeployment(...args),
}));

const mockListSshKeys = vi.fn();
const mockCreateSshKey = vi.fn();
const mockDeleteSshKey = vi.fn();

vi.mock("../domain/ssh-keys.js", () => ({
  listSshKeys: (...args: unknown[]) => mockListSshKeys(...args),
  createSshKey: (...args: unknown[]) => mockCreateSshKey(...args),
  deleteSshKey: (...args: unknown[]) => mockDeleteSshKey(...args),
}));

vi.mock("../domain/planner.js", () => ({
  generateTofuPreview: () => ({ script: "# mock pulumi", estimatedResources: ["ec2:t3.micro"] }),
  getDefaultRegion: () => "us-east-1",
  normalizeAppName: (name: string) => name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
}));

vi.mock("../domain/templates.js", () => ({
  resolveDeployTemplate: () => ({ id: "default", defaultServices: [] }),
}));

// ─── Permission Resolution Mock ────────────────────────────────────

function setupPermissionMocks(opts: {
  membership?: Record<string, unknown> | null;
  role?: Record<string, unknown> | null;
  permissions?: string[];
} = {}) {
  const membership = opts.membership ?? ADMIN_MEMBERSHIP;
  const role = opts.role ?? ADMIN_ROLE;
  const permissions = opts.permissions ?? Object.values(PERMISSIONS);

  mockFrom.mockImplementation((table: string) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    if (table === "organization_memberships") {
      chain.maybeSingle.mockResolvedValue({ data: membership, error: null });
      return chain;
    }
    if (table === "roles") {
      chain.maybeSingle.mockResolvedValue({ data: role, error: null });
      return chain;
    }
    if (table === "role_permissions") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: permissions.map((p) => ({ permission_id: p })),
            error: null,
          }),
        }),
      };
    }
    // Default for other tables (e.g. deployments in webhook route)
    return chain;
  });
}

// ─── App Setup ─────────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("deploy");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
});

// ─── Provider Routes ───────────────────────────────────────────────

describe("POST /deploy/providers", () => {
  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/deploy/providers",
      payload: { provider: "aws", label: "My AWS", apiKey: "key", apiSecret: "secret" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without CREDENTIAL_MANAGE permission", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/deploy/providers",
      headers: { authorization: authHeader() },
      payload: { provider: "aws", label: "My AWS", apiKey: "key", apiSecret: "secret" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("creates provider with correct permissions", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });
    const providerResponse = {
      id: TEST_PROVIDER_ID,
      provider: "aws",
      label: "My AWS",
      region: "us-east-1",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    mockCreateProvider.mockResolvedValue(providerResponse);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/providers",
      headers: { authorization: authHeader() },
      payload: { provider: "aws", label: "My AWS", apiKey: "AKIATEST", apiSecret: "secretvalue" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(TEST_PROVIDER_ID);
    expect(mockCreateProvider).toHaveBeenCalledWith({
      tenantId: TEST_TENANT_ID,
      provider: "aws",
      label: "My AWS",
      apiKey: "AKIATEST",
      apiSecret: "secretvalue",
      region: undefined,
    });
  });

  it("returns 400 for empty provider field", async () => {
    setupPermissionMocks({});

    const res = await app.inject({
      method: "POST",
      url: "/deploy/providers",
      headers: { authorization: authHeader() },
      payload: { provider: "", label: "My AWS", apiKey: "key", apiSecret: "secret" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /deploy/providers", () => {
  it("returns providers scoped to tenant", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });
    mockListProviders.mockResolvedValue([
      { id: TEST_PROVIDER_ID, provider: "aws", label: "Test", region: "us-east-1", createdAt: "2025-01-01T00:00:00Z" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/deploy/providers",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().providers).toHaveLength(1);
    expect(mockListProviders).toHaveBeenCalledWith(TEST_TENANT_ID);
  });
});

describe("DELETE /deploy/providers/:providerId", () => {
  it("deletes provider with CREDENTIAL_MANAGE permission", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });
    mockDeleteProvider.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "DELETE",
      url: `/deploy/providers/${TEST_PROVIDER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockDeleteProvider).toHaveBeenCalledWith(TEST_PROVIDER_ID, TEST_TENANT_ID);
  });
});

// ─── Deployment Routes ─────────────────────────────────────────────

describe("POST /deploy/deployments", () => {
  const validPayload = {
    providerId: TEST_PROVIDER_ID,
    gitConnectionId: TEST_GIT_CONNECTION_ID,
    repo: "acme/my-app",
    branch: "main",
    techStack: ["node"],
    primaryLanguage: "typescript",
    deployStrategy: "managed",
    buildMethod: "dockerfile" as const,
  };

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 without DEPLOY_CREATE permission", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(403);
  });

  it("creates deployment and enqueues job", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });

    const deploymentResponse = {
      id: TEST_DEPLOYMENT_ID,
      providerId: TEST_PROVIDER_ID,
      gitConnectionId: TEST_GIT_CONNECTION_ID,
      projectId: "",
      repo: "acme/my-app",
      branch: "main",
      status: "pending",
      logs: "",
      appUrl: "",
      commitHash: "",
      dockerImage: "",
      deployStrategy: "managed",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    mockCreateAndEnqueueDeployment.mockResolvedValue(deploymentResponse);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(TEST_DEPLOYMENT_ID);
    expect(body.repo).toBe("acme/my-app");
    expect(body.status).toBe("pending");

    // Verify domain function was called with correct params
    expect(mockCreateAndEnqueueDeployment).toHaveBeenCalledOnce();
    const callArg = mockCreateAndEnqueueDeployment.mock.calls[0][0];
    expect(callArg.tenantId).toBe(TEST_TENANT_ID);
    expect(callArg.providerId).toBe(TEST_PROVIDER_ID);
    expect(callArg.repo).toBe("acme/my-app");
    expect(callArg.branch).toBe("main");
  });

  it("skips enqueue when skipPipeline is true", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });

    const deploymentResponse = {
      id: TEST_DEPLOYMENT_ID,
      providerId: TEST_PROVIDER_ID,
      gitConnectionId: TEST_GIT_CONNECTION_ID,
      projectId: "",
      repo: "acme/my-app",
      branch: "main",
      status: "pending",
      logs: "",
      appUrl: "",
      commitHash: "",
      dockerImage: "",
      deployStrategy: "managed",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    mockCreateAndEnqueueDeployment.mockResolvedValue(deploymentResponse);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
      payload: { ...validPayload, skipPipeline: true },
    });

    expect(res.statusCode).toBe(200);
    // skipPipeline is passed to the domain function which handles the logic
    expect(mockCreateAndEnqueueDeployment).toHaveBeenCalledOnce();
    const callArg = mockCreateAndEnqueueDeployment.mock.calls[0][0];
    expect(callArg.skipPipeline).toBe(true);
  });

  it("returns 400 for missing required fields", async () => {
    setupPermissionMocks({});

    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
      payload: { providerId: TEST_PROVIDER_ID },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid providerId format", async () => {
    setupPermissionMocks({});

    const res = await app.inject({
      method: "POST",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
      payload: { ...validPayload, providerId: "not-a-uuid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /deploy/deployments", () => {
  it("lists deployments for tenant", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });
    mockListDeployments.mockResolvedValue([
      {
        id: TEST_DEPLOYMENT_ID,
        providerId: TEST_PROVIDER_ID,
        gitConnectionId: TEST_GIT_CONNECTION_ID,
        projectId: "",
        repo: "acme/my-app",
        branch: "main",
        status: "success",
        logs: "",
        appUrl: "https://app.example.com",
        commitHash: "",
        dockerImage: "",
        deployStrategy: "managed",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/deploy/deployments",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().deployments).toHaveLength(1);
    expect(mockListDeployments).toHaveBeenCalledWith(TEST_TENANT_ID, undefined);
  });

  it("filters by providerId", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });
    mockListDeployments.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: `/deploy/deployments?providerId=${TEST_PROVIDER_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(mockListDeployments).toHaveBeenCalledWith(TEST_TENANT_ID, TEST_PROVIDER_ID);
  });
});

describe("GET /deploy/deployments/:deploymentId", () => {
  it("returns deployment for correct tenant", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });
    mockGetDeployment.mockResolvedValue({
      id: TEST_DEPLOYMENT_ID,
      providerId: TEST_PROVIDER_ID,
      gitConnectionId: TEST_GIT_CONNECTION_ID,
      projectId: "",
      repo: "acme/my-app",
      branch: "main",
      status: "success",
      logs: "",
      appUrl: "",
      commitHash: "",
      dockerImage: "",
      deployStrategy: "managed",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });

    const res = await app.inject({
      method: "GET",
      url: `/deploy/deployments/${TEST_DEPLOYMENT_ID}`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(TEST_DEPLOYMENT_ID);
    expect(mockGetDeployment).toHaveBeenCalledWith(TEST_DEPLOYMENT_ID, TEST_TENANT_ID);
  });
});

describe("POST /deploy/deployments/:deploymentId/destroy", () => {
  it("returns 403 without DEPLOY_MANAGE permission", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW, PERMISSIONS.DEPLOY_CREATE] });

    const res = await app.inject({
      method: "POST",
      url: `/deploy/deployments/${TEST_DEPLOYMENT_ID}/destroy`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(403);
  });

  it("destroys deployment with correct permission", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });
    mockGetDeploymentForDestroy.mockResolvedValue({ id: TEST_DEPLOYMENT_ID, organization_id: TEST_TENANT_ID });
    mockDestroyDeployment.mockResolvedValue({ success: true, message: "Stack deleted" });

    const res = await app.inject({
      method: "POST",
      url: `/deploy/deployments/${TEST_DEPLOYMENT_ID}/destroy`,
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, message: "Stack deleted" });
    expect(mockGetDeploymentForDestroy).toHaveBeenCalledWith(TEST_DEPLOYMENT_ID, TEST_TENANT_ID);
  });
});

// ─── Tofu Generate ─────────────────────────────────────────────────

describe("POST /deploy/tofu/generate", () => {
  it("generates IaC script", async () => {
    setupPermissionMocks({ permissions: Object.values(PERMISSIONS) });
    mockGetProviderForTenant.mockResolvedValue(makeProviderRow());

    const res = await app.inject({
      method: "POST",
      url: "/deploy/tofu/generate",
      headers: { authorization: authHeader() },
      payload: {
        providerId: TEST_PROVIDER_ID,
        repo: "acme/my-app",
        branch: "main",
        techStack: ["node"],
        primaryLanguage: "typescript",
        hasDocker: false,
        deployStrategy: "managed",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.script).toBeDefined();
    expect(body.provider).toBe("aws");
    expect(body.region).toBeDefined();
    expect(body.appName).toBeDefined();
    expect(body.estimatedResources).toBeInstanceOf(Array);
  });
});

// ─── Webhook Route ─────────────────────────────────────────────────

describe("POST /deploy/webhook/aws-pipeline", () => {
  it("returns 401 without webhook signature", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/deploy/webhook/aws-pipeline",
      payload: { buildId: TEST_DEPLOYMENT_ID, status: "success" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("processes valid webhook with correct signature", async () => {
    const { computeWebhookSignature } = await import("../../../shared/security.js");
    const payload = { buildId: TEST_DEPLOYMENT_ID, status: "success", appUrl: "https://app.example.com" };
    const body = JSON.stringify(payload);
    const signature = computeWebhookSignature(body, "test-webhook-secret-for-testing");

    // Mock the domain lookup for the deployment
    mockGetDeploymentForWebhook.mockResolvedValue({ id: TEST_DEPLOYMENT_ID });
    mockApplyDeploymentWebhookUpdate.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/webhook/aws-pipeline",
      headers: { "x-webhook-signature": signature },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(mockApplyDeploymentWebhookUpdate).toHaveBeenCalledWith(
      expect.anything(),
      TEST_DEPLOYMENT_ID,
      payload,
    );
  });

  it("returns success:false for non-existent deployment", async () => {
    const { computeWebhookSignature } = await import("../../../shared/security.js");
    const payload = { buildId: "d0e1f2a3-0123-4345-abcd-eeeeeeeeeeee", status: "success" };
    const body = JSON.stringify(payload);
    const signature = computeWebhookSignature(body, "test-webhook-secret-for-testing");

    mockGetDeploymentForWebhook.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/deploy/webhook/aws-pipeline",
      headers: { "x-webhook-signature": signature },
      payload,
    });

    // Route returns { success: false } when deployment not found
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(false);
  });
});

// ─── SSH Keys ──────────────────────────────────────────────────────

describe("GET /deploy/ssh-keys", () => {
  it("lists SSH keys with DEPLOY_VIEW permission", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });
    mockListSshKeys.mockResolvedValue([
      { id: "a1a1a1a1-1111-4aaa-aaaa-aaaaaaaaaaaa", label: "My Key", publicKey: "ssh-ed25519 AAAA...", fingerprint: "SHA256:abc", createdAt: "2025-01-01T00:00:00Z" },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/deploy/ssh-keys",
      headers: { authorization: authHeader() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().keys).toHaveLength(1);
  });
});

describe("POST /deploy/ssh-keys", () => {
  it("returns 403 without CREDENTIAL_MANAGE permission", async () => {
    setupPermissionMocks({ permissions: [PERMISSIONS.DEPLOY_VIEW] });

    const res = await app.inject({
      method: "POST",
      url: "/deploy/ssh-keys",
      headers: { authorization: authHeader() },
      payload: { label: "My Key", publicKey: "ssh-ed25519 AAAA..." },
    });

    expect(res.statusCode).toBe(403);
  });
});
