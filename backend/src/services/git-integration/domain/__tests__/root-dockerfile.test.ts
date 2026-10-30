import { describe, expect, it } from "vitest";
import { hasRootDockerfile } from "../analysis.js";

/**
 * `hasDocker` drives the wizard's "Use my Dockerfile" offer, and the deploy it
 * implies points Dokploy at `./Dockerfile` with context `./` — the only path
 * its dockerfile build type is configured with. So the question is not "does
 * this repo contain a Dockerfile" but "is there one a deploy can build".
 *
 * The bug this pins: the check was `/Dockerfile/i.test(path)` against every
 * path in the tree. A real monorepo of containerised plugins has 104 matching
 * paths — 96 under `plugins/`, 5 under `server-ts/`, 3 under `deploy/` — and
 * none at the root, so the wizard offered a build that could not work.
 */
describe("hasRootDockerfile", () => {
  it("is true for a Dockerfile at the repo root", () => {
    expect(hasRootDockerfile(["Dockerfile", "package.json"])).toBe(true);
  });

  it("tolerates a ./-prefixed tree path", () => {
    expect(hasRootDockerfile(["./Dockerfile"])).toBe(true);
  });

  it("is FALSE for a monorepo whose Dockerfiles all live in subdirectories", () => {
    // The real case, reduced: plugin images plus per-service build files.
    const tree = [
      "package.json",
      ".dockerignore",
      "deploy/docker/api.Dockerfile",
      "deploy/docker/web.Dockerfile",
      "deploy/local/dev.Dockerfile",
      "server-ts/sandbox/agentcore/Dockerfile",
      ...Array.from({ length: 96 }, (_, i) => `plugins/plugin-${i}/Dockerfile`),
    ];
    expect(hasRootDockerfile(tree)).toBe(false);
  });

  it("is false for a Dockerfile one directory down", () => {
    expect(hasRootDockerfile(["app/Dockerfile", "package.json"])).toBe(false);
  });

  it("is false for a root .dockerignore alone", () => {
    expect(hasRootDockerfile([".dockerignore", "package.json"])).toBe(false);
  });

  it("is false for a suffixed variant at the root", () => {
    // `./Dockerfile` is the literal path the build type uses, so neither of
    // these would be found by the build.
    expect(hasRootDockerfile(["Dockerfile.prod"])).toBe(false);
    expect(hasRootDockerfile(["api.Dockerfile"])).toBe(false);
  });

  it("is false for a lowercase filename", () => {
    // Docker builds on a case-sensitive filesystem; `dockerfile` is not found.
    expect(hasRootDockerfile(["dockerfile"])).toBe(false);
  });

  it("is false for an empty tree", () => {
    expect(hasRootDockerfile([])).toBe(false);
  });

  it("agrees with the pipeline's own root-only check", () => {
    // resolve-runtime uses `files.exists("Dockerfile")` and its verdict wins
    // over `event.hasDocker`. These two must not disagree, or the wizard offers
    // one build and the pipeline performs another.
    const tree = ["deploy/docker/api.Dockerfile", "Dockerfile"];
    expect(hasRootDockerfile(tree)).toBe(true);
    expect(hasRootDockerfile(tree.slice(0, 1))).toBe(false);
  });
});
