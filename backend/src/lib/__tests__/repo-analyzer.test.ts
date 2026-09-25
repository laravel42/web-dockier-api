import { describe, expect, it } from "vitest";
import { analyzeRepoFiles, MapRepoFiles, toDetectedStack } from "../repo-analyzer/index.js";
import { detectSubDir } from "../repo-analyzer/detect-subdir.js";

function pkg(opts: {
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  packageManager?: string;
}): string {
  return JSON.stringify({
    dependencies: opts.deps ?? {},
    devDependencies: opts.devDeps ?? {},
    scripts: opts.scripts ?? {},
    ...(opts.engines ? { engines: opts.engines } : {}),
    ...(opts.packageManager ? { packageManager: opts.packageManager } : {}),
  });
}

describe("analyzeRepoFiles (filesystem-agnostic core)", () => {
  it("detects SSR Astro (@astrojs/node) with no start script and sets the server entry", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" }, scripts: { build: "astro build" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.runtime).toBe("node");
    expect(config.framework).toBe("astro");
    expect(config.features.has("ssr")).toBe(true);
    expect(config.startCommand).toBe("node ./dist/server/entry.mjs");
    // Astro >= 5 bumps node to 22.
    expect(config.nodeVersion).toBe("22");
  });

  it("detects SSR Astro from astro.config output:'server' even without an adapter dep", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { astro: "^4.0.0" }, scripts: { build: "astro build" } }),
      "astro.config.mjs": "export default defineConfig({ output: 'server' });",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("ssr")).toBe(true);
    // No @astrojs/node dep → we don't synthesize the node entry (unknown server).
    expect(config.startCommand).toBe("");
  });

  it("detects the node adapter from astro.config even when the dep is not in the app's package.json (monorepo)", () => {
    // In a workspace the adapter often lives in another package's manifest, so
    // a deps-only check would miss it and mislabel the app as static.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { astro: "^5.0.0" }, scripts: { build: "astro build" } }),
      "astro.config.mjs": "import node from '@astrojs/node';\nexport default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }) });",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("ssr")).toBe(true);
    expect(config.startCommand).toBe("node ./dist/server/entry.mjs");
  });

  it("flags an Astro platform adapter and does NOT synthesize a node entry", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/vercel": "^8.0.0" }, scripts: { build: "astro build" } }),
      "astro.config.mjs": "import vercel from '@astrojs/vercel';\nexport default defineConfig({ output: 'server', adapter: vercel() });",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("ssr")).toBe(true);
    expect(config.features.has("astro-platform-adapter")).toBe(true);
    // No startable Node server → no synthesized command.
    expect(config.startCommand).toBe("");
  });

  it("detects static Astro (no adapter, no server output)", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { astro: "^5.0.0" }, scripts: { build: "astro build" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-export")).toBe(true);
    expect(config.features.has("ssr")).toBe(false);
    expect(toDetectedStack(config)).toMatchObject({ runtime: "node", framework: "astro", isStatic: true });
  });

  it("a repo start script wins over the synthesized Astro entry", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({
        deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" },
        scripts: { build: "astro build", start: "node ./dist/server/entry.mjs" },
        packageManager: "pnpm@9.0.0",
      }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.startCommand).toBe("pnpm start");
  });

  it("detects Next.js SSR and standalone from next.config", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build", start: "next start" } }),
      "next.config.mjs": "export default { output: 'standalone' };",
    });
    const config = analyzeRepoFiles(files);
    expect(config.framework).toBe("nextjs");
    expect(config.hasStandalone).toBe(true);
    expect(config.features.has("ssr")).toBe(true);
  });

  it("detects a Laravel PHP app", () => {
    const files = new MapRepoFiles({
      "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^11.0" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.runtime).toBe("php");
    expect(config.framework).toBe("laravel");
    expect(config.phpExtensions).toContain("pdo_mysql");
  });

  it("reads the PHP version as the constraint's lower bound (what builders resolve)", () => {
    // Railpack resolves the lowest version a constraint allows, so "^8.1" means
    // it tries PHP 8.1 — which it cannot install. Our detection must match that
    // resolution for the Nixpacks fallback to trigger correctly.
    const caret = analyzeRepoFiles(new MapRepoFiles({
      "composer.json": JSON.stringify({ require: { php: "^8.1", "laravel/framework": "^10.0" } }),
    }));
    expect(caret.phpVersion).toBe("8.1");

    const range = analyzeRepoFiles(new MapRepoFiles({
      "composer.json": JSON.stringify({ require: { php: ">=8.2 <8.4" } }),
    }));
    expect(range.phpVersion).toBe("8.2");
  });

  it("defaults PHP to a modern version when composer.json declares no constraint", () => {
    const config = analyzeRepoFiles(new MapRepoFiles({
      "composer.json": JSON.stringify({ require: { "laravel/framework": "^11.0" } }),
    }));
    expect(config.phpVersion).toBe("8.4");
  });

  it("detects a Go app from go.mod", () => {
    const files = new MapRepoFiles({ "go.mod": "module example.com/app\n\ngo 1.23\n" });
    const config = analyzeRepoFiles(files);
    expect(config.runtime).toBe("go");
    expect(config.goVersion).toBe("1.23");
  });

  it("reads .nvmrc for the node version", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { express: "^4.0.0" }, scripts: { start: "node index.js" } }),
      ".nvmrc": "v18.19.0\n",
    });
    const config = analyzeRepoFiles(files);
    expect(config.nodeVersion).toBe("18");
  });

  it("picks the package manager from a root lockfile in a monorepo app subdir", () => {
    const files = new MapRepoFiles({
      "pnpm-lock.yaml": "lockfileVersion: 9",
      "apps/web/package.json": pkg({ deps: { astro: "^5.0.0", "@astrojs/node": "^9.0.0" } }),
      "apps/web/astro.config.mjs": "export default {};",
    });
    const config = analyzeRepoFiles(files);
    expect(config.subDir).toBe("apps/web");
    expect(config.packageManager).toBe("pnpm");
  });

  it("returns unknown runtime for a repo with no recognized manifest", () => {
    const files = new MapRepoFiles({ "README.md": "# hi" });
    const config = analyzeRepoFiles(files);
    expect(config.runtime).toBe("unknown");
  });
});

describe("detectSubDir", () => {
  it("returns '' when a framework config is at the root", () => {
    const files = new MapRepoFiles({ "astro.config.mjs": "{}", "package.json": "{}" });
    expect(detectSubDir(files)).toBe("");
  });

  it("returns '' when the root package.json has a build script", () => {
    const files = new MapRepoFiles({ "package.json": JSON.stringify({ scripts: { build: "x" } }) });
    expect(detectSubDir(files)).toBe("");
  });

  it("finds a conventional app subdir with a framework config", () => {
    const files = new MapRepoFiles({
      "package.json": JSON.stringify({ private: true }),
      "apps/web/package.json": "{}",
      "apps/web/next.config.js": "{}",
    });
    expect(detectSubDir(files)).toBe("apps/web");
  });
});
