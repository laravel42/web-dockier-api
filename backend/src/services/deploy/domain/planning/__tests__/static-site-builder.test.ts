import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildSite, getStaticDeployBlockReason } from "../static-site-builder.js";
import type { DetectedStack } from "../../../../../lib/repo-analyzer/types.js";

const dirs: string[] = [];

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "static-build-"));
  dirs.push(dir);
  return dir;
}

/** A runCmd that reports success without producing any build output. */
const okCmd = async () => ({ code: 0, output: "" });
const log = async () => {};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("buildSite (Next.js)", () => {
  it("throws when the build leaves no out/ instead of reporting success", async () => {
    // findOutputDir falls back to repoDir, so a "successful" build with no
    // output would upload the repository source to a public CDN origin.
    await expect(
      buildSite({ repoDir: repo(), techStack: ["Next.js"], runCmd: okCmd, appendLog: log }),
    ).rejects.toThrow(/produced no 'out' directory/);
  });

  it("succeeds when the build produced out/", async () => {
    const dir = repo();
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "out/index.html"), "<html></html>");
    await expect(
      buildSite({ repoDir: dir, techStack: ["Next.js"], runCmd: okCmd, appendLog: log }),
    ).resolves.toBe(true);
  });
});

// ─── getStaticDeployBlockReason ────────────────────────────────────
//
// This gate is the reason the Astro misdetection was not harmless to fix.
// `laravel42/web-inky` is a static Astro site that was classified `spa`, so the
// astro branch below never ran and the deploy was allowed. Once the analyzer
// correctly reports `astro`, the gate starts applying — and it blocks an Astro
// project whose `isStatic` is false. The first case here is that live repo's
// shape: it must stay deployable.

const nodeStack = (over: Partial<DetectedStack> = {}): DetectedStack => ({
  runtime: "node",
  framework: "astro",
  packageManager: "pnpm",
  nodeVersion: "22",
  isStatic: true,
  subDir: "",
  port: 3000,
  ...over,
} as DetectedStack);

describe("getStaticDeployBlockReason (Astro)", () => {
  it("allows a static Astro site — the web-inky shape, output: 'static'", () => {
    const reason = getStaticDeployBlockReason({
      detectedStack: nodeStack({ isStatic: true }),
      techStack: ["Astro", "React", "Node.js", "TypeScript"],
    });

    expect(reason).toBeNull();
  });

  it("blocks an SSR Astro site with a clear reason", () => {
    const reason = getStaticDeployBlockReason({
      detectedStack: nodeStack({ isStatic: false }),
      techStack: ["Astro"],
    });

    expect(reason).toMatch(/server-side rendering/i);
  });

  it("still allows a Vite SPA, which reports no framework-specific block", () => {
    const reason = getStaticDeployBlockReason({
      detectedStack: nodeStack({ framework: "spa", isStatic: true }),
      techStack: ["React", "Vite"],
    });

    expect(reason).toBeNull();
  });
});
