import { describe, expect, it } from "vitest";
import { detectMultiService } from "../multi-service.js";

describe("detectMultiService", () => {
  it("flags a compose-based multi-service monorepo (Zadigo/mycommerce layout)", () => {
    const files = [
      "docker-compose.yml",
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "frontends/admin/nuxt.config.ts",
      "frontends/admin/package.json",
      "frontends/mainsite/nuxt.config.ts",
      "frontends/mainsite/package.json",
      "frontends/mobile/package.json",
      "services/shopapi/manage.py",
      "services/shopapi/pyproject.toml",
      "services/shopapi/Dockerfile",
      "services/cartapi/manage.py",
      "services/cartapi/pyproject.toml",
      "services/cartapi/Dockerfile",
      "services/gopurchase/go.mod",
      "services/gopurchase/Dockerfile",
    ];

    const hint = detectMultiService(files);
    expect(hint).not.toBeNull();
    expect(hint!.composeFile).toBe("docker-compose.yml");
    expect(hint!.serviceDirs).toContain("frontends/mainsite");
    expect(hint!.serviceDirs).toContain("services/shopapi");
    expect(hint!.serviceDirs.length).toBeGreaterThanOrEqual(2);
  });

  it("flags a backend+frontend split with no compose file", () => {
    const hint = detectMultiService([
      "frontends/x/nuxt.config.ts",
      "frontends/x/package.json",
      "services/y/manage.py",
      "services/y/requirements.txt",
    ]);
    expect(hint).not.toBeNull();
    expect(hint!.composeFile).toBeUndefined();
    expect(hint!.serviceDirs).toEqual(["frontends/x", "services/y"]);
  });

  it("stays quiet for a single-app repo", () => {
    expect(detectMultiService([
      "package.json",
      "pnpm-lock.yaml",
      "vite.config.ts",
      "src/main.tsx",
    ])).toBeNull();
  });

  it("stays quiet for an ordinary pnpm workspace of one app plus shared libs", () => {
    expect(detectMultiService([
      "package.json",
      "pnpm-workspace.yaml",
      "apps/web/package.json",
      "apps/web/next.config.js",
      "packages/ui/package.json",
      "packages/utils/package.json",
    ])).toBeNull();
  });

  it("stays quiet for a Laravel repo with a root asset package.json", () => {
    expect(detectMultiService([
      "composer.json",
      "package.json",
      "config/database.php",
    ])).toBeNull();
  });

  it("ignores a compose file inside a vendored directory", () => {
    expect(detectMultiService([
      "composer.json",
      "vendor/foo/docker-compose.yml",
    ])).toBeNull();
  });
});
