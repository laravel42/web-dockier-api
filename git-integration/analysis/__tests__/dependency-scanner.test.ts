import { describe, it, expect, vi } from "vitest";

// We test the parsing functions by importing the module and checking the output
// The vulnerability check (OSV.dev) is mocked since it's an external API

describe("dependency-scanner parsing", () => {
  describe("package.json parsing", () => {
    it("extracts production and dev dependencies", async () => {
      const { scanDependencies } = await import("../dependency-scanner");

      // Mock fetch to avoid real OSV calls
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as any;

      try {
        const result = await scanDependencies({
          "package.json": JSON.stringify({
            dependencies: { react: "^18.2.0", "next": "14.0.0" },
            devDependencies: { typescript: "^5.0.0", vitest: "^1.0.0" },
          }),
        });

        expect(result.length).toBe(4);
        expect(result.filter(d => d.type === "production").length).toBe(2);
        expect(result.filter(d => d.type === "dev").length).toBe(2);
        expect(result.every(d => d.ecosystem === "npm")).toBe(true);
        expect(result.find(d => d.name === "react")?.version).toBe("18.2.0");
        expect(result.find(d => d.name === "react")?.repoUrl).toBe("https://www.npmjs.com/package/react");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("composer.json parsing", () => {
    it("extracts PHP dependencies and skips php/ext-* entries", async () => {
      const { scanDependencies } = await import("../dependency-scanner");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as any;

      try {
        const result = await scanDependencies({
          "composer.json": JSON.stringify({
            require: {
              php: "^8.2",
              "ext-mbstring": "*",
              "laravel/framework": "^11.0",
              "stripe/stripe-php": "^13.0",
            },
            "require-dev": {
              "phpunit/phpunit": "^10.0",
            },
          }),
        });

        expect(result.every(d => d.ecosystem === "composer")).toBe(true);
        expect(result.some(d => d.name === "php")).toBe(false);
        expect(result.some(d => d.name === "ext-mbstring")).toBe(false);
        expect(result.some(d => d.name === "laravel/framework")).toBe(true);
        expect(result.find(d => d.name === "phpunit/phpunit")?.type).toBe("dev");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("requirements.txt parsing", () => {
    it("extracts Python dependencies", async () => {
      const { scanDependencies } = await import("../dependency-scanner");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as any;

      try {
        const result = await scanDependencies({
          "requirements.txt": "django==4.2.0\nflask>=2.0\nrequests\n# comment\n-r base.txt\n",
        });

        expect(result.every(d => d.ecosystem === "pip")).toBe(true);
        expect(result.some(d => d.name === "django")).toBe(true);
        expect(result.some(d => d.name === "flask")).toBe(true);
        expect(result.some(d => d.name === "requests")).toBe(true);
        expect(result.some(d => d.name === "# comment")).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("deduplication", () => {
    it("deduplicates dependencies across files", async () => {
      const { scanDependencies } = await import("../dependency-scanner");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }) as any;

      try {
        const result = await scanDependencies({
          "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
          "other/package.json": JSON.stringify({ dependencies: { react: "^18.2.0" } }),
        });

        const reactEntries = result.filter(d => d.name === "react");
        expect(reactEntries.length).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("empty input", () => {
    it("returns empty array for no config files", async () => {
      const { scanDependencies } = await import("../dependency-scanner");
      const result = await scanDependencies({});
      expect(result).toEqual([]);
    });
  });
});
