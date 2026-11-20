/**
 * Install and build scripts of a tenant's repository run on this machine (static deploys), so they
 * must not inherit the backend's environment: a postinstall script could read its secrets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildChildEnv, type RunCmdFn } from "../run-cmd.js";
import { installDeps, buildSite } from "../planning/static-site-builder.js";

describe("buildChildEnv", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_do_not_leak");
    vi.stubEnv("JWT_SECRET", "jwt_do_not_leak");
    vi.stubEnv("ENV_ENCRYPTION_KEY", "key_do_not_leak");
  });

  it("passes the whole environment by default (pulumi, docker and aws need it)", () => {
    expect(buildChildEnv().JWT_SECRET).toBe("jwt_do_not_leak");
  });

  it("gives an isolated command only PATH, HOME, locale and CI", () => {
    const env = buildChildEnv({ isolateEnv: true, homeDir: "/tmp/build-1" });
    expect(Object.keys(env).sort()).toEqual(["CI", "HOME", "LANG", "PATH"]);
    expect(env.HOME).toBe("/tmp/build-1");
    expect(JSON.stringify(env)).not.toContain("do_not_leak");
  });

  it("keeps variables the caller passes explicitly", () => {
    const env = buildChildEnv({ isolateEnv: true, env: { NITRO_PRESET: "static" } });
    expect(env.NITRO_PRESET).toBe("static");
  });
});

describe("static builds run the repository's code isolated", () => {
  const calls: Array<{ cmd: string; opts: Parameters<RunCmdFn>[2] }> = [];
  const runCmd: RunCmdFn = async (cmd, _args, opts) => {
    calls.push({ cmd, opts });
    return { code: 0, output: "" };
  };
  const appendLog = async () => {};

  beforeEach(() => { calls.length = 0; });

  it.each(["npm", "pnpm", "yarn"])("installDeps (%s) isolates every command", async (packageManager) => {
    await installDeps({ repoDir: "/tmp/build-1/repo", packageManager, runCmd, appendLog });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.opts?.isolateEnv).toBe(true);
      expect(c.opts?.homeDir).toBe("/tmp/build-1");
    }
  });

  it.each([
    ["generic", []],
    ["nuxt", ["Nuxt"]],
    ["next", ["Next.js"]],
  ])("buildSite (%s) isolates every command", async (_name, techStack) => {
    // Next throws when the fake build leaves no out/ directory; the commands it ran are what matters.
    await buildSite({ repoDir: "/tmp/build-1/repo", techStack, runCmd, appendLog, packageManager: "pnpm" }).catch(() => {});
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.opts?.isolateEnv).toBe(true);
  });
});
