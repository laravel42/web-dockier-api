/**
 * Deploy Hook Token — Unit Tests
 *
 * Covers token generation, the legacy project-id prefix fallback, and the
 * timing-safe verification of both candidates.
 */

import { describe, it, expect, vi } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: { from: vi.fn() } }));

const {
  generateDeployHookToken,
  legacyDeployHookToken,
  verifyDeployHookToken,
  readStoredDeployHookToken,
} = await import("../deploy-hook.js");

const PROJECT_ID = "c9d0e1f2-9012-4234-abcd-999999999999";

describe("generateDeployHookToken", () => {
  it("returns 64 hex characters (32 random bytes)", () => {
    const token = generateDeployHookToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on each call", () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateDeployHookToken()));

    expect(tokens.size).toBe(10);
  });
});

describe("legacyDeployHookToken", () => {
  it("is the first 8 characters of the project id", () => {
    expect(legacyDeployHookToken(PROJECT_ID)).toBe("c9d0e1f2");
  });

  it("returns the whole string when it is shorter than 8 characters", () => {
    expect(legacyDeployHookToken("abc")).toBe("abc");
  });
});

describe("verifyDeployHookToken", () => {
  it("accepts the legacy project-id prefix so existing hook URLs keep working", () => {
    expect(verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: legacyDeployHookToken(PROJECT_ID),
      storedToken: null,
    })).toBe(true);
  });

  it("accepts the legacy prefix even when a strong token is stored", () => {
    expect(verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: legacyDeployHookToken(PROJECT_ID),
      storedToken: generateDeployHookToken(),
    })).toBe(true);
  });

  it("accepts the stored strong token", () => {
    const stored = generateDeployHookToken();

    expect(verifyDeployHookToken({ projectId: PROJECT_ID, provided: stored, storedToken: stored })).toBe(true);
  });

  it("rejects a wrong token of the same length as the legacy prefix", () => {
    expect(verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: "00000000",
      storedToken: null,
    })).toBe(false);
  });

  it("rejects a wrong token of the same length as the stored token", () => {
    expect(verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: "f".repeat(64),
      storedToken: generateDeployHookToken(),
    })).toBe(false);
  });

  it("does not throw on a length mismatch against either candidate", () => {
    expect(() => verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: "x",
      storedToken: generateDeployHookToken(),
    })).not.toThrow();

    expect(verifyDeployHookToken({
      projectId: PROJECT_ID,
      provided: "x".repeat(200),
      storedToken: generateDeployHookToken(),
    })).toBe(false);
  });

  it("rejects an empty token", () => {
    expect(verifyDeployHookToken({ projectId: PROJECT_ID, provided: "", storedToken: null })).toBe(false);
  });
});

describe("readStoredDeployHookToken", () => {
  it("returns the stored token when settings carry one", () => {
    expect(readStoredDeployHookToken({ deployHookToken: "abc" })).toBe("abc");
  });

  it("returns null for absent, empty, or non-string values", () => {
    expect(readStoredDeployHookToken(null)).toBeNull();
    expect(readStoredDeployHookToken({})).toBeNull();
    expect(readStoredDeployHookToken({ deployHookToken: "" })).toBeNull();
    expect(readStoredDeployHookToken({ deployHookToken: 42 })).toBeNull();
  });
});
