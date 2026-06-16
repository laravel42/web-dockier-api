import { describe, expect, it, vi, afterEach } from "vitest";
import { buildOtpAuthUrl, generateTotpSecret, verifyTotpToken } from "../totp.js";

describe("totp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("builds an otpauth URL", () => {
    const url = buildOtpAuthUrl("user@example.com", "JBSWY3DPEHPK3PXP");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("user%40example.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
  });

  it("verifies a matching code for the active window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("1970-01-01T00:00:59Z"));
    expect(verifyTotpToken("996554", "JBSWY3DPEHPK3PXP")).toBe(true);
    expect(verifyTotpToken("000000", "JBSWY3DPEHPK3PXP")).toBe(false);
  });
});
