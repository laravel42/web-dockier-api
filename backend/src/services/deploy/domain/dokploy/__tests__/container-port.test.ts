import { describe, expect, it, vi } from "vitest";

// configure-app imports the mapping layer, which pulls in the Supabase client and
// reads config at module load. Stub it out — these are pure-function tests.
vi.mock("../mappings.js", () => ({
  getApplication: vi.fn(async () => null),
  upsertApplication: vi.fn(async () => undefined),
  deleteApplicationMapping: vi.fn(async () => undefined),
}));

const { resolveContainerPort } = await import("../stages/configure-app.js");

/**
 * Container-port resolution decides which port Traefik forwards a domain to.
 * Getting it wrong is the classic Bad Gateway — the build succeeds, the
 * container runs, and every request 502s because Traefik points at a port
 * nothing is listening on.
 *
 * The case that regressed: a source-only Vite/Astro/Angular SPA. Railpack
 * builds it and serves the output over Caddy on port 80, but `isNodeApp`
 * treats "written in TypeScript" as "runs a Node server" and returned 3000.
 * The `kind` argument from the repo analyzer is what disambiguates.
 */
describe("resolveContainerPort", () => {
  describe("railpack + static bundle → 80", () => {
    it("routes a TypeScript Vite SPA to 80, not the Node port", () => {
      expect(resolveContainerPort("railpack", "typescript", ["Vite", "React"], "static")).toBe(80);
    });

    it("routes an Astro static site to 80", () => {
      expect(resolveContainerPort("railpack", "javascript", ["Astro"], "static")).toBe(80);
    });

    it("routes an Angular SPA to 80", () => {
      expect(resolveContainerPort("railpack", "typescript", ["Angular"], "static")).toBe(80);
    });

    it("prefers kind over the tech stack when they disagree", () => {
      // Every entry here would make isNodeApp true; kind must still win.
      expect(resolveContainerPort("railpack", "typescript", ["Node.js", "Vite", "Astro"], "static")).toBe(80);
    });
  });

  describe("railpack + Node server → 3000", () => {
    it("routes an SSR Astro app to the Node port", () => {
      expect(resolveContainerPort("railpack", "javascript", ["Astro"], "server")).toBe(3000);
    });

    it("routes an Express API to the Node port", () => {
      expect(resolveContainerPort("railpack", "typescript", ["Express"], "server")).toBe(3000);
    });

    it("routes Nuxt SSR to the Node port", () => {
      expect(resolveContainerPort("railpack", "typescript", ["Nuxt"], "server")).toBe(3000);
    });
  });

  describe("railpack + PHP → 80", () => {
    it("routes Laravel to 80 (FrankenPHP)", () => {
      expect(resolveContainerPort("railpack", "php", ["Laravel"], "server")).toBe(80);
    });

    it("routes PHP to 80 even without a kind", () => {
      expect(resolveContainerPort("railpack", "php", ["Laravel"])).toBe(80);
    });
  });

  describe("nixpacks", () => {
    it("routes PHP to 80 — nixpacks serves it behind nginx", () => {
      expect(resolveContainerPort("nixpacks", "php", ["Laravel"])).toBe(80);
    });

    it("routes non-PHP to Dokploy's conventional 3000", () => {
      expect(resolveContainerPort("nixpacks", "python", ["Django"])).toBe(3000);
    });
  });

  describe("other build types", () => {
    it("routes dockerfile builds to 3000 — the image owns its own port", () => {
      expect(resolveContainerPort("dockerfile", "typescript", ["Node.js"], "server")).toBe(3000);
    });

    it("routes dockerfile builds to 3000 even for a static kind", () => {
      // A Dockerfile's EXPOSE is authoritative; kind must not override it.
      expect(resolveContainerPort("dockerfile", "typescript", ["Vite"], "static")).toBe(3000);
    });
  });

  describe("without kind (analysis unavailable)", () => {
    it("falls back to language inference for Node", () => {
      expect(resolveContainerPort("railpack", "typescript", ["Vite"])).toBe(3000);
    });

    it("falls back to 80 for an unrecognized language", () => {
      expect(resolveContainerPort("railpack", "ruby", ["Rails"])).toBe(80);
    });

    it("treats an undefined language with no stack as non-Node", () => {
      expect(resolveContainerPort("railpack", undefined, [])).toBe(80);
    });
  });
});
