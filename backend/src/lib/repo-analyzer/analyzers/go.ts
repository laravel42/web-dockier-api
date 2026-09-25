import type { RepoConfig } from "../types.js";
import type { RepoFiles } from "../repo-files.js";
import { joinPath } from "../repo-files.js";

export function analyzeGoProject(files: RepoFiles, appDir: string, config: RepoConfig) {
  config.runtime = "go";
  config.packageManager = "go";

  const goMod = files.read(joinPath(appDir, "go.mod"));
  if (goMod !== null) {
    const verMatch = goMod.match(/^go\s+(\d+\.\d+)/m);
    if (verMatch) {
      config.goVersion = verMatch[1];
      config.runtimeVersion = verMatch[1];
    }
  }

  if (!config.goVersion) {
    config.goVersion = "1.22";
    config.runtimeVersion = "1.22";
  }

  config.port = 8080;
  config.buildCommand = "go build -o app .";
  config.startCommand = "./app";
}
