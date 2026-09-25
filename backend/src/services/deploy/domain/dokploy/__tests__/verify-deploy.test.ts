import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The stage sleeps between attempts; make it instant.
vi.mock("../../../../../shared/utils/time.js", () => ({
  sleep: () => Promise.resolve(),
  logTimestamp: () => "2025-01-01T00:00:00Z",
}));

const { stageVerifyDeploy } = await import("../stages/verify-deploy.js");

describe("stageVerifyDeploy", () => {
  let logLines: string[];
  const log = async (line: string) => { logLines.push(line); };

  beforeEach(() => { logLines = []; });
  afterEach(() => vi.clearAllMocks());

  /** Minimal Response-like stub. */
  const resp = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;

  it("skips when there is no app URL", async () => {
    const result = await stageVerifyDeploy({ appUrl: "", containerPort: 3000, log });
    expect(result).toEqual({ ok: false, reason: "skipped" });
  });

  it("reports success when the app responds 200", async () => {
    const fetchImpl = vi.fn(async () => resp(200));
    const result = await stageVerifyDeploy({
      appUrl: "http://app.test", containerPort: 3000, log, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, status: 200, reason: "ok" });
    expect(logLines.some((l) => /App is responding \(HTTP 200\)/.test(l))).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("treats a non-gateway error status as reachable (routing works)", async () => {
    const fetchImpl = vi.fn(async () => resp(404));
    const result = await stageVerifyDeploy({
      appUrl: "http://app.test", containerPort: 3000, log, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, status: 404, reason: "http" });
    expect(logLines.some((l) => /reachable and responded HTTP 404/.test(l))).toBe(true);
  });

  it("retries then reports a gateway error with port guidance", async () => {
    const fetchImpl = vi.fn(async () => resp(502));
    const result = await stageVerifyDeploy({
      appUrl: "http://app.test",
      containerPort: 3000,
      log,
      attempts: 3,
      intervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      runtimeHint: { buildType: "railpack", kind: "server", startCommandApplied: true, repoHasStartScript: false },
    });
    expect(result).toMatchObject({ ok: false, status: 502, reason: "gateway" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(logLines.some((l) => /Bad Gateway/.test(l))).toBe(true);
    expect(logLines.some((l) => /forwarding to container port 3000/.test(l))).toBe(true);
    expect(logLines.some((l) => /0\.0\.0\.0/.test(l))).toBe(true);
  });

  it("diagnoses a missing start command on a gateway error", async () => {
    const fetchImpl = vi.fn(async () => resp(502));
    await stageVerifyDeploy({
      appUrl: "http://app.test",
      containerPort: 3000,
      log,
      attempts: 1,
      intervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      runtimeHint: { buildType: "railpack", framework: "astro", kind: "server", startCommandApplied: false, repoHasStartScript: false },
    });
    expect(logLines.some((l) => /no production start command/i.test(l))).toBe(true);
    expect(logLines.some((l) => /node \.\/dist\/server\/entry\.mjs/.test(l))).toBe(true);
  });

  it("diagnoses a platform adapter on a gateway error", async () => {
    const fetchImpl = vi.fn(async () => resp(502));
    await stageVerifyDeploy({
      appUrl: "http://app.test",
      containerPort: 3000,
      log,
      attempts: 1,
      intervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      runtimeHint: { buildType: "railpack", framework: "astro", kind: "server", platformAdapter: true },
    });
    expect(logLines.some((l) => /platform adapter/i.test(l))).toBe(true);
    expect(logLines.some((l) => /@astrojs\/node/.test(l))).toBe(true);
  });

  it("reports unreachable when the request always throws", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const result = await stageVerifyDeploy({
      appUrl: "http://app.test",
      containerPort: 3000,
      log,
      attempts: 2,
      intervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, reason: "unreachable" });
    expect(logLines.some((l) => /was not reachable/.test(l))).toBe(true);
  });

  it("succeeds on a later attempt after an initial gateway error", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => { call += 1; return resp(call === 1 ? 502 : 200); });
    const result = await stageVerifyDeploy({
      appUrl: "http://app.test",
      containerPort: 3000,
      log,
      attempts: 3,
      intervalMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, reason: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
