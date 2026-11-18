/**
 * Custom domains in the project's activity. The event types and UI labels
 * existed, but nothing recorded them.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { authHeader, createTestEnv, setupPermissionMocks } from "../../../shared/__tests__/test-helpers.js";
import { PERMISSIONS } from "../../../shared/permissions/constants.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv() }));
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}));
const record = vi.hoisted(() => vi.fn());
vi.mock("../../../shared/service-clients/activity.js", () => ({ safeRecordActivity: record }));
vi.mock("../domain/worker.js", () => ({ enqueueDomainApply: vi.fn(async () => {}), enqueueCertificateIssue: vi.fn() }));
vi.mock("../domain/static/cloud.js", () => ({
  resolveStaticCloud: vi.fn(async () => ({ cloud: null, routeTarget: null, apexAliasAck: [] })),
}));
vi.mock("../domain/dns-advisory.js", () => ({ existingRecordAdvisory: vi.fn(async () => null) }));
vi.mock("../domain/apex-ack.js", () => ({ appendApexAck: vi.fn(), removeApexAck: vi.fn(async () => {}) }));
const domains = vi.hoisted(() => ({ createDomain: vi.fn(), deleteDomain: vi.fn(), getDomainById: vi.fn() }));
vi.mock("../domain/domains.js", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...domains }));

const PROJECT = "c9d0e1f2-9012-4234-abcd-999999999999";
const DOMAIN = "aaaaaaaa-1111-4111-8111-111111111111";

let app: FastifyInstance;
beforeAll(async () => {
  const { buildApp } = await import("../../../app.js");
  app = await buildApp("domains");
});

beforeEach(async () => {
  vi.clearAllMocks();
  const { clearPermissionCache } = await import("../../../shared/permissions/authorization.js");
  clearPermissionCache();
  setupPermissionMocks(mockFrom, { permissions: Object.values(PERMISSIONS) });
  const permissionChain = mockFrom.getMockImplementation()!;
  mockFrom.mockImplementation((table: string) => {
    if (table !== "projects") return permissionChain(table);
    const chain: Record<string, unknown> = { maybeSingle: async () => ({ data: { id: PROJECT, name: "p" }, error: null }) };
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    return chain;
  });
});

const recorded = () => record.mock.calls.map(([e]) => ({ eventType: e.eventType, description: e.description }));

describe("domains in activity", () => {
  it("records a domain added, by its normalized name", async () => {
    domains.createDomain.mockImplementation(async ({ name }: { name: string }) => ({
      id: DOMAIN, projectId: PROJECT, name, isPrimary: false, redirectWww: false, wildcard: false,
      sslStatus: "pending", dnsVerified: false, createdAt: "", updatedAt: "",
    }));
    const res = await app.inject({
      method: "POST", url: `/projects/${PROJECT}/domains`, headers: { authorization: authHeader() },
      payload: { name: "WWW.Example.com." },
    });
    expect(res.statusCode).toBe(200);
    expect(recorded()).toEqual([{ eventType: "domain_added", description: "Added domain www.example.com" }]);
  });

  it("records a domain removed, by the name it had", async () => {
    domains.getDomainById.mockResolvedValue({ name: "www.example.com" });
    domains.deleteDomain.mockResolvedValue(undefined);
    const res = await app.inject({ method: "DELETE", url: `/projects/${PROJECT}/domains/${DOMAIN}`, headers: { authorization: authHeader() } });
    expect(res.statusCode).toBe(200);
    expect(recorded()).toEqual([{ eventType: "domain_removed", description: "Removed domain www.example.com" }]);
  });
});
