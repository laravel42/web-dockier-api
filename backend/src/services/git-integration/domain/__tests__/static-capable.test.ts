import { describe, expect, it } from "vitest";
import { MapRepoFiles } from "../../../../lib/repo-analyzer/index.js";
import { computeStaticCapable } from "../repo-config.js";

/** Serialize a package.json for a fixture repo. */
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

describe("computeStaticCapable", () => {
  it("treats a Laravel app as NOT static-capable (server-only)", () => {
    const files = new MapRepoFiles({
      "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^11.0" } }),
    });
    expect(computeStaticCapable(files)).toBe(false);
  });

  it("treats a plain Vite/React SPA as static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { react: "^18.0.0", vite: "^5.0.0" }, scripts: { build: "vite build" } }),
    });
    expect(computeStaticCapable(files)).toBe(true);
  });

  it("returns undefined for an unknown/undetected stack (treated as capable → show both)", () => {
    const files = new MapRepoFiles({ "README.md": "# hi" });
    expect(computeStaticCapable(files)).toBeUndefined();
  });

  it("treats a Payload CMS repo as NOT static-capable even on the Node runtime", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { payload: "^3.0.0", next: "^15.0.0" }, scripts: { build: "next build" } }),
    });
    expect(computeStaticCapable(files)).toBe(false);
  });

  it("treats a Laravel repo as server-only even when composer.json content was not fetched", () => {
    // The production bug: the clone-less path lists composer.json in the file
    // TREE but its content fetch was truncated or timed out, so `exists()` is
    // true while `read()` is null. A Laravel repo also ships package.json, so
    // the Node analyzer runs first — if PHP detection bailed on the null read,
    // the repo was misreported as Node and the Static card wrongly appeared.
    const files = new MapRepoFiles(
      // Only package.json has content; composer.json is tree-only.
      { "package.json": pkg({ deps: { vite: "^5.0.0" }, scripts: { build: "vite build" } }) },
      ["package.json", "composer.json"],
    );
    expect(computeStaticCapable(files)).toBe(false);
  });

  it("treats a default (SSR) Nuxt app as NOT static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});",
    });
    expect(computeStaticCapable(files)).toBe(false);
  });

  it("treats a Nuxt app with a `nuxt generate` script as static-capable", () => {
    // The reported bug: the wizard told the user static hosting was unavailable
    // even though the repo ships a generate script.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build", generate: "nuxt generate" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});",
    });
    expect(computeStaticCapable(files)).toBe(true);
  });

  it("treats a Nuxt app with ssr: false as static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ ssr: false });",
    });
    expect(computeStaticCapable(files)).toBe(true);
  });

  it("treats a Nuxt app with nitro preset 'static' as static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ nitro: { preset: 'static' } });",
    });
    expect(computeStaticCapable(files)).toBe(true);
  });

  it("treats a default (SSR) Next app as NOT static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build" } }),
      "next.config.mjs": "const config = { output: 'standalone' };\nexport default config;",
    });
    expect(computeStaticCapable(files)).toBe(false);
  });

  it("treats a Next app with output: 'export' as static-capable", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build" } }),
      "next.config.mjs": "export default { output: 'export' };",
    });
    expect(computeStaticCapable(files)).toBe(true);
  });
});
