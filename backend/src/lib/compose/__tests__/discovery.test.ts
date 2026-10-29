/**
 * Compose file discovery and ranking.
 *
 * The berry tree is the reason this is a whole-tree scan: it keeps no compose
 * file at the root and has three of them, in deploy/dokploy, deploy/local and
 * deploy/aws/host.
 */

import { describe, it, expect } from "vitest";
import { findComposeFiles } from "../discovery.js";

const BERRY_TREE = [
  "package.json",
  "pnpm-workspace.yaml",
  "deploy/aws/host/compose.yml",
  "deploy/docker/api.Dockerfile",
  "deploy/dokploy/.env.example",
  "deploy/dokploy/docker-compose.yml",
  "deploy/local/dev.Dockerfile",
  "deploy/local/docker-compose.yml",
];

describe("findComposeFiles — berry tree", () => {
  const found = findComposeFiles(BERRY_TREE);

  it("finds all three, none of which is at the root", () => {
    expect(found.map((c) => c.path)).toEqual([
      "deploy/dokploy/docker-compose.yml",
      "deploy/aws/host/compose.yml",
      "deploy/local/docker-compose.yml",
    ]);
  });

  it("defaults to the Dokploy one", () => {
    expect(found[0].path).toBe("deploy/dokploy/docker-compose.yml");
    expect(found[0].reason).toContain("Dokploy");
  });

  it("sorts the local stack last", () => {
    // Deploying a local dev stack binds source directories and publishes host
    // ports — it fails in a way nobody can read, so it must never be default.
    expect(found[found.length - 1].path).toBe("deploy/local/docker-compose.yml");
  });

  it("exposes the directory each file lives in, for context resolution", () => {
    expect(found[0].dir).toBe("deploy/dokploy");
  });
});

describe("findComposeFiles — ranking", () => {
  it("returns nothing when the repo has no compose file", () => {
    expect(findComposeFiles(["package.json", "src/index.ts"])).toEqual([]);
  });

  it("recognises all four spellings", () => {
    const found = findComposeFiles([
      "a/compose.yaml",
      "b/compose.yml",
      "c/docker-compose.yaml",
      "d/docker-compose.yml",
    ]);
    expect(found).toHaveLength(4);
  });

  it("does not match a file that merely mentions compose", () => {
    expect(
      findComposeFiles(["docker-compose.yml.example", "compose.yml.bak", "docs/docker-compose.md"]),
    ).toEqual([]);
  });

  it("prefers the repo root over a nested deploy directory", () => {
    const found = findComposeFiles(["docker-compose.yml", "deploy/docker-compose.yml"]);
    expect(found[0].path).toBe("docker-compose.yml");
    expect(found[0].dir).toBe("");
  });

  it("prefers a dokploy path even over the repo root", () => {
    const found = findComposeFiles(["docker-compose.yml", "dokploy/compose.yml"]);
    expect(found[0].path).toBe("dokploy/compose.yml");
  });

  it("ranks a dev/test/ci path below an unremarkable one", () => {
    const found = findComposeFiles(["test/compose.yml", "stacks/compose.yml"]);
    expect(found.map((c) => c.path)).toEqual(["stacks/compose.yml", "test/compose.yml"]);
  });

  it("ranks a local path last even when it is also a deploy path", () => {
    const found = findComposeFiles(["deploy/local/compose.yml", "deploy/prod/compose.yml"]);
    expect(found[0].path).toBe("deploy/prod/compose.yml");
  });

  it("prefers the shallower of two otherwise equal paths", () => {
    const found = findComposeFiles(["a/b/c/compose.yml", "a/compose.yml"]);
    expect(found[0].path).toBe("a/compose.yml");
  });

  it("tolerates ./-prefixed tree paths", () => {
    expect(findComposeFiles(["./docker-compose.yml"])[0]).toEqual({
      path: "docker-compose.yml",
      dir: "",
      reason: "Compose's default location.",
    });
  });
});
