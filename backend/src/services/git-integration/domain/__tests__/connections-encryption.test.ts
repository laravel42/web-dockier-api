import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, TEST_TENANT_ID } from "../../../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../../../shared/config.js", () => ({
  env: createTestEnv({ ENV_ENCRYPTION_KEY: "a".repeat(64) }),
}));

const mockFrom = vi.fn();

vi.mock("../../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const { createConnection, deleteConnection, getConnection, updateConnection } = await import("../connections.js");

// ─── Helpers ───────────────────────────────────────────────────────

const TOKEN = "ghp_SuperSecretPersonalAccessToken";
const CONNECTION_ID = "e1f2a3b4-1234-4abc-8def-aaaaaaaaaaaa";

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "neq", "is", "order"]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  // Queries without .single() are awaited directly.
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

/** Run createConnection and return the row actually sent to insert(). */
async function captureInsertedRow(): Promise<Record<string, unknown>> {
  const duplicateCheck = createChain({ data: null, error: null });
  const insertChain = createChain({ data: null, error: null });

  let call = 0;
  mockFrom.mockImplementation(() => {
    call += 1;
    return call === 1 ? duplicateCheck : insertChain;
  });

  await createConnection({
    tenantId: TEST_TENANT_ID,
    provider: "github",
    personalToken: TOKEN,
    label: "Primary",
    repoUrl: "https://github.com/acme/app",
    endpoint: "https://api.github.com",
  });

  const insert = insertChain.insert as ReturnType<typeof vi.fn>;
  return insert.mock.calls[0][0] as Record<string, unknown>;
}

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    organization_id: TEST_TENANT_ID,
    provider: "github",
    personal_token: "",
    personal_token_encrypted: null,
    label: "Primary",
    repo_url: "https://github.com/acme/app",
    endpoint: "https://api.github.com",
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("git connections — token encryption at rest", () => {
  beforeEach(() => mockFrom.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("writes the token only to the encrypted column", async () => {
    const row = await captureInsertedRow();

    expect(row.personal_token).toBe("");
    expect(typeof row.personal_token_encrypted).toBe("string");
    expect(row.personal_token_encrypted as string).not.toContain(TOKEN);
  });

  it("reads the encrypted token back as the original value", async () => {
    const row = await captureInsertedRow();

    mockFrom.mockReturnValue(
      createChain({
        data: legacyRow({ personal_token_encrypted: row.personal_token_encrypted }),
        error: null,
      }),
    );

    const conn = await getConnection(CONNECTION_ID);
    expect(conn.personal_token).toBe(TOKEN);
  });

  it("falls back to the plaintext column on a row with no encrypted copy", async () => {
    mockFrom.mockReturnValue(
      createChain({ data: legacyRow({ personal_token: "ghp_legacy_plaintext" }), error: null }),
    );

    const conn = await getConnection(CONNECTION_ID);
    expect(conn.personal_token).toBe("ghp_legacy_plaintext");
  });

  it("fails with a descriptive error when the stored token cannot be decrypted", async () => {
    mockFrom.mockReturnValue(
      createChain({ data: legacyRow({ personal_token_encrypted: "not-a-valid-payload" }), error: null }),
    );

    await expect(getConnection(CONNECTION_ID)).rejects.toThrow(/Re-enter the token/);
  });

  it("lets an undecryptable connection still be re-tokenised and deleted", async () => {
    const broken = legacyRow({ personal_token_encrypted: "not-a-valid-payload" });
    const readChain = createChain({ data: broken, error: null });
    const writeChain = createChain({ data: null, error: null });

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call % 2 === 1 ? readChain : writeChain;
    });

    await updateConnection({
      connectionId: CONNECTION_ID,
      tenantId: TEST_TENANT_ID,
      label: "Primary",
      personalToken: "ghp_ReplacementToken",
    });
    await deleteConnection(CONNECTION_ID, TEST_TENANT_ID);

    expect((writeChain.update as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((writeChain.delete as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("rotation writes the encrypted column and blanks the plaintext one", async () => {
    const readChain = createChain({ data: legacyRow({ personal_token: "ghp_legacy_plaintext" }), error: null });
    const updateChain = createChain({ data: null, error: null });

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? readChain : updateChain;
    });

    await updateConnection({
      connectionId: CONNECTION_ID,
      tenantId: TEST_TENANT_ID,
      label: "Primary",
      personalToken: "ghp_RotatedToken",
    });

    const update = updateChain.update as ReturnType<typeof vi.fn>;
    const updates = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updates.personal_token).toBe("");
    expect(typeof updates.personal_token_encrypted).toBe("string");
    expect(updates.personal_token_encrypted as string).not.toContain("ghp_RotatedToken");
  });
});
