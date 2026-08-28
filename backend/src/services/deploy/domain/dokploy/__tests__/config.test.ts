/**
 * Tests for Dokploy config validation. The `env` module is mocked per-test so
 * we can toggle DEPLOY_PROVIDER and the DOKPLOY_* values.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv: Record<string, unknown> = {};

vi.mock("../../../../../shared/config.js", () => ({
  get env() { return mockEnv; },
}));

const { collectDokployConfigIssues, assertDokployConfigured, warnIfDokployMisconfigured } =
  await import("../config.js");

function setEnv(values: Record<string, unknown>) {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  Object.assign(mockEnv, values);
}

afterEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  vi.clearAllMocks();
});

const FULL = {
  DEPLOY_PROVIDER: "dokploy",
  DOKPLOY_API_URL: "https://dokploy.test/api",
  DOKPLOY_API_TOKEN: "tok",
  DOKPLOY_SSH_KEY_ID: "key-1",
};

describe("collectDokployConfigIssues", () => {
  it("returns no issues when fully configured", () => {
    setEnv(FULL);
    expect(collectDokployConfigIssues()).toEqual([]);
  });

  it("flags each missing DOKPLOY_* variable", () => {
    setEnv({ DEPLOY_PROVIDER: "dokploy" });
    const keys = collectDokployConfigIssues().map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(["DOKPLOY_API_URL", "DOKPLOY_API_TOKEN", "DOKPLOY_SSH_KEY_ID"]),
    );
  });

  it("flags only the missing SSH key when URL + token are set", () => {
    setEnv({ ...FULL, DOKPLOY_SSH_KEY_ID: "" });
    const keys = collectDokployConfigIssues().map((i) => i.key);
    expect(keys).toEqual(["DOKPLOY_SSH_KEY_ID"]);
  });
});

describe("assertDokployConfigured", () => {
  it("throws with an actionable, aggregated message when misconfigured", () => {
    setEnv({ DEPLOY_PROVIDER: "dokploy" });
    expect(() => assertDokployConfigured()).toThrow(/DOKPLOY_API_URL[\s\S]*DOKPLOY_API_TOKEN[\s\S]*DOKPLOY_SSH_KEY_ID/);
  });

  it("does not throw when fully configured", () => {
    setEnv(FULL);
    expect(() => assertDokployConfigured()).not.toThrow();
  });

  it("is a no-op for the native provider even if DOKPLOY_* is unset", () => {
    setEnv({ DEPLOY_PROVIDER: "native" });
    expect(() => assertDokployConfigured()).not.toThrow();
  });
});

describe("warnIfDokployMisconfigured", () => {
  it("logs once when misconfigured under the dokploy provider", () => {
    setEnv({ DEPLOY_PROVIDER: "dokploy", DOKPLOY_API_URL: "https://x/api", DOKPLOY_API_TOKEN: "t" });
    const log = vi.fn();
    warnIfDokployMisconfigured(log);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/DOKPLOY_SSH_KEY_ID/);
  });

  it("stays silent when fully configured", () => {
    setEnv(FULL);
    const log = vi.fn();
    warnIfDokployMisconfigured(log);
    expect(log).not.toHaveBeenCalled();
  });

  it("stays silent for the native provider", () => {
    setEnv({ DEPLOY_PROVIDER: "native" });
    const log = vi.fn();
    warnIfDokployMisconfigured(log);
    expect(log).not.toHaveBeenCalled();
  });
});
