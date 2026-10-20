import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, makeProviderRow, TEST_PROVIDER_ID, TEST_TENANT_ID } from "../../shared/__tests__/test-helpers.js";

// ─── Mocks ─────────────────────────────────────────────────────────

vi.mock("../../shared/config.js", () => ({
  env: createTestEnv({ ENV_ENCRYPTION_KEY: "a".repeat(64) }),
}));

const mockFrom = vi.fn();

vi.mock("../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const { getProviderCredentials } = await import("../provider-credentials.js");
const { createProvider, updateProvider } = await import("../../services/deploy/domain/providers.js");
const { decryptJson, encryptJson } = await import("../../shared/auth/crypto.js");

// ─── Helpers ───────────────────────────────────────────────────────

const SECRET = "wJalrSuperSecretAwsSecretAccessKey";

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

/** Run createProvider and return the row actually sent to insert(). */
async function captureInsertedRow(): Promise<Record<string, unknown>> {
  const insertChain = createChain({ data: null, error: null });
  mockFrom.mockReturnValue(insertChain);

  await createProvider({
    tenantId: TEST_TENANT_ID,
    provider: "aws",
    label: "Prod AWS",
    credentials: { accessKeyId: "AKIAXXXXXXXXXXXXXXXX", secretAccessKey: SECRET },
    region: "us-east-1",
  });

  const insert = insertChain.insert as ReturnType<typeof vi.fn>;
  return insert.mock.calls[0][0] as Record<string, unknown>;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("provider credentials — encryption at rest", () => {
  beforeEach(() => mockFrom.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("writes the credentials only to the encrypted column", async () => {
    const row = await captureInsertedRow();

    expect(row.credentials).toEqual({});
    expect(typeof row.credentials_encrypted).toBe("string");
    expect(row.credentials_encrypted as string).not.toContain(SECRET);
  });

  it("reads the encrypted credentials back as the original values", async () => {
    const row = await captureInsertedRow();

    mockFrom.mockReturnValue(
      createChain({
        data: makeProviderRow({ credentials: {}, credentials_encrypted: row.credentials_encrypted }),
        error: null,
      }),
    );

    const resolved = await getProviderCredentials(TEST_PROVIDER_ID);
    expect(resolved.credential).toEqual({
      kind: "aws",
      accessKeyId: "AKIAXXXXXXXXXXXXXXXX",
      secretAccessKey: SECRET,
    });
  });

  it("falls back to the plaintext blob on a row with no encrypted copy", async () => {
    mockFrom.mockReturnValue(createChain({ data: makeProviderRow(), error: null }));

    const resolved = await getProviderCredentials(TEST_PROVIDER_ID);
    expect(resolved.credential).toEqual({
      kind: "aws",
      accessKeyId: "AKIAXXXXXXXXXXXXXXXX",
      secretAccessKey: "wJalrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    });
  });

  it("fails with a descriptive error when the stored credentials cannot be decrypted", async () => {
    mockFrom.mockReturnValue(
      createChain({ data: makeProviderRow({ credentials_encrypted: "not-a-valid-payload" }), error: null }),
    );

    await expect(getProviderCredentials(TEST_PROVIDER_ID)).rejects.toThrow(/Re-enter them in Settings/);
  });

  it("partial rotation writes the encrypted column and blanks the plaintext one", async () => {
    const existing = makeProviderRow({
      credentials: {},
      credentials_encrypted: encryptJson({ kind: "aws", accessKeyId: "AKIAOLD", secretAccessKey: "old-secret" }),
    });
    const readChain = createChain({ data: existing, error: null });
    const updateChain = createChain({ data: makeProviderRow(), error: null });

    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      return call === 1 ? readChain : updateChain;
    });

    await updateProvider({
      providerId: TEST_PROVIDER_ID,
      tenantId: TEST_TENANT_ID,
      credentials: { secretAccessKey: "rotated-secret" },
    });

    const update = updateChain.update as ReturnType<typeof vi.fn>;
    const updates = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updates.credentials).toEqual({});
    expect(updates.credentials_encrypted as string).not.toContain("rotated-secret");
    // The untouched field survives the rotation.
    expect(decryptJson(updates.credentials_encrypted as string)).toEqual({
      kind: "aws",
      accessKeyId: "AKIAOLD",
      secretAccessKey: "rotated-secret",
    });
  });
});
