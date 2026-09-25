import { describe, expect, it } from "vitest";
import { detectDeployRuntime, HIGH_CONFIDENCE } from "../deploy-runtime.js";

/** Build a package.json string with the given deps/scripts. */
function pkg(opts: {
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
  scripts?: Record<string, string>;
}): string {
  return JSON.stringify({
    dependencies: opts.deps ?? {},
    devDependencies: opts.devDeps ?? {},
    scripts: opts.scripts ?? {},
  });
}

describe("detectDeployRuntime", () => {
  it("returns null when there is no package.json (not a Node app)", () => {
    expect(detectDeployRuntime({})).toBeNull();
    expect(detectDeployRuntime({ "composer.json": "{}" })).toBeNull();
  });

  it("SSR Astro via @astrojs/node with no start script → high-confidence start command", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build" } }),
    });
    expect(rt).not.toBeNull();
    expect(rt!.kind).toBe("server");
    expect(rt!.framework).toBe("astro");
    expect(rt!.startCommand).toBe("node ./dist/server/entry.mjs");
    expect(rt!.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
    expect(rt!.hasStartScript).toBe(false);
  });

  it("SSR Astro detected from astro.config output:'server' even without an adapter dep", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build" } }),
      "astro.config.mjs": "export default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }) });",
    });
    expect(rt!.kind).toBe("server");
    expect(rt!.startCommand).toBe("node ./dist/server/entry.mjs");
  });

  it("static Astro (no adapter, no server output) → static, no start command", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({ deps: { astro: "^5.0.0" }, scripts: { build: "astro build" } }),
    });
    expect(rt!.kind).toBe("static");
    expect(rt!.startCommand).toBeUndefined();
    expect(rt!.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("SSR Astro that already has a start script → no override (Railpack uses the repo's)", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({
        deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" },
        scripts: { build: "astro build", start: "node ./dist/server/entry.mjs" },
      }),
    });
    expect(rt!.kind).toBe("server");
    expect(rt!.hasStartScript).toBe(true);
    // We report the kind but don't emit a startCommand to inject — Railpack
    // will use the repo's own `start`.
    expect(rt!.startCommand).toBeUndefined();
  });

  it("Astro with a non-Node server adapter and no start script → server but low confidence, no start command", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/vercel": "^8.0.0" }, scripts: { build: "astro build" } }),
    });
    expect(rt!.kind).toBe("server");
    expect(rt!.startCommand).toBeUndefined();
    expect(rt!.confidence).toBeLessThan(HIGH_CONFIDENCE);
  });

  it("Next.js / Nuxt → server; high confidence only when a start script exists", () => {
    const withStart = detectDeployRuntime({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build", start: "next start" } }),
    });
    expect(withStart!.kind).toBe("server");
    expect(withStart!.hasStartScript).toBe(true);
    expect(withStart!.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);

    const noStart = detectDeployRuntime({
      "package.json": pkg({ deps: { nuxt: "^3.0.0" }, scripts: { build: "nuxt build" } }),
    });
    expect(noStart!.kind).toBe("server");
    expect(noStart!.confidence).toBeLessThan(HIGH_CONFIDENCE);
  });

  it("returns null for a Node app that is not a recognized framework", () => {
    const rt = detectDeployRuntime({
      "package.json": pkg({ deps: { lodash: "^4.0.0" } }),
    });
    expect(rt).toBeNull();
  });

  it("tolerates malformed package.json", () => {
    expect(detectDeployRuntime({ "package.json": "{ not json" })).toBeNull();
  });
});
