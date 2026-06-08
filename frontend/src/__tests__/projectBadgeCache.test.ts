import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  selectProjectBadges,
  getProjectBadgeCache,
  setProjectBadgeCache,
  clearProjectBadgeCache,
} from "../utils/projectBadgeCache";

describe("selectProjectBadges", () => {
  it("returns top badges sorted by confidence after whitelist filtering", () => {
    const badges = selectProjectBadges([
      { name: "TypeScript", category: "language", confidence: 90 },
      { name: "React", category: "framework", confidence: 95 },
      { name: "Node.js", category: "runtime", confidence: 80 },
      { name: "Docker", category: "infra", confidence: 70 },
      { name: "Vite", category: "tool", confidence: 60 },
      { name: "Tailwind CSS", category: "tool", confidence: 85 },
    ]);

    expect(badges).toHaveLength(1);
    expect(badges[0]?.name).toBe("React");
  });

  it("drops redundant parent language when a framework is detected", () => {
    const badges = selectProjectBadges([
      { name: "PHP", category: "language", confidence: 90 },
      { name: "Laravel", category: "framework", confidence: 95 },
    ]);

    expect(badges.map((b) => b.name)).toEqual(["Laravel"]);
  });

  it("drops React when Next.js is detected", () => {
    const badges = selectProjectBadges([
      { name: "React", category: "framework", confidence: 95 },
      { name: "Next.js", category: "framework", confidence: 98 },
      { name: "TypeScript", category: "language", confidence: 90 },
    ]);

    expect(badges.map((b) => b.name)).toEqual(["Next.js"]);
  });

  it("hides secondary badges when a major framework is present", () => {
    const badges = selectProjectBadges([
      { name: "Laravel", category: "framework", confidence: 95 },
      { name: "Tailwind CSS", category: "tool", confidence: 90 },
      { name: "Prisma", category: "database", confidence: 85 },
    ]);

    expect(badges.map((b) => b.name)).toEqual(["Laravel"]);
  });

  it("keeps secondary badges when no major framework is detected", () => {
    const badges = selectProjectBadges([
      { name: "Tailwind CSS", category: "tool", confidence: 90 },
      { name: "Prisma", category: "database", confidence: 85 },
    ]);

    expect(badges.map((b) => b.name)).toEqual(["Tailwind CSS", "Prisma"]);
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
