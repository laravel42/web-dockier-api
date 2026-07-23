import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "../types.js";

export function analyzePythonProject(appDir: string, config: RepoConfig) {
  config.runtime = "python";
  config.packageManager = "pip";

  if (existsSync(join(appDir, "manage.py"))) {
    config.framework = "django";
    config.port = 8000;
  }

  const pyprojectPath = join(appDir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8");
      const pyVerMatch = content.match(/requires-python\s*=\s*["']>=?(\d+\.\d+)/);
      if (pyVerMatch) config.pythonVersion = pyVerMatch[1];
      if (content.includes("django")) { config.framework = "django"; config.port = 8000; }
      else if (content.includes("fastapi")) { config.framework = "fastapi"; config.port = 8000; }
      else if (content.includes("flask")) { config.framework = "flask"; config.port = 5000; }
    } catch {}
  }

  const reqPath = join(appDir, "requirements.txt");
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, "utf-8");
      if (content.includes("Django") || content.includes("django")) { config.framework = "django"; config.port = 8000; }
      else if (content.includes("fastapi")) { config.framework = "fastapi"; config.port = 8000; }
      else if (content.includes("flask") || content.includes("Flask")) { config.framework = "flask"; config.port = 5000; }
      if (content.includes("gunicorn")) config.startCommand = "gunicorn";
      if (content.includes("uvicorn")) config.startCommand = "uvicorn";
    } catch {}
  }

  const runtimePath = join(appDir, "runtime.txt");
  if (existsSync(runtimePath)) {
    try {
      const v = readFileSync(runtimePath, "utf-8").trim();
      const match = v.match(/python-(\d+\.\d+)/);
      if (match) config.pythonVersion = match[1];
    } catch {}
  }

  config.runtimeVersion = config.pythonVersion || "3.12";
  if (!config.pythonVersion) config.pythonVersion = "3.12";
}
