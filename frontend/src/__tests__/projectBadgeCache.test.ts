import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  selectProjectBadges,
  getProjectBadgeCache,
  setProjectBadgeCache,
  clearProjectBadgeCache,
} from "../utils/projectBadgeCache";

describe("selectProjectBadges", () => {
  it("returns top 4 badges sorted by confidence", () => {
    const badges = selectProjectBadges([
      { name: "TypeScript", category: "language", confidence: 90 },
      { name: "React", category: "framework", confidence: 95 },
      { name: "Node.js", category: "runtime", confidence: 80 },
      { name: "Docker", category: "infra", confidence: 70 },
      { name: "Vite", category: "tool", confidence: 60 },
    ]);

    expect(badges).toHaveLength(4);
    expect(badges.map((b) => b.name)).toEqual(["React", "TypeScript", "Node.js", "Docker"]);
  });

  it("includes languages and runtimes without whitelist filtering", () => {
    const badges = selectProjectBadges([
      { name: "PHP", category: "language", confidence: 90 },
      { name: "Laravel", category: "framework", confidence: 95 },
    ]);

    expect(badges.map((b) => b.name)).toEqual(["Laravel", "PHP"]);
  });
});

describe("projectBadgeCache", () => {
  const projectId = "proj-1";
  const repoKey = "acme/app";
  const branch = "main";
  const connectionId = "conn-1";

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
  });

  it("stores and retrieves badges for a project", () => {
    const badges = [{ name: "React", category: "framework", confidence: 95 }];
    setProjectBadgeCache(projectId, repoKey, branch, connectionId, badges);

    expect(getProjectBadgeCache(projectId, repoKey, branch, connectionId)).toEqual(badges);
  });

  it("returns null when repo/branch/connection changes", () => {
    setProjectBadgeCache(projectId, repoKey, branch, connectionId, [
      { name: "React", category: "framework", confidence: 95 },
    ]);

    expect(getProjectBadgeCache(projectId, repoKey, "develop", connectionId)).toBeNull();
    expect(getProjectBadgeCache(projectId, "other/repo", branch, connectionId)).toBeNull();
    expect(getProjectBadgeCache(projectId, repoKey, branch, "other-conn")).toBeNull();
  });

  it("clears cached badges for a project", () => {
    setProjectBadgeCache(projectId, repoKey, branch, connectionId, [
      { name: "Vue", category: "framework", confidence: 90 },
    ]);
    clearProjectBadgeCache(projectId);
    expect(getProjectBadgeCache(projectId, repoKey, branch, connectionId)).toBeNull();
  });
});
