/**
 * Shared Test Helpers
 *
 * Provides utilities for building a Fastify app in test mode,
 * generating valid JWTs, mocking Supabase queries, and setting up
 * permission resolution mocks.
 */

import { vi } from "vitest";
import jwt from "jsonwebtoken";

// ─── Constants ─────────────────────────────────────────────────────
// UUIDs must pass Zod's strict UUID v4 format: version nibble [1-8], variant nibble [89ab]

export const TEST_JWT_SECRET = "test-secret-at-least-16-chars";
export const TEST_TENANT_ID = "a1b2c3d4-1234-4abc-8def-111111111111";
export const TEST_USER_ID = "b2c3d4e5-2345-4bcd-9abc-222222222222";
export const TEST_EMAIL = "test@dockier.dev";
export const TEST_ROLE_ID = "c3d4e5f6-3456-4cde-abcd-333333333333";
export const OTHER_TENANT_ID = "d4e5f6a7-4567-4def-bcde-444444444444";

// ─── JWT Factory ───────────────────────────────────────────────────

export interface TestTokenOptions {
  userId?: string;
  email?: string;
  tenantId?: string;
  expiresIn?: string;
}

export function signTestToken(opts: TestTokenOptions = {}): string {
  const payload = {
    userId: opts.userId ?? TEST_USER_ID,
    email: opts.email ?? TEST_EMAIL,
    tenantId: opts.tenantId ?? TEST_TENANT_ID,
  };
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: opts.expiresIn ?? "1h" } as jwt.SignOptions);
}

export function authHeader(opts: TestTokenOptions = {}): string {
  return `Bearer ${signTestToken(opts)}`;
}

// ─── Config Mock Factory ───────────────────────────────────────────

/**
 * Create a test environment config object.
 * Use this in `vi.mock("../../../shared/config.js", ...)` blocks.
 *
 * @example
 * ```ts
 * vi.mock("../../../shared/config.js", () => ({
 *   env: createTestEnv({ WEBHOOK_SECRET: "test-secret" }),
 * }));
 * ```
 */
export function createTestEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "test",
    PORT: 4000,
    SERVICE_NAME: "gateway",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_minimum_length",
    SUPABASE_SECRET_KEY: "sb_secret_test_key_minimum_length_value",
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGIN: "*",
    ...overrides,
  };
}

// ─── Supabase Mock Builder ─────────────────────────────────────────

/**
 * Creates a mock Supabase chain that supports the fluent query API.
 * Configure the final result with `mockResult` before the query executes.
 */
export function createMockSupabaseChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from", "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
    "in", "is", "or", "not", "filter", "match", "contains",
    "single", "maybeSingle", "order", "limit", "range", "textSearch",
  ];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods return the result
  chain["single"] = vi.fn().mockResolvedValue(result);
  chain["maybeSingle"] = vi.fn().mockResolvedValue(result);
  // Override the chain return for non-terminal methods to resolve with result when awaited
  chain["then"] = vi.fn((resolve: (value: unknown) => void) => resolve(result));

  // Make the chain thenable (for queries without .single())
  const proxy = new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve(result);
      }
      return target[prop as string] ?? vi.fn().mockReturnValue(proxy);
    },
  });

  return proxy;
}

// ─── Permission Mock Setup ─────────────────────────────────────────

export interface PermissionMockOptions {
  /** Organization membership row. Defaults to ADMIN_MEMBERSHIP. */
  membership?: Record<string, unknown> | null;
  /** Role row. Defaults to ADMIN_ROLE. */
  role?: Record<string, unknown> | null;
  /** Array of permission strings. Defaults to all PERMISSIONS. */
  permissions?: string[];
}

/**
 * Set up the permission resolution chain on a mockFrom function.
 *
 * This simulates the authorization middleware's DB queries:
 *   organization_memberships → roles → role_permissions
 *
 * Call this in each test that needs authenticated/authorized access.
 *
 * @param mockFrom - The vi.fn() that replaces supabaseAdmin.from()
 * @param opts - Override membership, role, or permissions
 *
 * @example
 * ```ts
 * const mockFrom = vi.fn();
 * vi.mock("../../../shared/supabase/client.js", () => ({
 *   supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
 * }));
 *
 * // Grant all permissions:
 * setupPermissionMocks(mockFrom, { permissions: Object.values(PERMISSIONS) });
 *
 * // Grant specific permissions:
 * setupPermissionMocks(mockFrom, { permissions: [PERMISSIONS.DEPLOY_VIEW] });
 * ```
 */
export function setupPermissionMocks(
  mockFrom: ReturnType<typeof vi.fn>,
  opts: PermissionMockOptions = {},
): void {
  const membership = opts.membership ?? ADMIN_MEMBERSHIP;
  const role = opts.role ?? ADMIN_ROLE;
  const permissions = opts.permissions ?? [];

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
    // Default for other tables
    return chain;
  });
}

// ─── Permission Mock Helpers ───────────────────────────────────────

/**
 * Standard membership row for a user with admin role in the test tenant.
 */
export const ADMIN_MEMBERSHIP = {
  role_id: TEST_ROLE_ID,
  is_owner: false,
  status: "active",
};

export const OWNER_MEMBERSHIP = {
  role_id: TEST_ROLE_ID,
  is_owner: true,
  status: "active",
};

/**
 * Standard role row for the admin system role.
 */
export const ADMIN_ROLE = {
  id: TEST_ROLE_ID,
  system_key: "admin",
};

/**
 * Standard member role (fewer permissions).
 */
export const MEMBER_ROLE = {
  id: "e5f6a7b8-5678-4ef0-abcd-555555555555",
  system_key: "member",
};

// ─── Provider Fixtures ─────────────────────────────────────────────

export const TEST_PROVIDER_ID = "f6a7b8c9-6789-4f01-abcd-666666666666";

export function makeProviderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_PROVIDER_ID,
    organization_id: TEST_TENANT_ID,
    provider: "aws",
    label: "Test AWS",
    credentials: {
      kind: "aws",
      accessKeyId: "AKIAXXXXXXXXXXXXXXXX",
      secretAccessKey: "wJalrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    },
    region: "us-east-1",
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Deployment Fixtures ───────────────────────────────────────────

export const TEST_DEPLOYMENT_ID = "a7b8c9d0-7890-4012-abcd-777777777777";
export const TEST_GIT_CONNECTION_ID = "b8c9d0e1-8901-4123-abcd-888888888888";

export function makeDeploymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_DEPLOYMENT_ID,
    organization_id: TEST_TENANT_ID,
    provider_id: TEST_PROVIDER_ID,
    git_connection_id: TEST_GIT_CONNECTION_ID,
    project_id: "c9d0e1f2-9012-4234-abcd-999999999999",
    repo: "acme/my-app",
    branch: "main",
    status: "pending",
    logs: "",
    app_url: "",
    commit_hash: "",
    docker_image: "",
    deploy_strategy: "managed",
    tofu_script: "",
    build_method: "dockerfile",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}
