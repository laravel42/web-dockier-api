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

  it("stays quiet for a Laravel repo with a local-dev compose file", () => {
    expect(detectMultiService([
      "composer.json",
      "docker-compose.yml",
      "config/database.php",
    ])).toBeNull();
  });

  it("stays quiet for a Django repo with a local-dev compose file", () => {
    expect(detectMultiService([
      "manage.py",
      "requirements.txt",
      "docker-compose.yml",
      "myapp/settings.py",
    ])).toBeNull();
  });

  it("stays quiet for a yarn workspace of one app plus shared libs", () => {
    expect(detectMultiService([
      "package.json",
      "yarn.lock",
      "apps/web/package.json",
      "apps/web/next.config.js",
      "packages/ui/package.json",
    ])).toBeNull();
  });

  it("stays quiet for an npm workspace root", () => {
    expect(detectMultiService([
      "package.json",
      "package-lock.json",
      "apps/web/package.json",
      "apps/web/next.config.js",
      "packages/ui/package.json",
    ])).toBeNull();
  });

  it("flags an npm workspace holding two apps", () => {
    const hint = detectMultiService([
      "package.json",
      "package-lock.json",
      "apps/web/package.json",
      "apps/api/package.json",
    ]);
    expect(hint).not.toBeNull();
    expect(hint!.serviceDirs).toEqual(["apps/api", "apps/web"]);
    expect(hint!.composeFile).toBeUndefined();
  });

  it("flags a compose file beside Dockerfiles in two directories with no recognised manifest", () => {
    const hint = detectMultiService([
      "docker-compose.yml",
      "api/Dockerfile",
      "api/Cargo.toml",
      "web/Dockerfile",
      "web/pom.xml",
    ]);
    expect(hint).not.toBeNull();
    expect(hint!.composeFile).toBe("docker-compose.yml");
    expect(hint!.serviceDirs).toEqual(["api", "web"]);
  });

  it("stays quiet for a single app whose compose file builds a root Dockerfile and a sidecar", () => {
    expect(detectMultiService([
      "docker-compose.yml",
      "Dockerfile",
      "composer.json",
      "docker/nginx/Dockerfile",
    ])).toBeNull();
  });

  it("stays quiet for a cookiecutter-django app whose Dockerfiles live under compose/", () => {
    expect(detectMultiService([
      "docker-compose.local.yml",
      "docker-compose.production.yml",
      "manage.py",
      "requirements.txt",
      "compose/local/django/Dockerfile",
      "compose/local/docs/Dockerfile",
      "compose/production/django/Dockerfile",
      "compose/production/nginx/Dockerfile",
    ])).toBeNull();
  });

  it("stays quiet for one app whose Dockerfile assets are nested under it", () => {
    expect(detectMultiService([
      "docker-compose.yml",
      "backend/pyproject.toml",
      "backend/docker/api/Dockerfile",
      "backend/docker/worker/Dockerfile",
    ])).toBeNull();
  });

  it("keeps the manifest directory when the Dockerfile fallback fires", () => {
    const hint = detectMultiService([
      "docker-compose.yml",
      "composer.json",
      "api/Dockerfile",
      "web/Dockerfile",
    ]);
    expect(hint).not.toBeNull();
    expect(hint!.serviceDirs).toEqual(["", "api", "web"]);
  });

  it("flags a compose file beside two real service directories", () => {
    const hint = detectMultiService([
      "docker-compose.yml",
      "api/manage.py",
      "api/requirements.txt",
      "web/package.json",
      "web/next.config.js",
    ]);
    expect(hint).not.toBeNull();
    expect(hint!.composeFile).toBe("docker-compose.yml");
    expect(hint!.serviceDirs).toEqual(["api", "web"]);
  });
});
