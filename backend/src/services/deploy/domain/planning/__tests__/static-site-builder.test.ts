import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildSite } from "../static-site-builder.js";

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
