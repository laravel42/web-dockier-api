import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types";
import { NATIVE_DEPS_MAP } from "../constants";
import { cleanVersion } from "../utils";

export function analyzePhpProject(appDir: string, config: RepoConfig) {
  let composer: any;
  try {
    composer = JSON.parse(readFileSync(join(appDir, "composer.json"), "utf-8"));
  } catch { return; }

  config.runtime = "php";
  config.packageManager = "composer";

  const phpReq = composer?.require?.["php"];
  if (typeof phpReq === "string") {
    const matches = [...phpReq.matchAll(/(\d+)\.(\d+)/g)];
    if (matches.length > 0) {
      const versions = matches.map(m => ({ major: parseInt(m[1]), minor: parseInt(m[2]) }));
      const min = versions.reduce((a, b) => (a.major * 100 + a.minor < b.major * 100 + b.minor ? a : b));
      config.phpVersion = `${min.major}.${min.minor}`;
      config.runtimeVersion = config.phpVersion;
    }
  }
  if (!config.phpVersion) {
    config.phpVersion = "8.4";
    config.runtimeVersion = "8.4";
  }

  const extensions = new Set<string>();
  for (const section of [composer.require, composer["require-dev"]]) {
    if (!section) continue;
    for (const key of Object.keys(section)) {
      if (key.startsWith("ext-")) {
        const ext = key.replace("ext-", "");
        extensions.add(ext);
        if (NATIVE_DEPS_MAP[key]) {
          config.nativeDeps.push({ name: key, ...NATIVE_DEPS_MAP[key] });
        }
      }
    }
  }

  try {
    const lock = JSON.parse(readFileSync(join(appDir, "composer.lock"), "utf-8"));
    for (const pkg of [...(lock.packages || []), ...(lock["packages-dev"] || [])]) {
      if (!pkg.require) continue;
      for (const dep of Object.keys(pkg.require)) {
        if (dep.startsWith("ext-")) {
          const ext = dep.replace("ext-", "");
          if (!extensions.has(ext)) {
            extensions.add(ext);
            if (NATIVE_DEPS_MAP[`ext-${ext}`] && !config.nativeDeps.some(d => d.name === `ext-${ext}`)) {
              config.nativeDeps.push({ name: `ext-${ext}`, ...NATIVE_DEPS_MAP[`ext-${ext}`] });
            }
          }
        }
      }
    }
  } catch {}

  if (composer.require?.["laravel/framework"]) {
    for (const ext of ["zip", "intl", "bcmath", "pcntl", "pdo_mysql", "pdo_pgsql", "gd", "redis"]) {
      extensions.add(ext);
    }
  }

  config.phpExtensions = [...extensions];

  if (composer.require?.["laravel/framework"]) {
    config.framework = "Laravel";
    config.frameworkVersion = cleanVersion(composer.require["laravel/framework"]);
    config.port = 80;
    config.buildCommand = "composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache && php artisan view:cache";
    config.startCommand = "/usr/bin/supervisord -c /etc/supervisor/conf.d/app.conf";
    if (composer.require?.["laravel/horizon"]) config.features.add("queue-worker");
    if (composer.require?.["laravel/reverb"] || composer.require?.["beyondcode/laravel-websockets"]) config.features.add("websockets");
    if (composer.require?.["laravel/octane"]) {
      config.features.add("octane");
      config.startCommand = "php artisan octane:start --host=0.0.0.0 --port=8080";
    }
    if (existsSync(join(appDir, "app/Console/Kernel.php"))) config.features.add("scheduler");
  } else if (composer.require?.["symfony/framework-bundle"]) {
    config.framework = "Symfony";
    config.frameworkVersion = cleanVersion(composer.require["symfony/framework-bundle"]);
    config.port = 8080;
  } else if (composer.require?.["craftcms/cms"]) {
    config.framework = "Craft CMS";
    config.port = 8080;
  }

  if (composer.scripts) {
    config.composerScripts = Object.keys(composer.scripts);
  }

  if (existsSync(join(appDir, "package.json"))) {
    config.features.add("node-assets");
    if (existsSync(join(appDir, "pnpm-lock.yaml"))) config.features.add("node-pm-pnpm");
    else if (existsSync(join(appDir, "yarn.lock"))) config.features.add("node-pm-yarn");
  }
}
