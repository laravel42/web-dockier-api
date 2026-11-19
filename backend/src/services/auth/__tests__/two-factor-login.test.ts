/**
 * 2FA at sign-in. Before this, `two_factor_enabled` was only displayed: the email
 * code alone issued a session, so enabling 2FA protected nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { TEST_USER_ID, TEST_EMAIL, TEST_TENANT_ID, createTestEnv } from "../../../shared/__tests__/test-helpers.js";

vi.mock("../../../shared/config.js", () => ({ env: createTestEnv({ ENV_ENCRYPTION_KEY: "a".repeat(64) }) }));

const verifyOtp = vi.fn();
const mockFrom = vi.fn();
vi.mock("../../../shared/supabase/client.js", () => ({
  supabaseAdmin: { from: (...a: unknown[]) => mockFrom(...a), auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a) } },
}));
vi.mock("../domain/membership.js", () => ({
  listMembershipsForUser: vi.fn(async () => [
    { id: "m1", tenantId: TEST_TENANT_ID, tenantName: "T", tenantSlug: "t", roleName: "Admin", isOwner: true },
  ]),
}));
vi.mock("../../roles/seed.js", () => ({ seedDefaultRoles: vi.fn() }));

const { verifyOtpAndProvision, completeTwoFactorLogin } = await import("../domain/registration.js");
const { verifyAuthToken } = await import("../../../shared/auth/auth.js");
const { generateRecoveryCodes } = await import("../../../shared/auth/totp.js");

const SECRET = "JBSWY3DPEHPK3PXP";
let userRow: Record<string, unknown>;
const updates: Array<Record<string, unknown>> = [];

/** Every builder method returns the chain; maybeSingle/await resolve to the current users row. */
function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "upsert"]) c[m] = vi.fn(() => c);
  c.update = vi.fn((u: Record<string, unknown>) => { updates.push(u); return c; });
  c.maybeSingle = vi.fn(async () => ({ data: userRow, error: null }));
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return c;
}

function currentTotp(secret: string): string {
  // RFC 6238 with SHA-1, as in shared/auth/totp.ts.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(buf).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  mockFrom.mockImplementation(() => chain());
  verifyOtp.mockResolvedValue({ data: { user: { id: TEST_USER_ID, email: TEST_EMAIL, user_metadata: {} } }, error: null });
});

describe("sign-in with 2FA enabled", () => {
  it("issues no session after the email code, only a challenge", async () => {
    userRow = { two_factor_enabled: true };
    const res = await verifyOtpAndProvision({ email: TEST_EMAIL, token: "123456", type: "email" });
    expect(res).toMatchObject({ twoFactorRequired: true });
    expect("session" in res).toBe(false);
    // The challenge must not work as an API token.
    expect(verifyAuthToken((res as { challengeToken: string }).challengeToken)).toBeNull();
  });

  it("issues a session for a valid authenticator code", async () => {
    userRow = { two_factor_enabled: true, two_factor_secret: SECRET, two_factor_secret_encrypted: null, two_factor_recovery_codes: [] };
    const { challengeToken } = (await verifyOtpAndProvision({ email: TEST_EMAIL, token: "1", type: "email" })) as { challengeToken: string };
    const res = await completeTwoFactorLogin(challengeToken, currentTotp(SECRET));
    expect(verifyAuthToken(res.session.token)).toMatchObject({ userId: TEST_USER_ID, tenantId: TEST_TENANT_ID });
  });

  it("refuses a wrong code and a forged challenge", async () => {
    userRow = { two_factor_enabled: true, two_factor_secret: SECRET, two_factor_secret_encrypted: null, two_factor_recovery_codes: [] };
    const { challengeToken } = (await verifyOtpAndProvision({ email: TEST_EMAIL, token: "1", type: "email" })) as { challengeToken: string };
    await expect(completeTwoFactorLogin(challengeToken, "000000")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(completeTwoFactorLogin("not-a-token", currentTotp(SECRET))).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("accepts a recovery code once and removes it", async () => {
    const { codes, hashes } = generateRecoveryCodes();
    userRow = { two_factor_enabled: true, two_factor_secret: SECRET, two_factor_secret_encrypted: null, two_factor_recovery_codes: hashes };
    const { challengeToken } = (await verifyOtpAndProvision({ email: TEST_EMAIL, token: "1", type: "email" })) as { challengeToken: string };
    await completeTwoFactorLogin(challengeToken, codes[0]!.toLowerCase());
    const saved = updates.find((u) => "two_factor_recovery_codes" in u)!.two_factor_recovery_codes as string[];
    expect(saved).toHaveLength(9);
    expect(saved).not.toContain(hashes[0]);
  });

  it("signs in without a challenge when 2FA is off", async () => {
    userRow = { two_factor_enabled: false };
    const res = await verifyOtpAndProvision({ email: TEST_EMAIL, token: "1", type: "email" });
    expect("session" in res).toBe(true);
  });
});
