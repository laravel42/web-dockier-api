/**
 * The health check URL is typed by the tenant and fetched from our host, and the deploy log shows
 * the result. It must not be a way to probe internal addresses.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestEnv } from "../../../../shared/__tests__/test-helpers.js";

vi.mock("../../../../shared/config.js", () => ({ env: createTestEnv() }));
vi.mock("../../../../shared/supabase/client.js", () => ({ supabaseAdmin: {} }));

const { stageHealthCheck } = await import("../pipeline/stages.js");
const { stageVerifyDeploy } = await import("../dokploy/stages/verify-deploy.js");

function ctxFor(url: string) {
  const lines: string[] = [];
  const logger = {
    info: async (m: string) => { lines.push(m); },
    success: async (m: string) => { lines.push(m); },
    warn: async (m: string) => { lines.push(m); },
  };
  return { ctx: { healthCheckEnabled: true, healthCheckUrl: url, logger } as never, lines };
}

afterEach(() => vi.restoreAllMocks());

describe("stageHealthCheck", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:4000/healthz",
    "http://10.0.0.5/",
    "http://[::1]/",
  ])("does not request %s", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { ctx, lines } = ctxFor(url);
    await stageHealthCheck(ctx);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join("\n")).toMatch(/private or internal network address/);
    expect(lines.join("\n")).not.toMatch(/Health check passed/);
  });
});

describe("stageVerifyDeploy", () => {
  it("does not request an internal address, even through the default fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await stageVerifyDeploy({
      appUrl: "http://169.254.169.254/",
      containerPort: 3000,
      log: async () => {},
      attempts: 1,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
