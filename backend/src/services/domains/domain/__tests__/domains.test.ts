/**
 * Regression tests for the error-surfacing fixes in `domains.ts`.
 *
 * These lock in two edge cases where a swallowed Supabase read/update error
 * used to let the function proceed and corrupt the primary-domain invariant:
 *
 * - H2 (primary): `updateDomain({ isPrimary: true })` unsets other primaries
 *   first. If that update errors, the function must throw instead of
 *   continuing (which could leave two primaries).
 * - H1: `createDomain`'s existence/count pre-check error must surface, not be
 *   read as "zero existing domains" and inserted as a second primary.
 *
 * Supabase is mocked at the module level, matching the sibling suites. The
 * builder is both chainable AND thenable so an awaited terminal `.eq()` (the
 * unset update / count read) resolves without a trailing `.single()`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const { updateDomain, createDomain, createCertificate, DomainsError } = await import("../domains.js");

// ─── Chainable + thenable query builder ────────────────────────────

type QueryResult = { data?: unknown; error?: unknown; count?: unknown };

function qb(result: QueryResult): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (onFulfilled: (value: QueryResult) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  for (const method of ["update", "select", "insert", "eq", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────

describe("updateDomain", () => {
  it("throws a DomainsError when unsetting other primaries fails", async () => {
    const unsetError = { error: { message: "unset failed", code: "XX000" } };
    mockFrom.mockReturnValue(qb(unsetError));

    await expect(
      updateDomain({ tenantId: "t1", projectId: "p1", domainId: "d1", isPrimary: true }),
    ).rejects.toThrow("Failed to update primary domain");

    try {
      await updateDomain({ tenantId: "t1", projectId: "p1", domainId: "d1", isPrimary: true });
      throw new Error("expected updateDomain to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DomainsError);
      expect((err as InstanceType<typeof DomainsError>).code).toBe("internal");
    }
  });
});

describe("createDomain", () => {
  it("throws a DomainsError when the duplicate pre-check read fails", async () => {
    mockFrom.mockReturnValueOnce(qb({ count: null, error: { message: "count failed", code: "XX000" } }));

    await expect(
      createDomain({ tenantId: "t1", projectId: "p1", name: "ex.com" }),
    ).rejects.toThrow("Failed to check existing domains");
  });
});

describe("createCertificate", () => {
  it("refuses a domain this project does not serve, before storing anything", async () => {
    // Certbot runs on the project's server; a certificate for a name nginx does
    // not serve could never be used.
    const lookup = qb({ data: null, error: null });
    mockFrom.mockReturnValue(lookup);

    await expect(
      createCertificate({ tenantId: "t1", projectId: "p1", type: "lets_encrypt", domainName: "other.example.com" }),
    ).rejects.toThrow(/Add "other.example.com" to this project's domains/);
    expect(lookup.insert).not.toHaveBeenCalled();
  });

  it("stores a requested certificate as pending, linked to its domain", async () => {
    const lookup = qb({ data: { id: "dom-1" }, error: null });
    const insert = qb({
      data: {
        id: "c1", organization_id: "t1", project_id: "p1", domain_id: "dom-1", type: "lets_encrypt",
        status: "pending", domain_name: "app.example.com", expires_at: null, issued_at: null,
        created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(insert);

    const cert = await createCertificate({ tenantId: "t1", projectId: "p1", type: "lets_encrypt", domainName: "app.example.com" });

    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ domain_id: "dom-1", status: "pending" }));
    expect(cert.status).toBe("pending");
  });
});
