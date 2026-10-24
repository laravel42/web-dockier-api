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

  it("detects SSR Nuxt from the nuxt dependency", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.framework).toBe("nuxt");
    expect(config.features.has("ssr")).toBe(true);
  });

  it("detects Nuxt from nuxt.config even when the dep is not in the app's package.json (monorepo/preset)", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: {}, scripts: { build: "nuxt build" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});",
    });
    const config = analyzeRepoFiles(files);
    expect(config.framework).toBe("nuxt");
    expect(config.features.has("ssr")).toBe(true);
  });

  it("detects a static Nuxt (ssr:false) and marks it static-export", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt generate" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ ssr: false });",
    });
    const config = analyzeRepoFiles(files);
    expect(config.framework).toBe("nuxt");
    expect(config.features.has("static-export")).toBe(true);
    expect(config.features.has("ssr")).toBe(false);
  });

  it("marks an SSR Nuxt with a `nuxt generate` script as static-generate, not static-export", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build", generate: "nuxt generate" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-generate")).toBe(true);
    expect(config.features.has("static-export")).toBe(false);
    expect(config.features.has("ssr")).toBe(true);
    const stack = toDetectedStack(config);
    expect(stack).toMatchObject({ isStatic: false, canGenerateStatic: true });
  });

  it("recognises `nuxi generate` as a static-generate signal", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build", generate: "nuxi generate" } }),
    });
    expect(analyzeRepoFiles(files).features.has("static-generate")).toBe(true);
  });

  it("recognises NITRO_PRESET=static in a script as a static-generate signal", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { generate: "NITRO_PRESET=static nuxt build" } }),
    });
    expect(analyzeRepoFiles(files).features.has("static-generate")).toBe(true);
  });

  it("leaves a plain SSR Nuxt without any static signal", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-generate")).toBe(false);
    expect(config.features.has("static-export")).toBe(false);
  });

  it("does NOT mark a Next.js `output: 'standalone'` config as static", () => {
    // Regression: the old probe tested includes("output:") && includes("export"),
    // and "export default" matches in virtually every next.config.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build" } }),
      "next.config.mjs": "const config = { output: 'standalone' };\nexport default config;",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-export")).toBe(false);
    expect(config.features.has("static-generate")).toBe(false);
  });

  it("marks a Next.js `output: 'export'` config as static-export", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { build: "next build" } }),
      "next.config.mjs": "export default { output: 'export' };",
    });
    expect(analyzeRepoFiles(files).features.has("static-export")).toBe(true);
  });

  it("ignores a `next export` script — the command was removed in Next 14", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { next: "^15.0.0" }, scripts: { export: "next build && next export" } }),
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-generate")).toBe(false);
    expect(config.features.has("static-export")).toBe(false);
  });

  it("rejects a `nuxt generate` script when the repo has server/api routes", () => {
    // `nuxi init` ships the generate script, so on its own it is weak evidence;
    // server/api routes are positive counter-evidence that the app needs a server.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build", generate: "nuxt generate" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({});",
      "server/api/foo.ts": "export default defineEventHandler(() => ({ ok: true }));",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-generate")).toBe(false);
    expect(config.features.has("ssr")).toBe(true);
  });

  it("rejects a `nuxt generate` script when the nitro preset is explicitly non-static", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build", generate: "nuxt generate" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ nitro: { preset: 'node-server' } });",
    });
    expect(analyzeRepoFiles(files).features.has("static-generate")).toBe(false);
  });

  it("keeps ssr: false sufficient even next to server/api routes", () => {
    // ssr: false is a deliberate author choice; a stray server dir does not override it.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { nuxt: "^3.13.0" }, scripts: { build: "nuxt build" } }),
      "nuxt.config.ts": "export default defineNuxtConfig({ ssr: false });",
      "server/api/foo.ts": "export default defineEventHandler(() => ({ ok: true }));",
    });
    const config = analyzeRepoFiles(files);
    expect(config.features.has("static-export")).toBe(true);
    expect(config.features.has("static-generate")).toBe(true);
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

  it("finds a Nuxt app subdir configured with nuxt.config.mjs", () => {
    const files = new MapRepoFiles({
      "package.json": JSON.stringify({ private: true }),
      "apps/web/package.json": "{}",
      "apps/web/nuxt.config.mjs": "export default {}",
    });
    expect(detectSubDir(files)).toBe("apps/web");
  });
});

// ─── Astro without the astro dependency ────────────────────────────
//
// Reproduces `laravel42/web-inky`: a pnpm workspace whose root manifest
// declares `"build": "astro build"` and carries neither an `astro` dependency
// nor an `astro.config.*` — Astro runs there on its defaults. It was classified
// as `spa` with Vite's version reported as the framework version (logged live
// as `Framework: spa 7.2.2`), which skipped every Astro decision below,
// including the SSR/adapter detection that decides whether the repo may deploy
// as a static site at all.

describe("analyzeRepoFiles — Astro without the astro dependency", () => {
  /** The live web-inky shape: no astro dep, no astro.config, astro in the script. */
  const webInky = () => new MapRepoFiles({
    "package.json": pkg({ devDeps: { vite: "^7.2.2" }, scripts: { build: "astro build" } }),
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
  });

  it("detects astro from the build script alone", () => {
    const config = analyzeRepoFiles(webInky());

    expect(config.framework).toBe("astro");
    // The bug: the SPA fallback matched on vite and reported vite's version.
    expect(config.framework).not.toBe("spa");
    expect(config.frameworkVersion).not.toBe("7.2.2");
  });

  it("keeps that repo eligible for static deploy", () => {
    // Load-bearing: getStaticDeployBlockReason blocks an astro project whose
    // isStatic is false, and isStatic is features.has("static-export"). With no
    // config, no adapter and no start script, the branch must fall through to
    // static-export — otherwise this fix takes a working deploy offline.
    const config = analyzeRepoFiles(webInky());

    expect(config.features.has("static-export")).toBe(true);
    expect(config.features.has("ssr")).toBe(false);
  });

  it("detects astro from astro.config.mjs when the manifest declares only vite", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({ devDeps: { vite: "^7.2.2" }, scripts: { build: "pnpm -r build" } }),
      "astro.config.mjs": "export default defineConfig({ output: 'static' });",
    });

    const config = analyzeRepoFiles(files);

    expect(config.framework).toBe("astro");
    expect(config.features.has("static-export")).toBe(true);
  });

  it("does not match a .astro file extension in an unrelated script", () => {
    const files = new MapRepoFiles({
      "package.json": pkg({
        deps: { react: "^18.2.0" },
        devDeps: { vite: "^7.2.2" },
        scripts: { build: "vite build", lint: "eslint --ext .astro,.ts ." },
      }),
    });

    expect(analyzeRepoFiles(files).framework).toBe("spa");
  });

  it("detects SSR from the config even with no astro and no adapter dep", () => {
    // The case the misdetection made invisible: classified `spa` + static-export,
    // this repo would have been offered a static deploy it cannot serve.
    const files = new MapRepoFiles({
      "package.json": pkg({ devDeps: { vite: "^7.2.2" }, scripts: { build: "astro build" } }),
      "astro.config.ts": "import node from '@astrojs/node';\nexport default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }) });",
    });

    const config = analyzeRepoFiles(files);

    expect(config.framework).toBe("astro");
    expect(config.features.has("ssr")).toBe(true);
    expect(config.features.has("static-export")).toBe(false);
  });

  it("recognises every astro.config extension", () => {
    for (const cfg of ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.mts", "astro.config.cjs"]) {
      const files = new MapRepoFiles({
        "package.json": pkg({ devDeps: { vite: "^7.2.2" }, scripts: { build: "astro build" } }),
        [cfg]: "export default defineConfig({ output: 'static' });",
      });

      expect(analyzeRepoFiles(files).framework, cfg).toBe("astro");
    }
  });

  it("leaves a real Vite SPA alone", () => {
    // No astro.config anywhere — must still be spa, or the fix would swallow
    // every Vite project.
    const files = new MapRepoFiles({
      "package.json": pkg({ deps: { react: "^18.2.0" }, devDeps: { vite: "^7.2.2" }, scripts: { build: "vite build" } }),
    });

    const config = analyzeRepoFiles(files);

    expect(config.framework).toBe("spa");
    expect(config.frameworkVersion).toBe("18.2.0");
  });
});
