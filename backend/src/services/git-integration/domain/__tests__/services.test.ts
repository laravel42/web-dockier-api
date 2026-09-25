import { describe, expect, it } from "vitest";
import { detectServices, type DependencyRef } from "../services.js";

describe("detectServices", () => {
  it("reports no services for a static Astro site with incidental paths", () => {
    // A `src/migrations/` content folder and a vendored path containing "redis"
    // used to trigger false Database + Cache detections.
    const files = [
      "package.json",
      "astro.config.mjs",
      "src/pages/index.astro",
      "src/migrations/2024-notes.md",
      "src/styles/redistribute.css",
      "node_modules/redis-parser/index.js",
    ];
    const deps: DependencyRef[] = [
      { name: "astro", ecosystem: "npm" },
      { name: "tailwindcss", ecosystem: "npm" },
    ];

    expect(detectServices(files, deps)).toEqual([]);
  });

  it("detects a database from a declared driver dependency", () => {
    const services = detectServices([], [{ name: "pg", ecosystem: "npm" }]);
    expect(services).toHaveLength(1);
    expect(services[0].type).toBe("database");
  });

  it("detects Redis cache from ioredis dependency", () => {
    const services = detectServices([], [{ name: "ioredis", ecosystem: "npm" }]);
    expect(services.some((s) => s.type === "cache" && s.name === "Redis")).toBe(true);
  });

  it("detects services from anchored Laravel config files", () => {
    const files = ["app/config/database.php", "app/config/queue.php"];
    const services = detectServices(files);
    expect(services.some((s) => s.type === "database")).toBe(true);
    expect(services.some((s) => s.type === "queue")).toBe(true);
  });

  it("detects a real migrations directory but ignores unrelated 'migration' paths", () => {
    expect(detectServices(["db/migrations/0001_init.sql"]).some((s) => s.type === "database")).toBe(true);
    expect(detectServices(["docs/migration-guide.md"])).toEqual([]);
  });

  it("collapses to one service per type, keeping highest confidence", () => {
    const files = ["prisma/schema.prisma", "db/migrations/0001.sql"];
    const deps: DependencyRef[] = [{ name: "@prisma/client", ecosystem: "npm" }];
    const services = detectServices(files, deps);
    const databases = services.filter((s) => s.type === "database");
    expect(databases).toHaveLength(1);
  });
});
