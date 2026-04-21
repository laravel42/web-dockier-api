import { describe, it, expect } from "vitest";
import { detectTechStack } from "../tech-stack";

describe("detectTechStack", () => {
  it("detects Node.js from package.json", () => {
    const result = detectTechStack(["package.json"]);
    expect(result.some(t => t.name === "Node.js")).toBe(true);
  });

  it("detects TypeScript from tsconfig.json", () => {
    const result = detectTechStack(["tsconfig.json"]);
    expect(result.some(t => t.name === "TypeScript" && t.category === "language")).toBe(true);
  });

  it("detects Laravel from artisan file", () => {
    const result = detectTechStack(["artisan", "composer.json"]);
    expect(result.some(t => t.name === "Laravel" && t.category === "framework")).toBe(true);
  });

  it("detects Next.js from next.config.js", () => {
    const result = detectTechStack(["next.config.js", "package.json"]);
    expect(result.some(t => t.name === "Next.js" && t.category === "framework")).toBe(true);
  });

  it("detects Docker from Dockerfile", () => {
    const result = detectTechStack(["Dockerfile"]);
    expect(result.some(t => t.name === "Docker" && t.category === "infra")).toBe(true);
  });

  it("detects Tailwind CSS from tailwind.config.js", () => {
    const result = detectTechStack(["tailwind.config.js"]);
    expect(result.some(t => t.name === "Tailwind CSS")).toBe(true);
  });

  it("detects GitHub Actions from workflow files", () => {
    const result = detectTechStack([".github/workflows/ci.yml"]);
    expect(result.some(t => t.name === "GitHub Actions")).toBe(true);
  });

  it("detects Django from manage.py", () => {
    const result = detectTechStack(["manage.py", "requirements.txt"]);
    expect(result.some(t => t.name === "Django" && t.category === "framework")).toBe(true);
  });

  it("detects Prisma from schema.prisma", () => {
    const result = detectTechStack(["prisma/schema.prisma"]);
    expect(result.some(t => t.name === "Prisma (PostgreSQL)" && t.category === "database")).toBe(true);
  });

  it("downgrades Node.js to tool when a server language is present", () => {
    const result = detectTechStack(["package.json", "composer.json", "artisan"]);
    const node = result.find(t => t.name === "Node.js");
    expect(node?.category).toBe("tool");
    expect(node?.confidence).toBeLessThan(50);
  });

  it("keeps Node.js as runtime when it is the primary backend", () => {
    const result = detectTechStack(["package.json", "server.js"]);
    const node = result.find(t => t.name === "Node.js");
    expect(node?.category).toBe("runtime");
  });

  it("sorts by confidence descending", () => {
    const result = detectTechStack(["package.json", "tsconfig.json", "next.config.js", ".env.example"]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].confidence).toBeLessThanOrEqual(result[i - 1].confidence);
    }
  });

  it("deduplicates technologies", () => {
    const result = detectTechStack(["src/app.php", "routes/web.php", "artisan"]);
    const phpEntries = result.filter(t => t.name === "PHP");
    expect(phpEntries.length).toBe(1);
  });

  it("returns empty array for no files", () => {
    expect(detectTechStack([])).toEqual([]);
  });

  it("detects a full Laravel stack", () => {
    const files = [
      "artisan", "composer.json", "package.json", "vite.config.js",
      "tailwind.config.js", "resources/views/livewire/dashboard.blade.php",
      "config/livewire.php", "config/horizon.php", "Dockerfile",
      ".github/workflows/deploy.yml", "phpunit.xml",
    ];
    const result = detectTechStack(files);
    const names = result.map(t => t.name);
    expect(names).toContain("Laravel");
    expect(names).toContain("PHP");
    expect(names).toContain("Livewire");
    expect(names).toContain("Tailwind CSS");
    expect(names).toContain("Docker");
  });
});
