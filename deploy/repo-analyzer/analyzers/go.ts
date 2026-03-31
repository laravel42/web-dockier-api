import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types";

export function analyzeGoProject(appDir: string, config: RepoConfig) {
  config.runtime = "go";
  config.packageManager = "go";

  try {
    const goMod = readFileSync(join(appDir, "go.mod"), "utf-8");
    const verMatch = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (verMatch) {
      config.goVersion = verMatch[1];
      config.runtimeVersion = verMatch[1];
    }
  } catch {}

  if (!config.goVersion) {
    config.goVersion = "1.22";
    config.runtimeVersion = "1.22";
  }

  config.port = 8080;
  config.buildCommand = "go build -o app .";
  config.startCommand = "./app";
}
